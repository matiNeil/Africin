"use client";

type Variant = "badges" | "compact";

interface AppDownloadProps {
  /** "badges" = App Store + Android direct-download buttons, "compact" = single Android download pill */
  variant?: Variant;
  className?: string;
  /** Optional label override for the compact pill */
  label?: string;
}

const ANDROID_DOWNLOAD_URL =
  "https://play.google.com/store/apps/details?id=com.africin.africin_mobile";

const IOS_DOWNLOAD_URL = "https://apps.apple.com/us/app/africin/id6788138032";

/**
 * App download call-to-action.
 *
 * Android: links to the Play Store listing.
 * iOS: links to the live App Store listing.
 */
export default function AppDownload({
  variant = "badges",
  className = "",
  label = "Get it on Google Play",
}: AppDownloadProps) {
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

  // Official-style black badges (App Store / Google Play brand guidelines
  // call for the badge artwork to stay recognizable — dark background,
  // white text, brand-accurate icons — rather than a custom light pill).
  return (
    <div className={`flex flex-wrap items-center gap-3 ${className}`}>
      {/* App Store */}
      <a
        href={IOS_DOWNLOAD_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Download on the App Store"
        className="group flex items-center gap-2.5 bg-black hover:bg-zinc-900 border border-white/15 rounded-xl pl-3.5 pr-5 py-2 transition-all duration-300 shadow-lg shadow-black/30"
      >
        <svg className="w-7 h-7 flex-none" viewBox="0 0 24 24" fill="#fff">
          <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.84M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
        </svg>
        <span className="text-left leading-tight">
          <span className="block text-[10px] text-white/90">Download on the</span>
          <span className="block text-xl font-semibold text-white -mt-1" style={{ fontFamily: 'ui-sans-serif, system-ui' }}>
            App Store
          </span>
        </span>
      </a>

      {/* Android — Play Store listing */}
      <a
        href={ANDROID_DOWNLOAD_URL}
        aria-label="Get the Africin app on Google Play"
        className="group flex items-center gap-2.5 bg-black hover:bg-zinc-900 border border-white/15 rounded-xl pl-3.5 pr-5 py-2 transition-all duration-300 shadow-lg shadow-black/30"
      >
        <svg className="w-6 h-6 flex-none" viewBox="0 0 512 512">
          <path fill="#00d5ff" d="M99.6 42.3c-6.4 6.7-10.2 17-10.2 30.5v366.5c0 13.5 3.8 23.9 10.2 30.5l1.6 1.5L321.8 256v-5l-220.6-215.2-1.6 1.5z" />
          <path fill="#00f076" d="M395.1 330.9 322 257.8v-3.5l73.1-73.1 1.6 1 86.6 49.2c24.7 14.1 24.7 37.1 0 51.2l-86.6 49.2-1.6 1.1z" />
          <path fill="#ff3a44" d="M397 331.9 322 256.8 99.6 479.2c8.2 8.7 21.7 9.8 37 1.1L397 331.9z" />
          <path fill="#ffcf00" d="M397 180.7 136.6 32.2c-15.3-8.7-28.8-7.6-37 1.1L322 256.8 397 180.7z" />
        </svg>
        <span className="text-left leading-tight">
          <span className="block text-[10px] text-white/90">GET IT ON</span>
          <span className="block text-xl font-semibold text-white -mt-1" style={{ fontFamily: 'ui-sans-serif, system-ui' }}>
            Google Play
          </span>
        </span>
      </a>
    </div>
  );
}
