import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { getSubscription } from "@/lib/subscriptions";

/**
 * Whether the caller currently has access to the Africin catalog. Access is
 * now a single account-wide subscription (any tier unlocks everything),
 * not a per-title purchase — so unlike the old per-content version, this
 * ignores any contentId the caller sends and just reports the account's
 * subscription state. Kept as a POST with the same request/response shape
 * ({authToken} -> {access}) so the website's existing polling components
 * (SubscribeCard, LiveStreamPlayer) don't need to change their call sites.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { authToken } = body;

    if (!authToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
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

    return NextResponse.json({
      access: isEntitled,
      tier: isEntitled ? sub!.tier : null,
      expiresAt: sub?.expiresAt?.toISOString() ?? null,
    });
  } catch (err) {
    console.error("Access check error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
