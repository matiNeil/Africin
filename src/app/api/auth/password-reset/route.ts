import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { sendPasswordReset } from "@/lib/email";

// Generates the reset link via Firebase Admin and emails it ourselves
// through Resend (see sendPasswordReset) instead of using Firebase Auth's
// client-side sendPasswordResetEmail, whose default delivery lands in spam.
export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    try {
      const resetLink = await adminAuth.generatePasswordResetLink(email);
      await sendPasswordReset({ to: email, resetLink });
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      // Don't reveal whether the account exists — same response either way.
      if (code !== "auth/user-not-found") {
        console.error("Password reset error:", err);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Password reset request error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
