import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Firestore-sourced content/live-stream docs store absolute poster URLs
    // (see content-repo.ts / live-repo.ts) — next/image blocks any external
    // hostname that isn't explicitly allowed here, even this site's own
    // domain when referenced by full URL instead of a relative /path.
    remotePatterns: [
      { protocol: "https", hostname: "www.africin.tv" },
      { protocol: "https", hostname: "africin.tv" },
      // Cloudflare Images delivery (admin-uploaded posters/banners).
      { protocol: "https", hostname: "imagedelivery.net" },
    ],
    // next/image's optimizer serves these through /_next/image?url=<encoded
    // full URL>&w=...&q=... — many ad-blocker/privacy-extension filter lists
    // block requests whose query string itself contains a nested http(s)
    // URL (it looks like a tracking-redirect pattern), which silently killed
    // every poster on the site for anyone running one. `unoptimized` renders
    // a plain <img src="..."> with the original URL instead, sidestepping
    // that proxy entirely. These are already reasonably-sized JPEGs / a CDN
    // (Cloudflare Images), so the resize/format optimization isn't worth
    // trading away image reliability for.
    unoptimized: true,
  },
};

export default nextConfig;
