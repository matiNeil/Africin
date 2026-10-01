import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { pollPairingCode, deletePairingCode } from "@/lib/tv-pairing";

/**
 * Polled by the TV every few seconds while showing a pairing code. Mints the
 * actual Firebase custom token here (not in /claim) and immediately deletes
 * the code doc on a successful poll, so a claimed code can only ever be
 * collected by the TV once — nothing is replayable even if someone else
 * captured the code value in flight.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { code } = body;
    if (typeof code !== "string" || !code.trim()) {
      return NextResponse.json({ error: "Missing code" }, { status: 400 });
    }

    const result = await pollPairingCode(code);
    if (result.status === "pending") {
      return NextResponse.json({ status: "pending" });
    }
    if (result.status === "expired") {
      return NextResponse.json({ status: "expired" });
    }

    const customToken = await adminAuth.createCustomToken(result.uid);
    await deletePairingCode(code);
    return NextResponse.json({ status: "claimed", customToken });
  } catch (err) {
    console.error("TV pairing poll error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
