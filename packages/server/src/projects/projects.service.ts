import { desc, eq } from "drizzle-orm";
import { db } from "../db";
import { project } from "../db/schema";

export const listProjects = async (ownerId: string) =>
  db
    .select()
    .from(project)
    .where(eq(project.ownerId, ownerId))
    .orderBy(desc(project.createdAt));

export const createProject = async (ownerId: string, name: string) => {
  const [created] = await db
    .insert(project)
    .values({
      ownerId,
      name,
    })
    .returning();

  return created;
};
