import {randomUUID} from "node:crypto";
import type {
  ActiveGameQueueItem,
  GamePlayerPresence,
  GameStatus,
  PlayerSession,
  SwipeChoice,
} from "@deckflix/shared";
import {BadRequestException, ConflictException} from "../common/errors";
import {maybeRefillPool} from "./game-pool.service";
import {
  clearPlayerCurrentAssignment,
  deletePlayerState,
  getGameMetaOrThrow,
  getGameSettingsOrThrow,
  getMovieRecordOrThrow,
  getPlayerCurrentAssignment,
  getPlayerQueueEntries,
  getPlayerQueueLength,
  getPlayerSeenCount,
  getPlayerSeenMovieIds,
  getPlayerVote,
  getPoolEntries,
  hasPlayerSeenMovie,
  listPlayerIds,
  markPlayerSeenMovie,
  popPlayerQueueEntry,
  pushPlayerQueueEntries,
  setGameMeta,
  setMovieRecord,
  setPlayerCurrentAssignment,
  setPlayerRecord,
  setPlayerVote,
  syncMovieOutcomeSets,
  touchRoomKeys,
  withGameLock,
  type MovieRecord,
  type MovieStatus,
  type PlayerCurrentAssignment,
  type PlayerQueueEntry,
} from "./game-redis.service";
import {verifyPlayerSession} from "./game-session.service";

export const PLAYER_QUEUE_TARGET = 3;
export const PLAYER_QUEUE_REFILL_THRESHOLD = 1;

const hydrateAssignment = async (
  gameCode: string,
  assignment: PlayerCurrentAssignment,
): Promise<ActiveGameQueueItem> => {
  const movieRecord = await getMovieRecordOrThrow(gameCode, assignment.movieId);
  return {
    assignmentId: assignment.assignmentId,
    movie: movieRecord.movie,
    order: assignment.order,
  };
};

const listAssignableEntries = async (
  gameCode: string,
  playerId: string,
): Promise<PlayerQueueEntry[]> => {
  const [poolEntries, seenMovieIds, queuedEntries, currentAssignment] = await Promise.all([
    getPoolEntries(gameCode),
    getPlayerSeenMovieIds(gameCode, playerId),
    getPlayerQueueEntries(gameCode, playerId),
    getPlayerCurrentAssignment(gameCode, playerId),
  ]);

  const excludedMovieIds = new Set<string>(seenMovieIds);
  for (const entry of queuedEntries) {
    excludedMovieIds.add(entry.movieId);
  }
  if (currentAssignment) {
    excludedMovieIds.add(currentAssignment.movieId);
  }

  const results: PlayerQueueEntry[] = [];
  for (const entry of poolEntries) {
    if (excludedMovieIds.has(entry.movieId)) {
      continue;
    }

    const movieRecord = await getMovieRecordOrThrow(gameCode, entry.movieId);
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
  await maybeRefillPool({gameCode});

  const queueLength = await getPlayerQueueLength(gameCode, playerId);
  if (queueLength >= targetDepth) {
    return;
  }

  const candidates = await listAssignableEntries(gameCode, playerId);
  const needed = Math.max(0, targetDepth - queueLength);
  if (needed === 0) {
    return;
  }

  await pushPlayerQueueEntries(gameCode, playerId, candidates.slice(0, needed));
};

export const getCurrentMovie = async (
  gameCode: string,
  playerId: string,
): Promise<ActiveGameQueueItem | null> => {
  const current = await getPlayerCurrentAssignment(gameCode, playerId);
  if (!current) {
    return null;
  }

  return hydrateAssignment(gameCode, current);
};

export const getCurrentOrNextMovie = async (
  gameCode: string,
  playerId: string,
): Promise<ActiveGameQueueItem | null> => {
  const current = await getPlayerCurrentAssignment(gameCode, playerId);
  if (current) {
    return hydrateAssignment(gameCode, current);
  }

  const queueLength = await getPlayerQueueLength(gameCode, playerId);
  if (queueLength === 0) {
    await refillPlayerQueue(gameCode, playerId);
  }

  const nextEntry = await popPlayerQueueEntry(gameCode, playerId);
  if (!nextEntry) {
    return null;
  }

  const assignment: PlayerCurrentAssignment = {
    assignmentId: randomUUID(),
    movieId: nextEntry.movieId,
    order: nextEntry.order,
    issuedAt: new Date().toISOString(),
  };
  await setPlayerCurrentAssignment(gameCode, playerId, assignment);

  const remainingQueueLength = await getPlayerQueueLength(gameCode, playerId);
  if (remainingQueueLength <= PLAYER_QUEUE_REFILL_THRESHOLD) {
    await refillPlayerQueue(gameCode, playerId);
  }

  return hydrateAssignment(gameCode, assignment);
};

export const clearCurrentAssignment = async (gameCode: string, playerId: string) => {
  await clearPlayerCurrentAssignment(gameCode, playerId);
};

export const markSeen = async (gameCode: string, playerId: string, movieId: string) => {
  await markPlayerSeenMovie(gameCode, playerId, movieId);
};

export const getPlayerCurrentIndex = async (gameCode: string, playerId: string) =>
  getPlayerSeenCount(gameCode, playerId);

export const getPlayerRemainingCount = async (gameCode: string, playerId: string) => {
  const [current, queueEntries, assignableEntries] = await Promise.all([
    getPlayerCurrentAssignment(gameCode, playerId),
    getPlayerQueueEntries(gameCode, playerId),
    listAssignableEntries(gameCode, playerId),
  ]);

  return queueEntries.length + assignableEntries.length + (current ? 1 : 0);
};

export const isPlayerCompleted = async (gameCode: string, playerId: string) => {
  const [current, queueEntries, assignableEntries] = await Promise.all([
    getPlayerCurrentAssignment(gameCode, playerId),
    getPlayerQueueEntries(gameCode, playerId),
    listAssignableEntries(gameCode, playerId),
  ]);

  return !current && queueEntries.length === 0 && assignableEntries.length === 0;
};

export const getGamePlayerIds = async (gameCode: string) => listPlayerIds(gameCode);

export const areAllPlayersCompleted = async (gameCode: string) => {
  const playerIds = await listPlayerIds(gameCode);
  if (playerIds.length === 0) {
    return false;
  }

  const completions = await Promise.all(
    playerIds.map((playerId) => isPlayerCompleted(gameCode, playerId)),
  );

  return completions.every(Boolean);
};

const getPositiveVotes = (movieRecord: MovieRecord) =>
  movieRecord.likeCount + movieRecord.superLikeCount;

const incrementVoteCounts = (movieRecord: MovieRecord, choice: SwipeChoice): MovieRecord => {
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
  movieRecord: MovieRecord,
): Promise<MovieStatus> => {
  if (movieRecord.status === "matched") {
    return "matched";
  }

  const settings = await getGameSettingsOrThrow(gameCode);
  if (getPositiveVotes(movieRecord) >= settings.minLikesToMatch) {
    return "matched";
  }

  const playerIds = await listPlayerIds(gameCode);
  if (playerIds.length === 0 || movieRecord.totalVotes === 0) {
    return "pending";
  }

  const seenStates = await Promise.all(
    playerIds.map((playerId) => hasPlayerSeenMovie(gameCode, playerId, movieRecord.movie.id)),
  );

  return seenStates.every(Boolean) ? "rejected" : "pending";
};

export const refreshMovieOutcome = async (
  gameCode: string,
  movieId: string,
) => {
  const movieRecord = await getMovieRecordOrThrow(gameCode, movieId);
  const nextStatus = await determineMovieStatus(gameCode, movieRecord);
  const justMatched = movieRecord.status !== "matched" && nextStatus === "matched";

  if (movieRecord.status !== nextStatus) {
    await setMovieRecord(gameCode, movieId, {
      ...movieRecord,
      status: nextStatus,
    });
  }

  await syncMovieOutcomeSets(gameCode, movieId, nextStatus);
  return {justMatched, status: nextStatus};
};

export const recalculateMovieOutcomes = async (gameCode: string) => {
  const poolEntries = await getPoolEntries(gameCode);

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
  const existingVote = await getPlayerVote(input.gameCode, input.movieId, input.playerId);
  if (existingVote) {
    throw new BadRequestException("Vote already recorded for this movie");
  }

  await setPlayerVote(input.gameCode, input.movieId, input.playerId, input.choice);

  const movieRecord = await getMovieRecordOrThrow(input.gameCode, input.movieId);
  const nextRecord = incrementVoteCounts(movieRecord, input.choice);
  await setMovieRecord(input.gameCode, input.movieId, nextRecord);

  return refreshMovieOutcome(input.gameCode, input.movieId);
};

export const syncRoomStatus = async (gameCode: string) => {
  const meta = await getGameMetaOrThrow(gameCode);
  if (meta.status === "completed") {
    return meta;
  }

  const playerIds = await listPlayerIds(gameCode);
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
    endedAt: nextStatus === "completed"
      ? meta.endedAt ?? new Date().toISOString()
      : null,
  };

  await setGameMeta(gameCode, nextMeta);
  return nextMeta;
};

export const joinGame = async (input: {
  gameCode: string;
  displayName: string;
}) => {
  const playerId = randomUUID();
  const sessionToken = randomUUID();
  const joinedAt = new Date().toISOString();

  await withGameLock(input.gameCode, async () => {
    const meta = await getGameMetaOrThrow(input.gameCode);
    if (meta.status === "completed") {
      throw new ConflictException("This room is completed");
    }

    await setPlayerRecord(input.gameCode, playerId, {
      id: playerId,
      displayName: input.displayName,
      joinedAt,
      sessionToken,
    });

    await refillPlayerQueue(input.gameCode, playerId);
    await getCurrentOrNextMovie(input.gameCode, playerId);
    await syncRoomStatus(input.gameCode);
    await touchRoomKeys(input.gameCode);
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
  withGameLock(player.gameCode, async () => {
    await verifyPlayerSession(player);
    await clearCurrentAssignment(player.gameCode, player.playerId);
    await deletePlayerState(player.gameCode, player.playerId);
    await recalculateMovieOutcomes(player.gameCode);
    await syncRoomStatus(player.gameCode);
    await touchRoomKeys(player.gameCode);

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
  const result = await withGameLock(input.player.gameCode, async () => {
    await verifyPlayerSession(input.player);

    const playerIds = await getGamePlayerIds(input.player.gameCode);
    if (playerIds.length < 2) {
      throw new BadRequestException("Need at least 2 players before voting");
    }

    const settings = await getGameSettingsOrThrow(input.player.gameCode);
    if (!settings.allowMaybe && input.choice === "maybe") {
      throw new BadRequestException("Maybe votes are disabled in this game");
    }

    if (!settings.allowSuperLike && input.choice === "super_like") {
      throw new BadRequestException("Super likes are disabled in this game");
    }

    const currentAssignment = await getPlayerCurrentAssignment(
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

    await markSeen(input.player.gameCode, input.player.playerId, input.movieId);
    await clearCurrentAssignment(input.player.gameCode, input.player.playerId);
    await getCurrentOrNextMovie(input.player.gameCode, input.player.playerId);
    await syncRoomStatus(input.player.gameCode);
    await touchRoomKeys(input.player.gameCode);

    return {
      movieId: input.movieId,
      choice: input.choice,
      justMatched,
    };
  });

  const {getPlayerGameState} = await import("./game-snapshot.service");

  return {
    movieId: result.movieId,
    choice: result.choice,
    justMatched: result.justMatched,
    state: await getPlayerGameState({
      gameCode: input.player.gameCode,
      playerId: input.player.playerId,
    }),
  };
};
