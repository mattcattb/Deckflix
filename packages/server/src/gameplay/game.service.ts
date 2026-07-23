import type {PlayerDeckState, SwipeChoice} from "@deckflix/shared";
import {BadRequestException} from "../common/errors";
import {emitEvent} from "../common/app-events";
import * as MovieMetadataService from "../movies/movie-metadata.service";
import {requestPoolExpansion} from "../pool/pool-events";
import * as DeckService from "./deck.service";
import * as VoteService from "./vote.service";
import {redisClient} from "../redis/redis";
import {roomPrefix, ROOM_TTL_SECONDS} from "../rooms/room-keys";
import * as PoolService from "../pool/pool.service";
import * as SuggestionService from "./suggestion.service";
import {withRedisLock} from "../redis/redis-lock";

type SwipeResult = {
  movieId: string;
  choice: SwipeChoice;
  statePatch: PlayerDeckState;
  suggestion: {suggestedByName: string} | null;
};

export const recordSwipe = async (input: {
  gameCode: string;
  playerId: string;
  movieId: string;
  choice: SwipeChoice;
  actionId?: string;
}): Promise<SwipeResult> =>
  withRedisLock(
    {
      key: `${roomPrefix(input.gameCode)}swipe_lock:${input.playerId}`,
      ttlMs: 10_000,
      retryCount: 100,
      retryDelayMs: 10,
      busyMessage: "Swipe is still being processed",
    },
    async () => {
      const actionKey =
        `${roomPrefix(input.gameCode)}swipe_actions:${input.playerId}`;
      if (input.actionId) {
        const cached = await redisClient.hGet(actionKey, input.actionId);
        if (cached) {
          return JSON.parse(cached) as SwipeResult;
        }
      }

      const popped = await DeckService.popCurrentMovieId(
        input.gameCode,
        input.playerId,
        input.movieId,
      );
      if (popped.status === "empty") {
        throw new BadRequestException("No active movie");
      }
      if (popped.status === "mismatch") {
        throw new BadRequestException("Vote does not match the deck head");
      }

      const vote = await VoteService.recordVote({
        gameCode: input.gameCode,
        movieId: popped.movieId,
        playerId: input.playerId,
        choice: input.choice,
      });

      emitEvent("game.vote_recorded", {
        gameCode: input.gameCode,
        playerId: input.playerId,
        movieId: popped.movieId,
        choice: input.choice,
        votedAt: vote.votedAt,
      });

      await DeckService.refreshPlayerDeck(input.gameCode, input.playerId);
      const [statePatch, source] = await Promise.all([
        getPlayerSwipeStatePatch(input.gameCode, input.playerId),
        PoolService.getPoolSource(input.gameCode, popped.movieId),
      ]);
      if (
        source.source === "suggestion" &&
        source.suggestedByPlayerId &&
        source.suggestedByPlayerId !== input.playerId &&
        (input.choice === "like" || input.choice === "super_like")
      ) {
        const movie = await MovieMetadataService.getRoomMovieMetadataOrThrow(
          input.gameCode,
          popped.movieId,
        );
        await SuggestionService.notifySuggestionLiked({
          gameCode: input.gameCode,
          suggestedByPlayerId: source.suggestedByPlayerId,
          movieTitle: movie.title,
        });
      }
      requestPoolExpansion({
        gameCode: input.gameCode,
        reason: "swipe_recorded",
      });

      const result = {
        movieId: popped.movieId,
        choice: input.choice,
        statePatch,
        suggestion:
          source.source === "suggestion"
            ? {suggestedByName: source.suggestedByName ?? "Another player"}
            : null,
      };
      if (input.actionId) {
        await redisClient
          .multi()
          .hSet(actionKey, input.actionId, JSON.stringify(result))
          .expire(actionKey, ROOM_TTL_SECONDS)
          .exec();
      }
      return result;
    },
  );

const getPlayerSwipeStatePatch = async (gameCode: string, playerId: string) => {
  const [currentMovieId, deckStatus] = await Promise.all([
    DeckService.peekCurrentMovieId(gameCode, playerId),
    DeckService.getPlayerDeckStatus(gameCode, playerId),
  ]);

  return {
    me: {
      currentIndex: deckStatus.currentIndex,
      completed: deckStatus.completed,
    },
    currentItem: currentMovieId
      ? await Promise.all([
          MovieMetadataService.getRoomMovieMetadataOrThrow(gameCode, currentMovieId),
          PoolService.getPoolSource(gameCode, currentMovieId),
        ]).then(([movie, source]) => ({
          movie,
          source: source.source,
        }))
      : null,
    remainingCount: deckStatus.remainingCount,
  };
};
