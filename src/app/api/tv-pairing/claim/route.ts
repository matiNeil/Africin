import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { claimPairingCode } from "@/lib/tv-pairing";

/**
 * Called from the website's /activate page (or the mobile app's "Activate a
 * TV" entry point) once a signed-in user types in the code shown on their
 * TV. Claiming only records which account owns the code — the TV itself
 * only finds out via its own poll, which also mints the actual sign-in
 * credential (see api/tv-pairing/poll). This endpoint never hands back
 * anything the TV could use to sign in, so a claim alone can't be replayed
 * into a session.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { code, authToken } = body;

    if (typeof code !== "string" || !code.trim()) {
      return NextResponse.json({ error: "Missing code" }, { status: 400 });
    }
    if (!authToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    let uid: string;
    try {
      uid = (await adminAuth.verifyIdToken(authToken)).uid;
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const result = await claimPairingCode(code, uid);
    if (result === "not_found") {
      return NextResponse.json({ error: "That code doesn't exist. Check your TV screen and try again." }, { status: 404 });
    }
    if (result === "expired") {
      return NextResponse.json({ error: "That code has expired. Your TV should show a new one — try again." }, { status: 410 });
    }
    if (result === "already_claimed") {
      return NextResponse.json({ error: "That code has already been used." }, { status: 409 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("TV pairing claim error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
