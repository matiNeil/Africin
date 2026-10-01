import { NextResponse } from "next/server";
import { createPairingCode } from "@/lib/tv-pairing";

/**
 * Called by the TV app on launch (and whenever a code expires) to get a
 * fresh pairing code to display. No auth — the TV isn't signed in yet, that
 * is the entire point of this flow.
 */
export async function POST() {
  try {
    const { code, expiresAt } = await createPairingCode();
    return NextResponse.json({ code, expiresAt });
  } catch (err) {
    console.error("TV pairing create error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
