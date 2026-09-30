import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { releaseDeviceSession } from "@/lib/device-sessions";

/**
 * Frees a device's streaming slot immediately when WatchScreen unmounts,
 * rather than waiting out ACTIVE_SESSION_WINDOW_MS for the heartbeat to go
 * stale — best-effort only (a killed app can't call this, which is exactly
 * why the heartbeat window exists as a backstop).
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

    await releaseDeviceSession(userId, deviceId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Session release error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
