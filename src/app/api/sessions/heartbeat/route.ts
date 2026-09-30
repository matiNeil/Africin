import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { heartbeatDeviceSession } from "@/lib/device-sessions";

/**
 * Keeps a claimed device slot alive while WatchScreen is on screen and
 * playing. Returns 404 if the slot was never claimed (or aged out and was
 * pruned) — the client should treat that as "go back through claim" rather
 * than retrying the heartbeat, since only claim re-applies the device cap.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { authToken, deviceId } = body;

    if (!authToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    if (typeof deviceId !== "string" || !deviceId) {
      return NextResponse.json({ error: "Missing deviceId" }, { status: 400 });
    }

    let userId: string;
    try {
      userId = (await adminAuth.verifyIdToken(authToken)).uid;
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const ok = await heartbeatDeviceSession(userId, deviceId);
    if (!ok) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Session heartbeat error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
