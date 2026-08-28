import { NextResponse } from "next/server";
import { getState, hasRedis } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const state = await getState();
  return NextResponse.json({ state, persisted: hasRedis });
}
