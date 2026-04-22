import {createRouter} from "../common/hono";
import {activeRoomMiddleware} from "./rooms.middleware";
import * as RoomsService from "./rooms.service";

export const roomController = createRouter()
  .use("*", activeRoomMiddleware)
  .get("/client", async (c) => {
    const {gameCode, session} = c.get("roomRequest");
    return c.json(await RoomsService.getClient({gameCode, session}));
  })
  .get("/meta", async (c) => {
    return c.json(await RoomsService.getMeta(c.get("roomRequest").gameCode));
  })
  .get("/players", async (c) => {
    return c.json(await RoomsService.getPlayers(c.get("roomRequest").gameCode));
  })
  .get("/results", async (c) => {
    return c.json(await RoomsService.getResults(c.get("roomRequest").gameCode));
  });
