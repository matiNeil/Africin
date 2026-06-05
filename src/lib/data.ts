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
  videoUrl?: string;
  // Monetisation
  price?: number;           // price in USD (0 = free)
  currency?: string;        // "USD" | "ZAR" | "NGN" | "KES" | "GHS"
  premiere?: boolean;       // highlighted as a premiere release
  premiereDate?: string;    // ISO date string — future = upcoming, past = available now
  ppv?: boolean;            // pay-per-view even after premiere window
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
}

export const CONTENT: Content[] = [
  {
    id: "16",
    title: "Sizolobola: The Solemnity",
    description:
      "A powerful Zimbabwean feature film that tells the story of Njabulo Khumalo and Makatendeka Seke, two lovers from different ethnic backgrounds whose dream of marriage reignites deep-rooted family and historical tensions. As their families confront painful memories, cultural differences, and generations of mistrust, the couple becomes a symbol of hope — proving the power of love to heal old wounds and unite a nation.",
    thumbnail: "/sizolobola-poster.jpg",
    backdrop: "/sizolobola-poster.jpg",
    year: 2026,
    duration: "Feature Film",
    genre: ["Drama", "Romance", "Family"],
    rating: "PG-13",
    country: "Zimbabwe",
    type: "movie",
    premiere: true,
    premiereDate: "2026-07-10T18:00:00Z",
    price: 6.99,
    currency: "USD",
    videoUrl: "https://vimeo.com/1198480130/1b0ef67983",
  },
];

// ── Live Streams ────────────────────────────────────────────────────────────
export const LIVE_STREAMS: LiveStream[] = [
  {
    id: "live-1",
    title: "Sizolobola: Premiere Screening",
    description:
      "Watch the premiere of \"Sizolobola: The Solemnity\" — a powerful Zimbabwean love story. Join the live red carpet event, followed by the full film and a cast Q&A.",
    thumbnail: "/sizolobola-poster.jpg",
    backdrop: "/sizolobola-poster.jpg",
    isLive: false,
    startTime: "2026-07-10T17:00:00Z",
    endTime: "2026-07-10T22:00:00Z",
    price: 6.99,
    currency: "USD",
    host: "Africin Originals",
    country: "Zimbabwe",
    genre: ["Drama", "Romance", "Premiere"],
    chatEnabled: true,
  },
];

export const GENRES = [
  "All",
  "Drama",
  "Romance",
  "Family",
];

export const COUNTRIES = [
  "All",
  "Zimbabwe",
];

export const FEATURED = CONTENT[0];
export const PREMIERES = CONTENT.filter((c) => c.premiere);
