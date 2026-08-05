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
  },
};

export default nextConfig;
