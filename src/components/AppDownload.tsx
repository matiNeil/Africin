"use client";

import { useState, useRef, useCallback } from "react";

type Variant = "badges" | "compact";

interface AppDownloadProps {
  /** "badges" = App Store + Google Play store buttons, "compact" = single "Get the App" pill */
  variant?: Variant;
  className?: string;
  /** Optional label override for the compact pill */
  label?: string;
}

/**
 * App download call-to-action.
 *
 * The mobile apps are not published yet, so pressing any button surfaces a
 * transient "Coming soon" toast instead of linking to a store. When the apps
 * go live, swap the `handleComingSoon` onClick handlers for real store links.
 */
export default function AppDownload({
  variant = "badges",
  className = "",
  label = "Get the App",
}: AppDownloadProps) {
  const [toast, setToast] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleComingSoon = useCallback(() => {
    setToast(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setToast(false), 2600);
  }, []);

  const Toast = toast ? (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9998] flex items-center gap-2.5 px-5 py-3 rounded-full bg-zinc-900/95 backdrop-blur-xl border border-red-500/30 shadow-2xl shadow-black/60 animate-[fadeIn_0.2s_ease]"
    >
      <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
      <span className="text-sm text-white font-medium">
        Coming soon — the Africin app launches shortly.
      </span>
    </div>
  ) : null;

  if (variant === "compact") {
    return (
      <>
        <button
          onClick={handleComingSoon}
          className={`flex items-center gap-2 bg-red-500 hover:bg-red-600 text-black text-xs font-semibold tracking-wider uppercase px-4 py-1.5 rounded-full transition-all duration-300 ${className}`}
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M17 1.01 7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14z" />
          </svg>
          {label}
        </button>
        {Toast}
      </>
    );
  }

  return (
    <>
      <div className={`flex flex-wrap items-center gap-3 ${className}`}>
        {/* App Store */}
        <button
          onClick={handleComingSoon}
          aria-label="Download on the App Store — coming soon"
          className="group flex items-center gap-3 bg-white text-black hover:bg-zinc-200 rounded-xl pl-4 pr-5 py-2.5 transition-all duration-300 shadow-lg shadow-black/30"
        >
          <svg className="w-7 h-7 flex-none" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.84M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
          </svg>
          <span className="text-left leading-tight">
            <span className="block text-[9px] uppercase tracking-wider text-zinc-600">Download on the</span>
            <span className="block text-base font-semibold -mt-0.5">App Store</span>
          </span>
        </button>

        {/* Google Play */}
        <button
          onClick={handleComingSoon}
          aria-label="Get it on Google Play — coming soon"
          className="group flex items-center gap-3 bg-white text-black hover:bg-zinc-200 rounded-xl pl-4 pr-5 py-2.5 transition-all duration-300 shadow-lg shadow-black/30"
        >
          <svg className="w-6 h-6 flex-none" viewBox="0 0 24 24">
            <path fill="#EA4335" d="M3.6 1.3C3.3 1.6 3.1 2 3.1 2.6v18.8c0 .6.2 1 .5 1.3l.1.1L14.3 12.1v-.2L3.7 1.2l-.1.1z" />
            <path fill="#FBBC04" d="M17.8 15.7l-3.5-3.5v-.2l3.5-3.5.1.1 4.2 2.4c1.2.7 1.2 1.8 0 2.5l-4.3 2.4-.1-.1z" />
            <path fill="#4285F4" d="M17.9 15.6L14.3 12 3.6 22.7c.4.4 1.1.5 1.8.1l12.5-7.2" />
            <path fill="#34A853" d="M17.9 8.4L5.4 1.2C4.7.8 4 .9 3.6 1.3L14.3 12l3.6-3.6z" />
          </svg>
          <span className="text-left leading-tight">
            <span className="block text-[9px] uppercase tracking-wider text-zinc-600">Get it on</span>
            <span className="block text-base font-semibold -mt-0.5">Google Play</span>
          </span>
        </button>
      </div>
      {Toast}
    </>
  );
}
