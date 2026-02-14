import { zValidator } from "@hono/zod-validator";
import { createRouter } from "../common/hono";
import { createProjectSchema } from "./projects.schema";
import { createProject, listProjects } from "./projects.service";

export const projectsController = createRouter()
  .get("/", async (c) => {
    const projects = await listProjects(c.get("userId"));
    return c.json(projects);
  })
  .post("/", zValidator("json", createProjectSchema), async (c) => {
    const { name } = c.req.valid("json");
    const project = await createProject(c.get("userId"), name);
    return c.json(project, 201);
  });
