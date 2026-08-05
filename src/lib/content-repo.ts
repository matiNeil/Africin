import { unstable_cache } from "next/cache";
import type { DocumentData } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { CONTENT, type Content } from "@/lib/data";

// Same Cloudflare Stream account used everywhere else in this app. The admin
// dashboard's own HLS urls default to videodelivery.net unless its
// VITE_STREAM_CUSTOMER_SUBDOMAIN is set (it currently isn't), so we always
// rebuild the iframe embed from the raw video UID instead of trusting
// whatever host is baked into the stored videoUrl/trailerUrl string.
const STREAM_HOST = "customer-fiuwdxvaro0msdf8.cloudflarestream.com";

function embedUrlFor(uid: unknown): string | undefined {
  return typeof uid === "string" && uid ? `https://${STREAM_HOST}/${uid}/iframe` : undefined;
}

function toISODate(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return (value.toDate() as Date).toISOString();
  }
  return undefined;
}

// Mirrors the Flutter app's Content.fromMap (lib/models/content.dart) so the
// website tolerates the same missing/optional fields the mobile app does.
function mapContentDoc(id: string, data: DocumentData): Content {
  return {
    id,
    title: typeof data.title === "string" ? data.title : "",
    description: typeof data.description === "string" ? data.description : "",
    thumbnail: typeof data.thumbnail === "string" ? data.thumbnail : "",
    backdrop: (typeof data.backdrop === "string" && data.backdrop) || data.thumbnail || "",
    year: typeof data.year === "number" ? data.year : new Date().getFullYear(),
    duration: typeof data.duration === "string" ? data.duration : "",
    genre: Array.isArray(data.genre) ? data.genre.filter((g): g is string => typeof g === "string" && g.length > 0) : [],
    rating: typeof data.rating === "string" ? data.rating : "",
    country: typeof data.country === "string" ? data.country : "",
    type: data.type === "series" ? "series" : "movie",
    price: typeof data.price === "number" && data.price > 0 ? data.price : undefined,
    currency: typeof data.currency === "string" ? data.currency : undefined,
    premiere: data.premiere === true,
    premiereDate: toISODate(data.premiereDate),
    featured: data.featured === true,
    videoUrl: embedUrlFor(data.trailerCloudflareUid) ?? embedUrlFor(data.cloudflareUid),
  };
}

async function fetchPublishedMovies(): Promise<Content[]> {
  try {
    const snapshot = await adminDb.collection("content").where("status", "==", "published").get();
    return snapshot.docs
      .map((doc) => mapContentDoc(doc.id, doc.data()))
      .filter((c) => c.type === "movie" && c.title);
  } catch (err) {
    // Firestore being unreachable (or, in local dev, admin credentials not
    // being available) should never take the whole catalog down — just fall
    // back to the hand-curated titles below.
    console.error("Failed to load published movies from Firestore:", err);
    return [];
  }
}

const getCachedPublishedMovies = unstable_cache(fetchPublishedMovies, ["published-movies"], {
  revalidate: 60,
  tags: ["content"],
});

// The website's hand-curated titles (data.ts) plus anything published
// through the admin dashboard — merged so a new admin upload appears here
// automatically, without needing a code change. Static entries win on id
// collisions (there shouldn't be any in practice).
export async function getAllContent(): Promise<Content[]> {
  const remote = await getCachedPublishedMovies();
  const staticIds = new Set(CONTENT.map((c) => c.id));
  return [...CONTENT, ...remote.filter((c) => !staticIds.has(c.id))];
}
