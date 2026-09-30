import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { getSubscription } from "@/lib/subscriptions";
import { SUBSCRIPTION_TIERS } from "@/lib/subscription-tiers";
import { claimDeviceSession } from "@/lib/device-sessions";

/**
 * Claims a concurrent-stream slot before playback starts. Called by
 * WatchScreen on the mobile client right before it initializes the player —
 * a rejection here means "another device on this tier's cap is already
 * streaming," not "not subscribed" (that's /api/access/check's job, and is
 * checked here too since a device cap is meaningless without a tier).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { authToken, deviceId, deviceName } = body;

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

    const sub = await getSubscription(userId);
    const isEntitled =
      !!sub &&
      (sub.status === "active" || sub.status === "grace") &&
      !!sub.expiresAt &&
      sub.expiresAt.getTime() > Date.now();
    if (!isEntitled) {
      return NextResponse.json({ error: "Not subscribed" }, { status: 403 });
    }

    const maxDevices = SUBSCRIPTION_TIERS[sub!.tier].maxDevices;
    const result = await claimDeviceSession(
      userId,
      deviceId,
      typeof deviceName === "string" && deviceName ? deviceName : "Unknown device",
      maxDevices
    );

    if (!result.ok) {
      return NextResponse.json(
        {
          error: "Device limit reached",
          maxDevices,
          activeCount: result.activeCount,
        },
        { status: 409 }
      );
    }

    return NextResponse.json({ ok: true, maxDevices, activeCount: result.activeCount });
  } catch (err) {
    console.error("Session claim error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
