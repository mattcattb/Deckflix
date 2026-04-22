import {randomUUID} from "node:crypto";
import type {
  ActiveGameQueueItem,
  GameStatus,
  PlayerSession,
  SwipeChoice,
} from "@deckflix/shared";
import {BadRequestException} from "../common/errors";
import * as GamePoolService from "../games/game-pool.service";
import * as GameSettingsService from "../settings/game-settings.service";
import * as GameRedisService from "../games/game-redis.service";
import * as GamePresenceService from "../ws/presence.ws";
import * as SwipeLedgerService from "./swipe-ledger.service";
import * as SwipeQueueService from "./swipe-queue.service";
import * as RoomMetaService from "../rooms/room-meta.service";
import * as RoomSessionService from "../rooms/room-session.service";
import {publishDisplayMessage, publishPlayerMessage} from "../ws/topics";

type RealtimeServer = {publish: (topic: string, payload: string) => void};

export const PLAYER_QUEUE_TARGET = 3;
export const PLAYER_QUEUE_REFILL_THRESHOLD = 1;

export const getSwipeState = async (player: {gameCode: string; playerId: string}) => {
  const {getPlayerGameState} = await import("../games/game-snapshot.service");
  return getPlayerGameState(player);
};

const hydrateAssignment = async (
  gameCode: string,
  assignment: SwipeQueueService.PlayerCurrentAssignment,
): Promise<ActiveGameQueueItem> => {
  const movieRecord = await GameRedisService.getMovieRecordOrThrow(
    gameCode,
    assignment.movieId,
  );
  return {
    assignmentId: assignment.assignmentId,
    movie: movieRecord.movie,
    order: assignment.order,
  };
};

const listAssignableEntries = async (
  gameCode: string,
  playerId: string,
): Promise<SwipeQueueService.PlayerQueueEntry[]> => {
  const [poolEntries, seenMovieIds, queuedEntries, currentAssignment] =
    await Promise.all([
      GamePoolService.getPoolEntries(gameCode),
      SwipeQueueService.getPlayerSeenMovieIds(gameCode, playerId),
      SwipeQueueService.getPlayerQueueEntries(gameCode, playerId),
      SwipeQueueService.getPlayerCurrentAssignment(gameCode, playerId),
    ]);

  const excludedMovieIds = new Set<string>(seenMovieIds);
  for (const entry of queuedEntries) {
    excludedMovieIds.add(entry.movieId);
  }
  if (currentAssignment) {
    excludedMovieIds.add(currentAssignment.movieId);
  }

  const results: SwipeQueueService.PlayerQueueEntry[] = [];
  for (const entry of poolEntries) {
    if (excludedMovieIds.has(entry.movieId)) {
      continue;
    }

    const movieRecord = await GameRedisService.getMovieRecordOrThrow(
      gameCode,
      entry.movieId,
    );
    if (movieRecord.status !== "pending") {
      continue;
    }

    results.push(entry);
  }

  return results;
};

export const refillPlayerQueue = async (
  gameCode: string,
  playerId: string,
  targetDepth = PLAYER_QUEUE_TARGET,
) => {
  await GamePoolService.maybeRefillPool({gameCode});

  const queueLength = await SwipeQueueService.getPlayerQueueLength(gameCode, playerId);
  if (queueLength >= targetDepth) {
    return;
  }

  const candidates = await listAssignableEntries(gameCode, playerId);
  const needed = Math.max(0, targetDepth - queueLength);
  if (needed === 0) {
    return;
  }

  await SwipeQueueService.pushPlayerQueueEntries(
    gameCode,
    playerId,
    candidates.slice(0, needed),
  );
};

export const getCurrentMovie = async (
  gameCode: string,
  playerId: string,
): Promise<ActiveGameQueueItem | null> => {
  const current = await SwipeQueueService.getPlayerCurrentAssignment(gameCode, playerId);
  if (!current) {
    return null;
  }

  return hydrateAssignment(gameCode, current);
};

export const getCurrentOrNextMovie = async (
  gameCode: string,
  playerId: string,
): Promise<ActiveGameQueueItem | null> => {
  const current = await SwipeQueueService.getPlayerCurrentAssignment(gameCode, playerId);
  if (current) {
    return hydrateAssignment(gameCode, current);
  }

  const queueLength = await SwipeQueueService.getPlayerQueueLength(gameCode, playerId);
  if (queueLength === 0) {
    await refillPlayerQueue(gameCode, playerId);
  }

  const nextEntry = await SwipeQueueService.popPlayerQueueEntry(gameCode, playerId);
  if (!nextEntry) {
    return null;
  }

  const assignment: SwipeQueueService.PlayerCurrentAssignment = {
    assignmentId: randomUUID(),
    movieId: nextEntry.movieId,
    order: nextEntry.order,
    issuedAt: new Date().toISOString(),
  };
  await SwipeQueueService.setPlayerCurrentAssignment(gameCode, playerId, assignment);

  const remainingQueueLength = await SwipeQueueService.getPlayerQueueLength(
    gameCode,
    playerId,
  );
  if (remainingQueueLength <= PLAYER_QUEUE_REFILL_THRESHOLD) {
    await refillPlayerQueue(gameCode, playerId);
  }

  return hydrateAssignment(gameCode, assignment);
};

export const getPlayerCurrentIndex = async (gameCode: string, playerId: string) =>
  SwipeQueueService.getPlayerSeenCount(gameCode, playerId);

export const getPlayerRemainingCount = async (gameCode: string, playerId: string) => {
  const [current, queueEntries, assignableEntries] = await Promise.all([
    SwipeQueueService.getPlayerCurrentAssignment(gameCode, playerId),
    SwipeQueueService.getPlayerQueueEntries(gameCode, playerId),
    listAssignableEntries(gameCode, playerId),
  ]);

  return queueEntries.length + assignableEntries.length + (current ? 1 : 0);
};

export const isPlayerCompleted = async (gameCode: string, playerId: string) => {
  const [current, queueEntries, assignableEntries] = await Promise.all([
    SwipeQueueService.getPlayerCurrentAssignment(gameCode, playerId),
    SwipeQueueService.getPlayerQueueEntries(gameCode, playerId),
    listAssignableEntries(gameCode, playerId),
  ]);

  return !current && queueEntries.length === 0 && assignableEntries.length === 0;
};

export const areAllPlayersCompleted = async (gameCode: string) => {
  const playerIds = await GameRedisService.listPlayerIds(gameCode);
  if (playerIds.length === 0) {
    return false;
  }

  const completions = await Promise.all(
    playerIds.map((playerId) => isPlayerCompleted(gameCode, playerId)),
  );

  return completions.every(Boolean);
};

const getPositiveVotes = (movieRecord: GameRedisService.MovieRecord) =>
  movieRecord.likeCount + movieRecord.superLikeCount;

const incrementVoteCounts = (
  movieRecord: GameRedisService.MovieRecord,
  choice: SwipeChoice,
): GameRedisService.MovieRecord => {
  const nextRecord = {
    ...movieRecord,
    totalVotes: movieRecord.totalVotes + 1,
  };

  if (choice === "like") nextRecord.likeCount += 1;
  if (choice === "dislike") nextRecord.dislikeCount += 1;
  if (choice === "maybe") nextRecord.maybeCount += 1;
  if (choice === "super_like") nextRecord.superLikeCount += 1;
  if (choice === "skip") nextRecord.skipCount += 1;

  return nextRecord;
};

const determineMovieStatus = async (
  gameCode: string,
  movieRecord: GameRedisService.MovieRecord,
): Promise<GameRedisService.MovieStatus> => {
  if (movieRecord.status === "matched") {
    return "matched";
  }

  const settings = await GameSettingsService.getGameSettingsOrThrow(gameCode);
  if (getPositiveVotes(movieRecord) >= settings.minLikesToMatch) {
    return "matched";
  }

  const playerIds = await GameRedisService.listPlayerIds(gameCode);
  if (playerIds.length === 0 || movieRecord.totalVotes === 0) {
    return "pending";
  }

  const seenStates = await Promise.all(
    playerIds.map((playerId) =>
      SwipeQueueService.hasPlayerSeenMovie(gameCode, playerId, movieRecord.movie.id),
    ),
  );

  return seenStates.every(Boolean) ? "rejected" : "pending";
};

export const refreshMovieOutcome = async (gameCode: string, movieId: string) => {
  const movieRecord = await GameRedisService.getMovieRecordOrThrow(gameCode, movieId);
  const nextStatus = await determineMovieStatus(gameCode, movieRecord);
  const justMatched =
    movieRecord.status !== "matched" && nextStatus === "matched";

  if (movieRecord.status !== nextStatus) {
    await GameRedisService.setMovieRecord(gameCode, movieId, {
      ...movieRecord,
      status: nextStatus,
    });
  }

  await SwipeLedgerService.syncMovieOutcomeSets(gameCode, movieId, nextStatus);
  return {justMatched, status: nextStatus};
};

export const recalculateMovieOutcomes = async (gameCode: string) => {
  const poolEntries = await GamePoolService.getPoolEntries(gameCode);

  for (const entry of poolEntries) {
    await refreshMovieOutcome(gameCode, entry.movieId);
  }
};

const recordMovieVote = async (input: {
  gameCode: string;
  movieId: string;
  playerId: string;
  choice: SwipeChoice;
}) => {
  const existingVote = await SwipeLedgerService.getPlayerVote(
    input.gameCode,
    input.movieId,
    input.playerId,
  );
  if (existingVote) {
    throw new BadRequestException("Vote already recorded for this movie");
  }

  await SwipeLedgerService.setPlayerVote(
    input.gameCode,
    input.movieId,
    input.playerId,
    input.choice,
  );

  const movieRecord = await GameRedisService.getMovieRecordOrThrow(
    input.gameCode,
    input.movieId,
  );
  const nextRecord = incrementVoteCounts(movieRecord, input.choice);
  await GameRedisService.setMovieRecord(input.gameCode, input.movieId, nextRecord);

  return refreshMovieOutcome(input.gameCode, input.movieId);
};

export const syncRoomStatus = async (gameCode: string) => {
  const meta = await RoomMetaService.getGameMetaOrThrow(gameCode);
  if (meta.status === "completed") {
    return meta;
  }

  const playerIds = await GameRedisService.listPlayerIds(gameCode);
  let nextStatus: GameStatus = meta.status;

  if (playerIds.length < 2) {
    nextStatus = "lobby";
  } else if (await areAllPlayersCompleted(gameCode)) {
    nextStatus = "completed";
  } else {
    nextStatus = "swiping";
  }

  if (nextStatus === meta.status) {
    return meta;
  }

  if (nextStatus === "completed" && meta.endedAt) {
    return meta;
  }

  const nextMeta = {
    ...meta,
    status: nextStatus,
    endedAt:
      nextStatus === "completed"
        ? (meta.endedAt ?? new Date().toISOString())
        : null,
  };

  await RoomMetaService.setGameMeta(gameCode, nextMeta);
  return nextMeta;
};

const publishStateForGame = async (server: RealtimeServer, gameCode: string) => {
  const playerIds = await GameRedisService.listPlayerIds(gameCode);
  GamePresenceService.publishRoomState(server, gameCode, playerIds);
};

export const publishState = publishStateForGame;

const publishVoteRecorded = (input: {
  server: RealtimeServer;
  gameCode: string;
  playerId: string;
  movieId: string;
  choice: SwipeChoice;
}) => {
  publishPlayerMessage(input.server as never, input.gameCode, input.playerId, {
    type: "player.vote_recorded",
    payload: {
      movieId: input.movieId,
      choice: input.choice,
    },
  });
};

const publishMatchFound = (
  server: RealtimeServer,
  gameCode: string,
  movieId: string,
) => {
  publishDisplayMessage(server as never, gameCode, {
    type: "display.match_found",
    payload: {movieId},
  });
};

const publishPlayerMatch = (
  server: RealtimeServer,
  gameCode: string,
  playerId: string,
  movieId: string,
) => {
  publishPlayerMessage(server as never, gameCode, playerId, {
    type: "player.match_found",
    payload: {movieId},
  });
};

const publishPlayerLeft = (
  server: RealtimeServer,
  gameCode: string,
  playerId: string,
) => {
  publishDisplayMessage(server as never, gameCode, {
    type: "display.player_left",
    payload: {playerId},
  });
};

export const recordSwipe = async (input: {
  player: PlayerSession;
  assignmentId: string;
  movieId: string;
  choice: SwipeChoice;
  server: RealtimeServer;
}) => {
  const result = await GameRedisService.withGameLock(input.player.gameCode, async () => {
    await RoomSessionService.verifyPlayerSession(input.player);

    const playerIds = await GameRedisService.listPlayerIds(input.player.gameCode);
    if (playerIds.length < 2) {
      throw new BadRequestException("Need at least 2 players before voting");
    }

    const settings = await GameSettingsService.getGameSettingsOrThrow(input.player.gameCode);
    if (!settings.allowMaybe && input.choice === "maybe") {
      throw new BadRequestException("Maybe votes are disabled in this game");
    }

    if (!settings.allowSuperLike && input.choice === "super_like") {
      throw new BadRequestException("Super likes are disabled in this game");
    }

    const currentAssignment = await SwipeQueueService.getPlayerCurrentAssignment(
      input.player.gameCode,
      input.player.playerId,
    );

    if (!currentAssignment) {
      throw new BadRequestException("No active movie assignment");
    }

    if (currentAssignment.assignmentId !== input.assignmentId) {
      throw new BadRequestException("Vote does not match the active assignment");
    }

    if (currentAssignment.movieId !== input.movieId) {
      throw new BadRequestException("Vote does not match the assigned movie");
    }

    const {justMatched} = await recordMovieVote({
      gameCode: input.player.gameCode,
      movieId: input.movieId,
      playerId: input.player.playerId,
      choice: input.choice,
    });

    await SwipeQueueService.markPlayerSeenMovie(
      input.player.gameCode,
      input.player.playerId,
      input.movieId,
    );
    await SwipeQueueService.clearPlayerCurrentAssignment(
      input.player.gameCode,
      input.player.playerId,
    );
    await getCurrentOrNextMovie(input.player.gameCode, input.player.playerId);
    await syncRoomStatus(input.player.gameCode);
    await GameRedisService.touchRoomKeys(input.player.gameCode);

    return {
      movieId: input.movieId,
      choice: input.choice,
      justMatched,
    };
  });

  const state = await getSwipeState({
    gameCode: input.player.gameCode,
    playerId: input.player.playerId,
  });

  publishVoteRecorded({
    server: input.server,
    gameCode: input.player.gameCode,
    playerId: state.me.playerId,
    movieId: result.movieId,
    choice: result.choice,
  });

  if (result.justMatched) {
    publishMatchFound(input.server, input.player.gameCode, result.movieId);
    const playerIds = await GameRedisService.listPlayerIds(input.player.gameCode);
    for (const playerId of playerIds) {
      publishPlayerMatch(input.server, input.player.gameCode, playerId, result.movieId);
    }
  }

  await publishStateForGame(input.server, input.player.gameCode);
  return {
    ...result,
    state,
  };
};

export const leaveSwipe = async (input: {
  player: PlayerSession;
  server: RealtimeServer;
}) => {
  const result = await GameRedisService.withGameLock(input.player.gameCode, async () => {
    await RoomSessionService.verifyPlayerSession(input.player);
    await SwipeQueueService.deleteSwipeState(input.player.gameCode, input.player.playerId);
    await GameRedisService.deletePlayerState(input.player.gameCode, input.player.playerId);
    await recalculateMovieOutcomes(input.player.gameCode);
    await syncRoomStatus(input.player.gameCode);
    await GameRedisService.touchRoomKeys(input.player.gameCode);

    return {
      gameCode: input.player.gameCode.trim().toUpperCase(),
      playerId: input.player.playerId,
    };
  });

  publishPlayerLeft(input.server, result.gameCode, result.playerId);
  await publishStateForGame(input.server, result.gameCode);
  return result;
};

export const openSwipeConnection = GamePresenceService.connectPlayer;
export const closeSwipeConnection = GamePresenceService.disconnectPlayer;
export const subscribeSwipeSocket = GamePresenceService.subscribePlayerSocket;
export const unsubscribeSwipeSocket = GamePresenceService.unsubscribePlayerSocket;
