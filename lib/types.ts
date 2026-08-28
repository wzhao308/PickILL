export type MatchType = "solo" | "doubles";
export type MatchStatus = "forming" | "in-progress";

export interface Player {
  id: string;
  name: string;
}

export interface QueueEntry extends Player {
  joinedAt: number;
}

export interface Match {
  type: MatchType;
  players: QueueEntry[];
  neededCount: number;
  status: MatchStatus;
  startedAt: number | null;
}

export interface Court {
  id: number;
  queue: QueueEntry[];
  match: Match | null;
}

export interface AppState {
  courts: Court[];
}

export type PlayerLocation =
  | { courtId: number; role: "queue"; position: number }
  | { courtId: number; role: "match"; match: Match };
