import {createMiddleware} from "hono/factory";
import {auth} from "../lib/auth";

// Extend Hono's context with typed user/session data

/**
 * Middleware that requires authentication.
 * Sets userId, user, and session on the context.
 * Returns 401 if not authenticated.
 */
export const authMiddleware = createMiddleware(async (c, next) => {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session) {
    return c.json({error: "Unauthorized"}, 401);
  }

  c.set("userId", session.user.id);
  c.set("user", {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    image: session.user.image,
  });
  c.set("session", {
    id: session.session.id,
    expiresAt: session.session.expiresAt,
  });

  await next();
});

/**
 * Optional auth middleware - sets user data if authenticated but doesn't require it.
 * Useful for routes that work differently for logged-in vs anonymous users.
 */
export const optionalAuthMiddleware = createMiddleware(async (c, next) => {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (session) {
    c.set("userId", session.user.id);
    c.set("user", {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      image: session.user.image,
    });
    c.set("session", {
      id: session.session.id,
      expiresAt: session.session.expiresAt,
    });
  }

  await next();
});
