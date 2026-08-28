import type { AppState, Court, Match, MatchType, Player, PlayerLocation, QueueEntry } from "./types";

/** Pure queue rules, shared by the server (API routes) and the client (for
 * read-only display like status pills and "you're #3 in line"). Nothing in
 * this file talks to a database or the network. */

export const COURT_COUNT = 8;

export class ActionError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "ActionError";
  }
}

export function defaultState(): AppState {
  const courts: Court[] = [];
  for (let i = 1; i <= COURT_COUNT; i++) courts.push({ id: i, queue: [], match: null });
  return { courts };
}

export function isValidState(value: unknown): value is AppState {
  if (!value || typeof value !== "object") return false;
  const courts = (value as AppState).courts;
  return Array.isArray(courts) && courts.length === COURT_COUNT;
}

export function getCourt(state: AppState, courtId: number): Court {
  const court = state.courts.find((c) => c.id === courtId);
  if (!court) throw new ActionError("bad-court", "That court doesn't exist.");
  return court;
}

export function courtStatus(court: Court): "open" | "forming" | "busy" {
  if (court.match?.status === "in-progress") return "busy";
  if (court.match?.status === "forming") return "forming";
  return "open";
}

export function findPlayerLocation(state: AppState, playerId: string): PlayerLocation | null {
  for (const court of state.courts) {
    const qi = court.queue.findIndex((p) => p.id === playerId);
    if (qi !== -1) return { courtId: court.id, role: "queue", position: qi + 1 };
    if (court.match) {
      const mi = court.match.players.findIndex((p) => p.id === playerId);
      if (mi !== -1) return { courtId: court.id, role: "match", match: court.match };
    }
  }
  return null;
}

export function applyJoin(state: AppState, courtId: number, player: Player): void {
  if (findPlayerLocation(state, player.id)) {
    throw new ActionError("already-queued", "Leave your current spot before joining another court.");
  }
  const court = getCourt(state, courtId);
  const entry: QueueEntry = { id: player.id, name: player.name, joinedAt: Date.now() };
  if (court.match && court.match.status === "forming" && court.match.players.length < court.match.neededCount) {
    court.match.players.push(entry);
    if (court.match.players.length === court.match.neededCount) {
      court.match.status = "in-progress";
      court.match.startedAt = Date.now();
    }
  } else {
    court.queue.push(entry);
  }
}

export function applyLeave(state: AppState, courtId: number, playerId: string): void {
  const court = getCourt(state, courtId);
  const before = court.queue.length;
  court.queue = court.queue.filter((p) => p.id !== playerId);
  if (court.queue.length === before && court.match && court.match.status === "forming") {
    court.match.players = court.match.players.filter((p) => p.id !== playerId);
    if (court.match.players.length === 0) court.match = null;
  }
}

export function applyChooseType(state: AppState, courtId: number, playerId: string, type: MatchType): void {
  const court = getCourt(state, courtId);
  if (!court.queue.length || court.queue[0].id !== playerId) {
    throw new ActionError("not-front", "Only the person first in line can choose singles or doubles.");
  }
  const needed = type === "solo" ? 2 : 4;
  const players: QueueEntry[] = [court.queue.shift() as QueueEntry];
  while (players.length < needed && court.queue.length) players.push(court.queue.shift() as QueueEntry);
  const filled = players.length === needed;
  const match: Match = {
    type,
    players,
    neededCount: needed,
    status: filled ? "in-progress" : "forming",
    startedAt: filled ? Date.now() : null,
  };
  court.match = match;
}

export function applyCancelForming(state: AppState, courtId: number, playerId: string): void {
  const court = getCourt(state, courtId);
  if (!court.match || court.match.status !== "forming") {
    throw new ActionError("no-match", "There's no forming match to cancel.");
  }
  if (court.match.players[0].id !== playerId) {
    throw new ActionError("not-owner", "Only the player who started this match can cancel it.");
  }
  court.queue = [...court.match.players, ...court.queue];
  court.match = null;
}

export function applyFinish(state: AppState, courtId: number, playerId: string): void {
  const court = getCourt(state, courtId);
  if (!court.match || court.match.status !== "in-progress") {
    throw new ActionError("no-match", "There's no match in progress on this court.");
  }
  if (!court.match.players.some((p) => p.id === playerId)) {
    throw new ActionError("not-in-match", "Only players in this match can mark it finished.");
  }
  court.match = null;
}
