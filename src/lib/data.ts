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
    id: "1",
    title: "The Black Book",
    description:
      "A deacon sets out to rescue his son who has been falsely accused of murder by a corrupt police officer, discovering a dangerous conspiracy along the way.",
    thumbnail: "https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=400&h=225&fit=crop",
    backdrop: "https://images.unsplash.com/photo-1518676590629-3dcbd9c5a5c9?w=1400&h=600&fit=crop",
    year: 2023,
    duration: "2h 8m",
    genre: ["Thriller", "Action", "Drama"],
    rating: "TV-MA",
    country: "Nigeria",
    type: "movie",
    ppv: true,
    price: 3.99,
    currency: "USD",
  },
  {
    id: "2",
    title: "Shanty Town",
    description:
      "A ruthless drug lord's empire begins to crumble when an undercover detective infiltrates his inner circle in the slums of Lagos.",
    thumbnail: "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=400&h=225&fit=crop",
    backdrop: "https://images.unsplash.com/photo-1574267432553-4b4628081c31?w=1400&h=600&fit=crop",
    year: 2023,
    duration: "6 Episodes",
    genre: ["Crime", "Drama", "Thriller"],
    rating: "TV-MA",
    country: "Nigeria",
    type: "series",
    episodes: 6,
  },
  {
    id: "3",
    title: "Lionheart",
    description:
      "A woman must take over her father's transport company but faces opposition from a stubborn uncle and a mysterious competitor.",
    thumbnail: "https://images.unsplash.com/photo-1485846234645-a62644f84728?w=400&h=225&fit=crop",
    backdrop: "https://images.unsplash.com/photo-1504700610630-ac6aba3536d3?w=1400&h=600&fit=crop",
    year: 2018,
    duration: "1h 35m",
    genre: ["Drama", "Comedy"],
    rating: "PG",
    country: "Nigeria",
    type: "movie",
  },
  {
    id: "4",
    title: "Milking the Rhino",
    description:
      "A gripping documentary exploring conservation efforts and community-based wildlife management across Southern Africa.",
    thumbnail: "https://images.unsplash.com/photo-1547036967-23d11aacaee0?w=400&h=225&fit=crop",
    backdrop: "https://images.unsplash.com/photo-1547036967-23d11aacaee0?w=1400&h=600&fit=crop",
    year: 2022,
    duration: "1h 48m",
    genre: ["Documentary", "Nature"],
    rating: "PG",
    country: "South Africa",
    type: "movie",
  },
  {
    id: "5",
    title: "Kizazi Moto: Generation Fire",
    description:
      "Ten visionary animated stories from Africa's best animators explore the continent's sci-fi future.",
    thumbnail: "https://images.unsplash.com/photo-1614851099511-773084f6911d?w=400&h=225&fit=crop",
    backdrop: "https://images.unsplash.com/photo-1614851099511-773084f6911d?w=1400&h=600&fit=crop",
    year: 2022,
    duration: "10 Episodes",
    genre: ["Animation", "Sci-Fi", "Fantasy"],
    rating: "TV-14",
    country: "Pan-African",
    type: "series",
    episodes: 10,
  },
  {
    id: "6",
    title: "Atlantics",
    description:
      "On the outskirts of Dakar, young workers set out to sea in search of a better future, leaving their loved ones haunted by their spirits.",
    thumbnail: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400&h=225&fit=crop",
    backdrop: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1400&h=600&fit=crop",
    year: 2019,
    duration: "1h 46m",
    genre: ["Drama", "Fantasy", "Romance"],
    rating: "TV-MA",
    country: "Senegal",
    type: "movie",
  },
  {
    id: "7",
    title: "Blood & Water",
    description:
      "After meeting a girl who may be her kidnapped sister at an elite Cape Town school, a teen investigates whether she's right.",
    thumbnail: "https://images.unsplash.com/photo-1580130775562-0ef92da028de?w=400&h=225&fit=crop",
    backdrop: "https://images.unsplash.com/photo-1580130775562-0ef92da028de?w=1400&h=600&fit=crop",
    year: 2020,
    duration: "3 Seasons",
    genre: ["Drama", "Mystery", "Teen"],
    rating: "TV-14",
    country: "South Africa",
    type: "series",
    episodes: 18,
  },
  {
    id: "8",
    title: "Ijo Ope",
    description:
      "A gripping Yoruba-language drama about family ties, betrayal, and the relentless pursuit of justice in modern-day Ibadan.",
    thumbnail: "https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=400&h=225&fit=crop",
    backdrop: "https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=1400&h=600&fit=crop",
    year: 2023,
    duration: "8 Episodes",
    genre: ["Drama", "Family"],
    rating: "TV-14",
    country: "Nigeria",
    type: "series",
    episodes: 8,
  },
  {
    id: "9",
    title: "The Gravedigger's Wife",
    description:
      "A gravedigger in Djibouti must travel to Ethiopia to find the treatment that will save his ailing wife's life.",
    thumbnail: "https://images.unsplash.com/photo-1516912481808-3406841bd33c?w=400&h=225&fit=crop",
    backdrop: "https://images.unsplash.com/photo-1516912481808-3406841bd33c?w=1400&h=600&fit=crop",
    year: 2021,
    duration: "1h 23m",
    genre: ["Drama", "Romance"],
    rating: "PG-13",
    country: "Djibouti",
    type: "movie",
  },
  {
    id: "10",
    title: "Nollywood Babylon",
    description:
      "A fascinating documentary journey into the heart of the world's second-largest film industry, based in Lagos, Nigeria.",
    thumbnail: "https://images.unsplash.com/photo-1478720568477-152d9b164e26?w=400&h=225&fit=crop",
    backdrop: "https://images.unsplash.com/photo-1478720568477-152d9b164e26?w=1400&h=600&fit=crop",
    year: 2008,
    duration: "1h 25m",
    genre: ["Documentary"],
    rating: "PG",
    country: "Nigeria",
    type: "movie",
  },
  {
    id: "11",
    title: "Saloum",
    description:
      "Three mercenaries crash-land in Senegal's Saloum Delta region after a mission gone wrong, with a dangerous secret in their cargo.",
    thumbnail: "https://images.unsplash.com/photo-1542204165-65bf26472b9b?w=400&h=225&fit=crop",
    backdrop: "https://images.unsplash.com/photo-1542204165-65bf26472b9b?w=1400&h=600&fit=crop",
    year: 2021,
    duration: "1h 22m",
    genre: ["Horror", "Action", "Thriller"],
    rating: "TV-MA",
    country: "Senegal",
    type: "movie",
  },
  {
    id: "12",
    title: "Mother City",
    description:
      "Four young friends navigate love, identity, and ambition against the backdrop of a rapidly changing Cape Town.",
    thumbnail: "https://images.unsplash.com/photo-1580060839134-75a5edca2e99?w=400&h=225&fit=crop",
    backdrop: "https://images.unsplash.com/photo-1580060839134-75a5edca2e99?w=1400&h=600&fit=crop",
    year: 2022,
    duration: "2 Seasons",
    genre: ["Drama", "Romance", "LGBT+"],
    rating: "TV-MA",
    country: "South Africa",
    type: "series",
    episodes: 12,
  },
  // ── Premieres ───────────────────────────────────────────────────────────────
  {
    id: "13",
    title: "Lagos After Dark",
    description:
      "An immersive noir thriller set across one sleepless night in Lagos, following three strangers whose lives intersect in a web of crime, love, and redemption.",
    thumbnail: "https://images.unsplash.com/photo-1533488765986-dfa2a9939acd?w=400&h=225&fit=crop",
    backdrop: "https://images.unsplash.com/photo-1533488765986-dfa2a9939acd?w=1400&h=600&fit=crop",
    year: 2026,
    duration: "2h 14m",
    genre: ["Thriller", "Crime", "Drama"],
    rating: "TV-MA",
    country: "Nigeria",
    type: "movie",
    premiere: true,
    premiereDate: "2026-06-15T20:00:00Z",
    price: 5.99,
    currency: "USD",
  },
  {
    id: "14",
    title: "Savanna Rising",
    description:
      "An epic historical drama following the rise of a warrior queen who unites fractured kingdoms across the Sahel to defend against colonial forces.",
    thumbnail: "https://images.unsplash.com/photo-1547471080-7cc2caa01a7e?w=400&h=225&fit=crop",
    backdrop: "https://images.unsplash.com/photo-1547471080-7cc2caa01a7e?w=1400&h=600&fit=crop",
    year: 2026,
    duration: "2h 41m",
    genre: ["Drama", "Action", "Historical"],
    rating: "PG-13",
    country: "Pan-African",
    type: "movie",
    premiere: true,
    premiereDate: "2026-06-20T19:00:00Z",
    price: 6.99,
    currency: "USD",
  },
  {
    id: "15",
    title: "Nairobi Nights",
    description:
      "A Kenyan romantic drama that follows two rival DJs from different worlds falling in love against the backdrop of Nairobi's pulsing nightlife scene.",
    thumbnail: "https://images.unsplash.com/photo-1559827291-72ee739d0d9a?w=400&h=225&fit=crop",
    backdrop: "https://images.unsplash.com/photo-1559827291-72ee739d0d9a?w=1400&h=600&fit=crop",
    year: 2026,
    duration: "1h 58m",
    genre: ["Romance", "Drama", "Music"],
    rating: "PG-13",
    country: "Kenya",
    type: "movie",
    premiere: true,
    premiereDate: "2026-06-08T20:00:00Z",
    price: 4.99,
    currency: "USD",
    ppv: true,
  },
];

// ── Live Streams ────────────────────────────────────────────────────────────
export const LIVE_STREAMS: LiveStream[] = [
  {
    id: "live-1",
    title: "Zimbabwe Unplugged",
    description:
      "An intimate acoustic live concert streaming from the Harare International Conference Centre — featuring Holy Ten, Freeman, Winky D, and Tammy Moyo on one legendary stage.",
    thumbnail: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&h=225&fit=crop",
    backdrop: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=1400&h=600&fit=crop",
    isLive: true,
    viewers: 18742,
    startTime: "2026-06-02T17:00:00Z",
    endTime: "2026-06-02T22:00:00Z",
    price: 4.99,
    currency: "USD",
    host: "Africin Live Zimbabwe",
    country: "Zimbabwe",
    genre: ["Music", "Concert", "Hip-Hop"],
    chatEnabled: true,
  },
  {
    id: "live-2",
    title: "Kadoma Odyssey",
    description:
      "A massive open-air music festival live from Kadoma — headlined by Jah Prayzah, Macheso, and Nutty O in an unforgettable night of Zimbabwean sound.",
    thumbnail: "https://images.unsplash.com/photo-1415201364774-f6f0bb35f28f?w=400&h=225&fit=crop",
    backdrop: "https://images.unsplash.com/photo-1415201364774-f6f0bb35f28f?w=1400&h=600&fit=crop",
    isLive: true,
    viewers: 9630,
    startTime: "2026-06-02T18:30:00Z",
    endTime: "2026-06-02T23:30:00Z",
    price: 0,
    currency: "USD",
    host: "Kadoma Arts & Culture",
    country: "Zimbabwe",
    genre: ["Music", "Sungura", "Urban Grooves"],
    chatEnabled: true,
  },
  {
    id: "live-3",
    title: "Savanna Rising: World Premiere",
    description:
      "Watch the world premiere of \"Savanna Rising\" live from the AFRIFF Globe theatre in Abuja, with a red carpet and cast Q&A.",
    thumbnail: "https://images.unsplash.com/photo-1547471080-7cc2caa01a7e?w=400&h=225&fit=crop",
    backdrop: "https://images.unsplash.com/photo-1547471080-7cc2caa01a7e?w=1400&h=600&fit=crop",
    isLive: false,
    startTime: "2026-06-20T18:00:00Z",
    endTime: "2026-06-20T22:30:00Z",
    price: 6.99,
    currency: "USD",
    host: "Africin Originals",
    country: "Nigeria",
    genre: ["Drama", "Action", "Premiere"],
    chatEnabled: true,
  },
  {
    id: "live-4",
    title: "Nairobi Nights: Exclusive Screening",
    description:
      "Join the live exclusive streaming premiere of \"Nairobi Nights\" — followed by a live cast interview and fan Q&A session.",
    thumbnail: "https://images.unsplash.com/photo-1559827291-72ee739d0d9a?w=400&h=225&fit=crop",
    backdrop: "https://images.unsplash.com/photo-1559827291-72ee739d0d9a?w=1400&h=600&fit=crop",
    isLive: false,
    startTime: "2026-06-08T19:00:00Z",
    endTime: "2026-06-08T22:00:00Z",
    price: 4.99,
    currency: "USD",
    host: "Africin Originals",
    country: "Kenya",
    genre: ["Romance", "Drama", "Premiere"],
    chatEnabled: true,
  },
  {
    id: "live-5",
    title: "Pan-Africa Football Watch Party",
    description:
      "Live watch party for the AFCON qualifier between Nigeria and South Africa, with expert commentary and real-time fan reactions.",
    thumbnail: "https://images.unsplash.com/photo-1553778263-73a83bab9b0c?w=400&h=225&fit=crop",
    backdrop: "https://images.unsplash.com/photo-1553778263-73a83bab9b0c?w=1400&h=600&fit=crop",
    isLive: false,
    startTime: "2026-06-10T15:00:00Z",
    endTime: "2026-06-10T17:30:00Z",
    price: 0,
    currency: "USD",
    host: "AfriSport Network",
    country: "Pan-African",
    genre: ["Sports", "Football"],
    chatEnabled: true,
  },
];

export const GENRES = [
  "All",
  "Action",
  "Animation",
  "Comedy",
  "Crime",
  "Documentary",
  "Drama",
  "Fantasy",
  "Horror",
  "Mystery",
  "Romance",
  "Sci-Fi",
  "Thriller",
];

export const COUNTRIES = [
  "All",
  "Nigeria",
  "South Africa",
  "Zimbabwe",
  "Senegal",
  "Kenya",
  "Ghana",
  "Ethiopia",
  "Pan-African",
];

export const FEATURED = CONTENT[0];

export const TRENDING = CONTENT.slice(0, 6);
export const NEW_RELEASES = CONTENT.slice(3, 9);
export const AFRICAN_ORIGINALS = CONTENT.slice(6, 12);
export const PREMIERES = CONTENT.filter((c) => c.premiere);
