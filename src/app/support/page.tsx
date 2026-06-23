import type { Metadata } from "next";
import AppDownload from "@/components/AppDownload";

export const metadata: Metadata = {
  title: "Support — Africin",
  description:
    "Get help with the Africin app — downloads, payments, live events, and account questions. Contact our support team.",
};

const SUPPORT_EMAIL = "support@africin.tv";

const FAQS: { q: string; a: string }[] = [
  {
    q: "How do I watch movies and live events?",
    a: "All streaming happens in the Africin mobile app. Download it from the App Store or Google Play, then sign in to watch films, series, and live events on your phone, tablet, or TV.",
  },
  {
    q: "Can I watch on the website?",
    a: "The website is for browsing what's available and getting the app. Watching, purchases, and your watchlist all live inside the Africin app.",
  },
  {
    q: "Where can I download the app?",
    a: "The Africin app is launching soon on the App Store and Google Play. Tap a download button on this site to be taken to the store once it's live.",
  },
  {
    q: "How do payments and pre-orders work?",
    a: "Premieres and pay-per-view events can be purchased or pre-ordered inside the app. Your access unlocks automatically in the app once a premiere or live event begins.",
  },
  {
    q: "I paid but can't see my content. What do I do?",
    a: `Make sure you're signed in to the app with the same account you used to pay. If it still doesn't appear, email us at ${SUPPORT_EMAIL} with your payment reference and we'll sort it out.`,
  },
  {
    q: "How do I manage my account?",
    a: "Account settings, your watchlist, and purchase history are all managed inside the app under your profile.",
  },
];

export default function SupportPage() {
  return (
    <main className="min-h-screen bg-black pt-24 pb-20">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="mb-10">
          <span className="text-red-500/80 text-[10px] font-medium tracking-[0.25em] uppercase">Help Center</span>
          <h1 className="font-display font-bold text-3xl sm:text-4xl text-white tracking-tight mt-2">
            How can we help?
          </h1>
          <div className="h-px w-12 bg-gradient-to-r from-red-500 to-transparent mt-3" />
          <p className="text-zinc-400 text-sm mt-4 max-w-xl leading-relaxed">
            Africin is an app-first streaming service. Browse here, then watch everything in the Africin
            mobile app. Below are answers to common questions — and you can always reach our team directly.
          </p>
        </div>

        {/* Contact card */}
        <div className="rounded-3xl border border-red-500/15 bg-gradient-to-br from-red-950/20 to-zinc-950/60 p-6 sm:p-8 mb-12">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
            <div>
              <h2 className="font-display font-semibold text-xl text-white mb-1">Contact support</h2>
              <p className="text-zinc-400 text-sm">We usually reply within 1–2 business days.</p>
            </div>
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="inline-flex items-center gap-2.5 bg-red-500 hover:bg-red-600 text-black font-semibold text-sm px-6 py-3 rounded-full transition-all shadow-lg shadow-red-900/20 self-start"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              {SUPPORT_EMAIL}
            </a>
          </div>
        </div>

        {/* FAQ */}
        <div className="mb-14">
          <h2 className="font-display font-semibold text-2xl text-white mb-5">Frequently asked questions</h2>
          <div className="space-y-3">
            {FAQS.map(({ q, a }) => (
              <details
                key={q}
                className="group rounded-2xl border border-white/8 bg-white/[0.03] open:border-red-500/20 open:bg-red-950/10 transition-colors"
              >
                <summary className="flex items-center justify-between gap-4 cursor-pointer list-none px-5 py-4 text-white text-sm font-medium">
                  {q}
                  <svg
                    className="w-4 h-4 text-zinc-500 flex-none transition-transform duration-300 group-open:rotate-180"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </summary>
                <p className="px-5 pb-5 -mt-1 text-zinc-400 text-sm leading-relaxed">{a}</p>
              </details>
            ))}
          </div>
        </div>

        {/* Get the app */}
        <div className="rounded-3xl border border-white/8 bg-white/[0.03] p-6 sm:p-8 text-center">
          <h2 className="font-display font-semibold text-xl text-white mb-2">Get the Africin app</h2>
          <p className="text-zinc-400 text-sm mb-6 max-w-md mx-auto">
            Download the app to watch films, series, and live events from across the continent.
          </p>
          <div className="flex justify-center">
            <AppDownload />
          </div>
        </div>
      </div>
    </main>
  );
}
