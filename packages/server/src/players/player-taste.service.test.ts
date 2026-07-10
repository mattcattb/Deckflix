import {describe, expect, test} from "bun:test";
import {DEFAULT_GAME_PREFERENCES} from "../rooms/room-preferences.service";
import {
  applyPlayerTastes,
  DEFAULT_PLAYER_TASTE,
  listTasteAnchorMovieIds,
} from "./player-taste.service";

describe("player taste", () => {
  test("turns room tastes into soft discovery preferences", () => {
    const preferences = applyPlayerTastes(DEFAULT_GAME_PREFERENCES, [
      {
        ...DEFAULT_PLAYER_TASTE,
        genreIds: [35],
        moods: ["cozy"],
        discovery: "familiar",
      },
      {
        ...DEFAULT_PLAYER_TASTE,
        genreIds: [35, 12],
        moods: ["funny"],
        discovery: "balanced",
      },
    ]);

    expect(preferences.includedGenreIds[0]).toBe(35);
    expect(preferences.includedGenreIds).toContain(10751);
    expect(preferences.popularityPreset).toBe("popular");
  });

  test("keeps explicit host filters and deduplicates taste anchors", () => {
    const explicit = {...DEFAULT_GAME_PREFERENCES, includedGenreIds: [27]};
    const tastes = [
      {...DEFAULT_PLAYER_TASTE, genreIds: [35], anchorMovieIds: ["1", "2"]},
      {...DEFAULT_PLAYER_TASTE, anchorMovieIds: ["2", "3"]},
    ];

    expect(applyPlayerTastes(explicit, tastes).includedGenreIds).toEqual([27]);
    expect(listTasteAnchorMovieIds(tastes)).toEqual(["1", "2", "3"]);
  });
});
