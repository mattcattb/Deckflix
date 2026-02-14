import { createAuthClient } from "better-auth/react";
import { API_BASE_URL } from "./api";

/**
 * Better Auth client for React.
 * Handles authentication state, sign-in, sign-up, and sign-out.
 */
export const authClient = createAuthClient({
  baseURL: API_BASE_URL,
});

// Export auth methods and hooks
export const {
  signIn,
  signUp,
  signOut,
  useSession,
  getSession,
} = authClient;
