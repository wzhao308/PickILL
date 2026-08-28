import "server-only";
import { Redis } from "@upstash/redis";
import type { AppState } from "./types";
import { defaultState, isValidState } from "./logic";

/** Server-only persistence for the shared queue state. Backed by an Upstash
 * Redis database (works with Vercel's Marketplace "Redis" storage add-on,
 * or a free database created directly at upstash.com). Falls back to an
 * in-process memory store when no Redis credentials are configured, so
 * `npm run dev` works out of the box for local testing — that fallback is
 * NOT safe for a real deployment (each serverless invocation gets its own
 * memory), so production always needs the env vars set. */

const STATE_KEY = "pickill:state";

const REDIS_URL = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

const redis = REDIS_URL && REDIS_TOKEN ? new Redis({ url: REDIS_URL, token: REDIS_TOKEN }) : null;

export const hasRedis = !!redis;

// In-memory fallback, scoped to this module instance (dev-only; a real
// deployment runs many isolated instances, so this must not be relied on
// once Redis is configured).
let memoryState: AppState | null = null;

export async function getState(): Promise<AppState> {
  if (redis) {
    const state = await redis.get<AppState>(STATE_KEY);
    return isValidState(state) ? state : defaultState();
  }
  if (!memoryState) memoryState = defaultState();
  return memoryState;
}

export async function setState(state: AppState): Promise<void> {
  if (redis) {
    await redis.set(STATE_KEY, state);
    return;
  }
  memoryState = state;
}
