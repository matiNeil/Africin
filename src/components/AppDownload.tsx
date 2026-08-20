"use client";

import { useState, useRef, useCallback } from "react";

type Variant = "badges" | "compact";

interface AppDownloadProps {
  /** "badges" = App Store (coming soon) + Android direct-download buttons, "compact" = single Android download pill */
  variant?: Variant;
  className?: string;
  /** Optional label override for the compact pill */
  label?: string;
}

const ANDROID_DOWNLOAD_URL =
  "https://play.google.com/store/apps/details?id=com.africin.africin_mobile";

/**
 * App download call-to-action.
 *
 * Android: links to the Play Store listing.
 * iOS: still in App Store review, so that button stays a "Coming soon" toast
 * until it's approved — swap its onClick for a real App Store link then.
 */
export default function AppDownload({
  variant = "badges",
  className = "",
  label = "Get it on Google Play",
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
        iOS app coming soon — currently in App Store review.
      </span>
    </div>
  ) : null;

  if (variant === "compact") {
    return (
      <a
        href={ANDROID_DOWNLOAD_URL}
        className={`flex items-center gap-2 bg-red-500 hover:bg-red-600 text-black text-xs font-semibold tracking-wider uppercase px-4 py-1.5 rounded-full transition-all duration-300 ${className}`}
      >
        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M17 1.01 7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14z" />
        </svg>
        {label}
      </a>
    );
  }

  return (
    <>
      <div className={`flex flex-wrap items-center gap-3 ${className}`}>
        {/* App Store — coming soon (in review) */}
        <button
          onClick={handleComingSoon}
          aria-label="Download on the App Store — coming soon, in App Store review"
          className="group flex items-center gap-3 bg-white text-black hover:bg-zinc-200 rounded-xl pl-4 pr-5 py-2.5 transition-all duration-300 shadow-lg shadow-black/30"
        >
          <svg className="w-7 h-7 flex-none" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.84M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
          </svg>
          <span className="text-left leading-tight">
            <span className="block text-[9px] uppercase tracking-wider text-zinc-600">Coming soon on the</span>
            <span className="block text-base font-semibold -mt-0.5">App Store</span>
          </span>
        </button>

        {/* Android — Play Store listing */}
        <a
          href={ANDROID_DOWNLOAD_URL}
          aria-label="Get the Africin app on Google Play"
          className="group flex items-center gap-3 bg-white text-black hover:bg-zinc-200 rounded-xl pl-4 pr-5 py-2.5 transition-all duration-300 shadow-lg shadow-black/30"
        >
          <svg className="w-6 h-6 flex-none" fill="currentColor" viewBox="0 0 24 24">
            <path d="M17.6 9.48l1.84-3.18c.16-.31.04-.69-.26-.85a.637.637 0 0 0-.83.22l-1.88 3.24a11.463 11.463 0 0 0-8.94 0L5.65 5.67a.637.637 0 0 0-.87-.2c-.28.18-.37.54-.22.83L6.4 9.48A10.78 10.78 0 0 0 1 18h22a10.78 10.78 0 0 0-5.4-8.52M7 15.25a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5m10 0a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5" />
          </svg>
          <span className="text-left leading-tight">
            <span className="block text-[9px] uppercase tracking-wider text-zinc-600">Get it on</span>
            <span className="block text-base font-semibold -mt-0.5">Google Play</span>
          </span>
        </a>
      </div>
      {Toast}
    </>
  );
}
