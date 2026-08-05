export interface Content {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  backdrop: string;
  year: number;
  duration: string;
  genre: string[];
  rating: string;
  country: string;
  type: "movie" | "series";
  episodes?: number;
  videoUrl?: string;        // trailer clip (Cloudflare Stream URL) — autoplays muted as the watch-page hero background
  // Monetisation
  price?: number;           // price in USD (0 = free)
  currency?: string;        // "USD" | "ZAR" | "NGN" | "KES" | "GHS"
  premiere?: boolean;       // highlighted as a premiere release
  premiereDate?: string;    // ISO date string — future = upcoming, past = available now
  ppv?: boolean;            // pay-per-view even after premiere window
  featured?: boolean;       // pins this title as the homepage hero, ahead of the premiere/first-item fallback
}

export interface LiveStream {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  backdrop: string;
  isLive: boolean;
  viewers?: number;
  startTime: string;        // ISO date string
  endTime?: string;
  price?: number;           // 0 = free, >0 = PPV live
  currency?: string;
  host: string;
  country: string;
  genre: string[];
  chatEnabled: boolean;
  embedUrl?: string;        // web player embed (e.g. Cloudflare Stream iframe src)
}

// Hand-curated fallback/bootstrap titles, merged with whatever's published
// through the admin dashboard (see content-repo.ts's getAllContent). Empty
// now that every title is managed there instead — every title that used to
// be hardcoded here (Sizolobola, and the three live events below) is now a
// real Firestore doc, so keeping them here too just duplicated them on
// /browse (two different ids for the same title, since these static entries
// never shared an id with their Firestore counterpart).
export const CONTENT: Content[] = [];

// ── Live Streams ────────────────────────────────────────────────────────────
// See getAllLiveStreams() in live-repo.ts — same "hand-curated fallback,
// currently empty" reasoning as CONTENT above.
export const LIVE_STREAMS: LiveStream[] = [];
