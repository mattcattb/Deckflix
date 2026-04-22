import {createRouter} from "../common/hono";
import {
  activeDisplaySessionMiddleware,
  displaySessionMiddleware,
} from "../rooms/rooms.middleware";
import * as DisplayService from "./display.service";
import {createDisplaySocketHandler} from "./display.ws";

export const displayRoutes = createRouter()
  .get("/state", displaySessionMiddleware, async (c) => {
    return c.json(await DisplayService.getDisplayState(c.get("roomRequest").gameCode));
  })
  .get("/ws", displaySessionMiddleware, createDisplaySocketHandler());

export const activeDisplayRoutes = createRouter()
  .get("/state", activeDisplaySessionMiddleware, async (c) => {
    return c.json(await DisplayService.getDisplayState(c.get("roomRequest").gameCode));
  })
  .get("/ws", activeDisplaySessionMiddleware, createDisplaySocketHandler());
