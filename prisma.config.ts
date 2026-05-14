import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", override: true });
loadEnv(); // falls back to .env for anything not in .env.local
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  engine: "classic",
  datasource: {
    url: env("DATABASE_URL"),
  },
});
