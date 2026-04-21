import {createRouter} from "../common/hono";

export const settingsController = createRouter()
  .get("/", async (c) => {})
  .patch("/", async () => {});
