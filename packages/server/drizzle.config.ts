import { defineConfig } from "drizzle-kit";

const DEFAULT_DATABASE_URL =
  "postgresql://postgres:postgres@localhost:15432/postgres";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL || DEFAULT_DATABASE_URL,
  },
});
