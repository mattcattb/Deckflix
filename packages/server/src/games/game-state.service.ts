import {randomUUID} from "node:crypto";
import type {
  ActiveGameQueueItem,
  GamePlayerPresence,
  GameStatus,
  PlayerSession,
  SwipeChoice,
} from "@deckflix/shared";
import {BadRequestException, ConflictException} from "../common/errors";
import * as GamePoolService from "./game-pool.service";
import * as GameSettingsService from "../settings/game-settings.service";
import * as GameRedisService from "./game-redis.service";
import * as GameSessionService from "./game-session.service";
import * as SwipeLedgerService from "../swipe/swipe-ledger.service";
import * as SwipeQueueService from "../swipe/swipe-queue.service";
import * as RoomMetaService from "../rooms/room-meta.service";
import * as GameSnapshotService from "./game-snapshot.service";

export const PLAYER_QUEUE_TARGET = 3;
export const PLAYER_QUEUE_REFILL_THRESHOLD = 1;

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

export const clearCurrentAssignment = async (
  gameCode: string,
  playerId: string,
) => {
  await SwipeQueueService.clearPlayerCurrentAssignment(gameCode, playerId);
};

export const markSeen = async (
  gameCode: string,
  playerId: string,
  movieId: string,
) => {
  await SwipeQueueService.markPlayerSeenMovie(gameCode, playerId, movieId);
};

export const getPlayerCurrentIndex = async (
  gameCode: string,
  playerId: string,
) => SwipeQueueService.getPlayerSeenCount(gameCode, playerId);

export const getPlayerRemainingCount = async (
  gameCode: string,
  playerId: string,
) => {
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

  return (
    !current && queueEntries.length === 0 && assignableEntries.length === 0
  );
};

export const getGamePlayerIds = async (gameCode: string) =>
  GameRedisService.listPlayerIds(gameCode);

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

export const refreshMovieOutcome = async (
  gameCode: string,
  movieId: string,
) => {
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

export const joinGame = async (input: {
  gameCode: string;
  displayName: string;
}) => {
  const playerId = randomUUID();
  const sessionToken = randomUUID();
  const joinedAt = new Date().toISOString();

  await GameRedisService.withGameLock(input.gameCode, async () => {
    const meta = await RoomMetaService.getGameMetaOrThrow(input.gameCode);
    if (meta.status === "completed") {
      throw new ConflictException("This room is completed");
    }

    await GameRedisService.setPlayerRecord(input.gameCode, playerId, {
      id: playerId,
      displayName: input.displayName,
      joinedAt,
      sessionToken,
    });

    await refillPlayerQueue(input.gameCode, playerId);
    await getCurrentOrNextMovie(input.gameCode, playerId);
    await syncRoomStatus(input.gameCode);
    await GameRedisService.touchRoomKeys(input.gameCode);
  });

  return {
    gameCode: input.gameCode.trim().toUpperCase(),
    playerSession: {
      gameCode: input.gameCode.trim().toUpperCase(),
      playerId,
      sessionToken,
    },
    player: {
      id: playerId,
      displayName: input.displayName,
      joinedAt,
      connectedAsPlayer: false,
    } satisfies GamePlayerPresence,
  };
};

export const leaveGame = async (player: PlayerSession) =>
  GameRedisService.withGameLock(player.gameCode, async () => {
    await GameSessionService.verifyPlayerSession(player);
    await SwipeQueueService.deleteSwipeState(player.gameCode, player.playerId);
    await GameRedisService.deletePlayerState(player.gameCode, player.playerId);
    await recalculateMovieOutcomes(player.gameCode);
    await syncRoomStatus(player.gameCode);
    await GameRedisService.touchRoomKeys(player.gameCode);

    return {
      gameCode: player.gameCode.trim().toUpperCase(),
      playerId: player.playerId,
    };
  });

export const recordVote = async (input: {
  player: PlayerSession;
  assignmentId: string;
  movieId: string;
  choice: SwipeChoice;
}) => {
  const result = await GameRedisService.withGameLock(input.player.gameCode, async () => {
    await GameSessionService.verifyPlayerSession(input.player);

    const playerIds = await getGamePlayerIds(input.player.gameCode);
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
      throw new BadRequestException(
        "Vote does not match the active assignment",
      );
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

    await markSeen(input.player.gameCode, input.player.playerId, input.movieId);
    await clearCurrentAssignment(input.player.gameCode, input.player.playerId);
    await getCurrentOrNextMovie(input.player.gameCode, input.player.playerId);
    await syncRoomStatus(input.player.gameCode);
    await GameRedisService.touchRoomKeys(input.player.gameCode);

    return {
      movieId: input.movieId,
      choice: input.choice,
      justMatched,
    };
  });

  return {
    movieId: result.movieId,
    choice: result.choice,
    justMatched: result.justMatched,
    state: await GameSnapshotService.getPlayerGameState({
      gameCode: input.player.gameCode,
      playerId: input.player.playerId,
    }),
  };
};
