import {describe, expect, test} from "bun:test";
import {app} from "./app";

describe("app routes", () => {
  test("does not expose role-shaped controller routes", async () => {
    expect((await app.request("/api/display")).status).toBe(404);
    expect((await app.request("/api/player")).status).toBe(404);
  });

  test("does not expose duplicate game-code room reads", async () => {
    expect((await app.request("/api/room/ABCD/meta")).status).toBe(404);
    expect((await app.request("/api/room/ABCD/players")).status).toBe(404);
  });

  test("does not expose the old display snapshot route", async () => {
    expect((await app.request("/api/game/display")).status).toBe(404);
  });

  test("game slice routes require an active room session", async () => {
    expect((await app.request("/api/game/matches")).status).toBe(404);
    expect((await app.request("/api/game/recent")).status).toBe(404);
    expect((await app.request("/api/game/stinkers")).status).toBe(404);
  });
});
