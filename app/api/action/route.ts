import { NextRequest, NextResponse } from "next/server";
import { getState, setState, hasRedis } from "@/lib/store";
import {
  ActionError,
  COURT_COUNT,
  applyCancelForming,
  applyChooseType,
  applyFinish,
  applyJoin,
  applyLeave,
} from "@/lib/logic";
import type { MatchType } from "@/lib/types";

export const dynamic = "force-dynamic";

interface ActionBody {
  action?: string;
  courtId?: unknown;
  matchType?: unknown;
  player?: { id?: unknown; name?: unknown };
}

export async function POST(req: NextRequest) {
  let body: ActionBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "That request wasn't valid JSON." }, { status: 400 });
  }

  const rawPlayer = body.player;
  if (!rawPlayer || typeof rawPlayer.id !== "string" || typeof rawPlayer.name !== "string" || !rawPlayer.name.trim()) {
    return NextResponse.json({ error: "Missing player name." }, { status: 400 });
  }
  const player = { id: rawPlayer.id.slice(0, 64), name: rawPlayer.name.trim().slice(0, 24) };

  const courtId = Number(body.courtId);
  if (!Number.isInteger(courtId) || courtId < 1 || courtId > COURT_COUNT) {
    return NextResponse.json({ error: "Invalid court." }, { status: 400 });
  }

  const state = await getState();

  try {
    switch (body.action) {
      case "join":
        applyJoin(state, courtId, player);
        break;
      case "leave":
        applyLeave(state, courtId, player.id);
        break;
      case "choose-type": {
        const matchType = body.matchType;
        if (matchType !== "solo" && matchType !== "doubles") {
          return NextResponse.json({ error: "Invalid match type." }, { status: 400 });
        }
        applyChooseType(state, courtId, player.id, matchType as MatchType);
        break;
      }
      case "cancel-forming":
        applyCancelForming(state, courtId, player.id);
        break;
      case "finish":
        applyFinish(state, courtId, player.id);
        break;
      default:
        return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (err) {
    if (err instanceof ActionError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 409 });
    }
    throw err;
  }

  await setState(state);
  return NextResponse.json({ state, persisted: hasRedis });
}
