import {z} from "zod";
import {zValidator} from "@hono/zod-validator";
import {createRouter} from "./hono";
import {createChildLogger} from "./logger";

const logger = createChildLogger({service: "product.telemetry"});

const telemetryEventSchema = z.object({
  name: z.enum([
    "landing_viewed",
    "room_create_started",
    "room_create_succeeded",
    "room_create_failed",
    "room_join_started",
    "room_join_succeeded",
    "room_join_failed",
    "game_started",
    "finale_started",
    "client_error",
  ]),
  path: z.string().max(200),
  properties: z
    .record(z.string().max(60), z.union([z.string().max(300), z.number(), z.boolean(), z.null()]))
    .optional(),
});

export const telemetryController = createRouter().post(
  "/",
  zValidator("json", telemetryEventSchema),
  (c) => {
    logger.info(c.req.valid("json"), "Product event");
    return c.body(null, 204);
  },
);
