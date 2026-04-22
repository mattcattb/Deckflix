import {beforeEach, describe, expect, mock, test} from "bun:test";

const publishDisplayMessage = mock();

mock.module(new URL("../realtime/display-channel.ts", import.meta.url).href, () => ({
  publishDisplayMessage,
}));

const PresencePubSub = await import(new URL("./presence.pubsub.ts", import.meta.url).href);

beforeEach(() => {
  publishDisplayMessage.mockReset();
});

describe("presence.pubsub", () => {
  test("publishes presence events to the display channel", () => {
    PresencePubSub.publishPlayerJoined({publish: mock()}, "ABCD", {
      id: "player-1",
      displayName: "Taylor",
      joinedAt: new Date().toISOString(),
      connectedAsPlayer: false,
    });
    PresencePubSub.publishPlayerLeft({publish: mock()}, "ABCD", "player-1");

    expect(publishDisplayMessage).toHaveBeenCalledWith(expect.anything(), "ABCD", {
      type: "presence.player_joined",
      payload: expect.objectContaining({
        id: "player-1",
        displayName: "Taylor",
      }),
    });
    expect(publishDisplayMessage).toHaveBeenCalledWith(expect.anything(), "ABCD", {
      type: "presence.player_left",
      payload: {playerId: "player-1"},
    });
  });
});
