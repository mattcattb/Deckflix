import {
  DetailedError,
  hc,
  parseResponse,
  type ClientResponse,
} from "hono/client";
import type {AppType} from "@deckflix/server/app";
import {apiErrorResponseSchema, type ApiError} from "@deckflix/shared";

const ROOM_SESSION_TOKEN_STORAGE_KEY = "deckflix_room_session_token";

const getStoredRoomSessionToken = () =>
  typeof window !== "undefined"
    ? window.sessionStorage.getItem(ROOM_SESSION_TOKEN_STORAGE_KEY) ??
      window.localStorage.getItem(ROOM_SESSION_TOKEN_STORAGE_KEY)
    : null;

const rawBaseUrl =
  import.meta.env.VITE_PUBLIC_API_URL ||
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? "/api" : "http://localhost:3100");

export const API_BASE_URL = rawBaseUrl.startsWith("/")
  ? rawBaseUrl
  : rawBaseUrl.startsWith("http")
  ? rawBaseUrl
  : `http://${rawBaseUrl}`;

export const api = hc<AppType>(API_BASE_URL, {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => {
    const token = getStoredRoomSessionToken();
    if (!token) {
      return fetch(input, init);
    }

    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${token}`);
    return fetch(input, {
      ...init,
      headers,
    });
  },
  init: {
    credentials: "include",
  },
});

type RpcData<TResponse extends ClientResponse<any, any, any>> = Awaited<
  ReturnType<typeof parseResponse<TResponse>>
>;

type RpcClientErrorCode = "NETWORK_ERROR" | "TIMEOUT_ERROR" | "UNKNOWN_ERROR";

type RpcClientError = {
  code: RpcClientErrorCode;
  message: string;
  details?: unknown;
};

export type RpcError = ApiError | RpcClientError;

export const hasRpcErrorCode = <Code extends RpcError["code"]>(
  error: unknown,
  ...codes: Code[]
): error is RpcError & {code: Code} =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  typeof (error as {code?: unknown}).code === "string" &&
  codes.includes((error as {code: Code}).code);

const translateRpcError = (error: unknown): RpcError => {
  if (error instanceof DetailedError) {
    const parsed = apiErrorResponseSchema.safeParse(error.detail?.data);
    if (parsed.success) {
      return parsed.data.error;
    }

    return {
      code: "UNKNOWN_ERROR",
      message: error.message,
      details: error.detail,
    };
  }

  if (error instanceof DOMException && error.name === "AbortError") {
    return {
      code: "TIMEOUT_ERROR",
      message: "Request timed out",
      details: error,
    };
  }

  if (error instanceof TypeError) {
    return {
      code: "NETWORK_ERROR",
      message: error.message || "Network request failed",
      details: error,
    };
  }

  if (error instanceof Error) {
    return {
      code: "UNKNOWN_ERROR",
      message: error.message,
      details: error,
    };
  }

  return {
    code: "UNKNOWN_ERROR",
    message: "Unknown client error",
    details: error,
  };
};

export const parseRpc = async <TResponse extends ClientResponse<any, any, any>>(
  rpc: Promise<TResponse> | TResponse,
): Promise<RpcData<TResponse>> => {
  try {
    return (await parseResponse(rpc)) as RpcData<TResponse>;
  } catch (error) {
    throw translateRpcError(error);
  }
};

export const callRpc = async <TResponse extends ClientResponse<any, any, any>>(
  rpc: Promise<TResponse> | TResponse,
): Promise<[RpcError, null] | [null, RpcData<TResponse> | null]> => {
  try {
    const data = await parseRpc(rpc);
    return [null, data === undefined ? null : data];
  } catch (error) {
    return [translateRpcError(error), null];
  }
};
