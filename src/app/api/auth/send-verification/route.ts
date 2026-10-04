import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { sendVerificationEmail } from "@/lib/email";

// Generates the verification link via Firebase Admin and emails it
// ourselves through Resend (see sendVerificationEmail) instead of using
// User.sendEmailVerification client-side, whose default delivery lands in
// spam. Requires auth (unlike password-reset) since it's always for the
// currently signed-in user, not an arbitrary email.
export async function POST(req: NextRequest) {
  try {
    const { authToken } = await req.json();
    if (typeof authToken !== "string" || !authToken) {
      return NextResponse.json({ error: "Missing authToken" }, { status: 400 });
    }

    const decoded = await adminAuth.verifyIdToken(authToken);
    if (!decoded.email) {
      return NextResponse.json({ error: "No email on account" }, { status: 400 });
    }
    if (decoded.email_verified) {
      return NextResponse.json({ ok: true, alreadyVerified: true });
    }

    const verifyLink = await adminAuth.generateEmailVerificationLink(decoded.email);
    await sendVerificationEmail({ to: decoded.email, verifyLink });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Send verification error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
