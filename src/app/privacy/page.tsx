import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Africin",
  description:
    "Privacy Policy for the Africin mobile application — what we collect, how we use it, and your choices.",
};

const SUPPORT_EMAIL = "support@africin.tv";
const LAST_UPDATED = "June 23, 2026";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-black pt-24 pb-20">
      <article className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <header className="mb-10">
          <span className="text-red-500/80 text-[10px] font-medium tracking-[0.25em] uppercase">Legal</span>
          <h1 className="font-display font-bold text-3xl sm:text-4xl text-white tracking-tight mt-2">
            Privacy Policy
          </h1>
          <div className="h-px w-12 bg-gradient-to-r from-red-500 to-transparent mt-3 mb-4" />
          <p className="text-zinc-500 text-xs uppercase tracking-widest">Last updated: {LAST_UPDATED}</p>
        </header>

        {/* Body */}
        <div className="space-y-9 text-zinc-400 text-sm leading-relaxed">
          <section>
            <p>
              This Privacy Policy explains how Africin (&ldquo;Africin&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;, or
              &ldquo;our&rdquo;) collects, uses, and shares information about you when you use the Africin mobile
              application (the &ldquo;App&rdquo;) and related services, including this website. By using the App, you
              agree to the practices described in this policy.
            </p>
          </section>

          <section>
            <h2 className="font-display font-semibold text-xl text-white mb-3">1. Information We Collect</h2>
            <p className="mb-3">We collect the following categories of information:</p>
            <ul className="space-y-2 list-disc pl-5 marker:text-red-500/60">
              <li>
                <span className="text-zinc-300 font-medium">Account information</span> — such as your name, email
                address, and password (stored securely) when you create an account or sign in.
              </li>
              <li>
                <span className="text-zinc-300 font-medium">Payment information</span> — when you purchase or
                pre-order content, our payment provider processes your payment. We receive transaction records
                (amount, currency, status, reference) but do not store full card details.
              </li>
              <li>
                <span className="text-zinc-300 font-medium">Usage and viewing activity</span> — content you watch,
                watch progress, watchlist items, searches, and interactions within the App.
              </li>
              <li>
                <span className="text-zinc-300 font-medium">Device and technical data</span> — device type,
                operating system, app version, IP address, and diagnostic or crash data.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-display font-semibold text-xl text-white mb-3">2. How We Use Your Information</h2>
            <ul className="space-y-2 list-disc pl-5 marker:text-red-500/60">
              <li>Provide, operate, and maintain the App and stream content to you.</li>
              <li>Process payments, pre-orders, and unlock purchased or live content.</li>
              <li>Remember your watchlist and resume playback where you left off.</li>
              <li>Personalize recommendations and improve our content and features.</li>
              <li>Send you service-related communications and respond to support requests.</li>
              <li>Detect, prevent, and address fraud, abuse, and security issues.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display font-semibold text-xl text-white mb-3">3. How We Share Information</h2>
            <p className="mb-3">
              We do not sell your personal information. We share information only with trusted service providers
              who process it on our behalf, and where required by law:
            </p>
            <ul className="space-y-2 list-disc pl-5 marker:text-red-500/60">
              <li>
                <span className="text-zinc-300 font-medium">Authentication &amp; database</span> — Google Firebase
                (authentication, Firestore) to manage accounts, watchlists, and viewing progress.
              </li>
              <li>
                <span className="text-zinc-300 font-medium">Payments</span> — our payment processor to securely
                handle transactions and confirm purchases.
              </li>
              <li>
                <span className="text-zinc-300 font-medium">Video delivery &amp; analytics</span> — providers that
                help us stream video and understand aggregate, anonymized app usage.
              </li>
              <li>
                <span className="text-zinc-300 font-medium">Legal</span> — authorities or third parties when
                required to comply with the law or protect our rights and users.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-display font-semibold text-xl text-white mb-3">4. Data Retention</h2>
            <p>
              We retain your information for as long as your account is active or as needed to provide the App,
              comply with legal obligations, resolve disputes, and enforce our agreements. You may request deletion
              of your account and associated data at any time (see Your Rights below).
            </p>
          </section>

          <section>
            <h2 className="font-display font-semibold text-xl text-white mb-3">5. Security</h2>
            <p>
              We use industry-standard safeguards to protect your information, including encryption in transit and
              access controls. However, no method of transmission or storage is completely secure, and we cannot
              guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="font-display font-semibold text-xl text-white mb-3">6. Your Rights &amp; Choices</h2>
            <p className="mb-3">Depending on your location, you may have the right to:</p>
            <ul className="space-y-2 list-disc pl-5 marker:text-red-500/60">
              <li>Access, correct, or update your personal information.</li>
              <li>Request deletion of your account and associated data.</li>
              <li>Object to or restrict certain processing of your data.</li>
              <li>Withdraw consent where processing is based on consent.</li>
            </ul>
            <p className="mt-3">
              To exercise any of these rights, contact us at{" "}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="text-red-400 hover:text-red-300 transition-colors">
                {SUPPORT_EMAIL}
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="font-display font-semibold text-xl text-white mb-3">7. Children&apos;s Privacy</h2>
            <p>
              The App is not directed to children under 13 (or the minimum age required in your country), and we do
              not knowingly collect personal information from them. If you believe a child has provided us with
              personal information, please contact us so we can remove it.
            </p>
          </section>

          <section>
            <h2 className="font-display font-semibold text-xl text-white mb-3">8. International Data Transfers</h2>
            <p>
              Your information may be processed and stored in countries other than your own. Where we transfer data
              internationally, we take steps to ensure it receives an adequate level of protection.
            </p>
          </section>

          <section>
            <h2 className="font-display font-semibold text-xl text-white mb-3">9. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. When we do, we will revise the &ldquo;Last
              updated&rdquo; date above and, where appropriate, notify you within the App.
            </p>
          </section>

          <section>
            <h2 className="font-display font-semibold text-xl text-white mb-3">10. Contact Us</h2>
            <p>
              If you have questions about this Privacy Policy or how we handle your data, contact us at{" "}
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
