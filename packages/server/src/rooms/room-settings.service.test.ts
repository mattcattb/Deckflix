import {describe, expect, test} from "bun:test";
import * as RoomSettingsService from "./room-settings.service";

describe("room settings", () => {
  test("resolves gameplay defaults", () => {
    expect(RoomSettingsService.resolveGameSettings()).toEqual(
      RoomSettingsService.DEFAULT_GAME_SETTINGS,
    );
  });

  test("merges gameplay updates", () => {
    const merged = RoomSettingsService.mergeGameSettings(
      RoomSettingsService.DEFAULT_GAME_SETTINGS,
      {
        gameplay: {
          maxMovies: 150,
        },
      },
    );

    expect(merged).toEqual({
      gameplay: {
        ...RoomSettingsService.DEFAULT_GAME_SETTINGS.gameplay,
        maxMovies: 150,
      },
    });
  });
});
