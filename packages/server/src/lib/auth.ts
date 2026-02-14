import {betterAuth} from "better-auth";
import {drizzleAdapter} from "better-auth/adapters/drizzle";
import {db} from "../db";
import * as schema from "../db/schema";
import {appEnv} from "../common/env";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day - update session if older than this
  },
  socialProviders: {
    ...(appEnv.GOOGLE_CLIENT_ID && appEnv.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: appEnv.GOOGLE_CLIENT_ID,
            clientSecret: appEnv.GOOGLE_CLIENT_SECRET,
          },
        }
      : {}),
  },
});

export type Auth = typeof auth;
