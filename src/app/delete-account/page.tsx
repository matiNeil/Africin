import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Delete Your Account — Africin",
  description:
    "How to delete your Africin account and associated personal data from the mobile app, or by contacting support.",
};

const SUPPORT_EMAIL = "support@africin.tv";

export default function DeleteAccountPage() {
  return (
    <main className="min-h-screen bg-black pt-24 pb-20">
      <article className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <header className="mb-10">
          <span className="text-red-500/80 text-[10px] font-medium tracking-[0.25em] uppercase">Account</span>
          <h1 className="font-display font-bold text-3xl sm:text-4xl text-white tracking-tight mt-2">
            Delete Your Africin Account
          </h1>
          <div className="h-px w-12 bg-gradient-to-r from-red-500 to-transparent mt-3 mb-4" />
        </header>

        {/* Body */}
        <div className="space-y-9 text-zinc-400 text-sm leading-relaxed">
          <section>
            <p>
              Africin users can delete their account and associated personal data directly from the Africin mobile
              application.
            </p>
          </section>

          <section>
            <h2 className="font-display font-semibold text-xl text-white mb-3">To delete your account:</h2>
            <ol className="space-y-2 list-decimal pl-5 marker:text-red-500/60">
              <li>Open the Africin app.</li>
              <li>Sign in to your account.</li>
              <li>Go to the <span className="text-zinc-300 font-medium">Account</span> tab.</li>
              <li>
                Scroll down and select <span className="text-zinc-300 font-medium">Delete Account</span>.
              </li>
              <li>Confirm your account deletion request, re-entering your password if prompted.</li>
            </ol>
          </section>

          <section>
            <h2 className="font-display font-semibold text-xl text-white mb-3">What gets deleted</h2>
            <p>
              Once confirmed, your Africin account and associated personal data are permanently deleted. This
              includes your profile information, saved watchlist, and downloads on your device. This action cannot
              be undone.
            </p>
          </section>

          <section>
            <h2 className="font-display font-semibold text-xl text-white mb-3">What we retain</h2>
            <p>
              Some information may be retained where required for legal, security, fraud-prevention, payment, or
              regulatory purposes &mdash; for example, purchase and transaction records. Any retained information is
              stored only for the required retention period.
            </p>
          </section>

          <section>
            <h2 className="font-display font-semibold text-xl text-white mb-3">Can&apos;t access the app?</h2>
            <p>
              If you cannot access the Africin app, you may request account deletion by contacting Africin Support
              at{" "}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="text-red-400 hover:text-red-300 transition-colors">
                {SUPPORT_EMAIL}
              </a>
              .
            </p>
          </section>
        </div>
      </article>
    </main>
  );
}
