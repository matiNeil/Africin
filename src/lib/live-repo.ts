import { unstable_cache } from "next/cache";
import type { DocumentData } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { LIVE_STREAMS, type LiveStream } from "@/lib/data";

// Same Cloudflare Stream account used everywhere else in this app (see
// content-repo.ts's identical constant/rationale).
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

// Mirrors the Flutter app's LiveStream.fromMap (lib/models/live_stream.dart)
// so the website tolerates the same missing/optional fields the mobile app
// does. chatEnabled has no Firestore equivalent (mobile has no chat feature
// either) — defaults to true, matching every hand-curated entry so far.
function mapLiveStreamDoc(id: string, data: DocumentData): LiveStream {
  return {
    id,
    title: typeof data.title === "string" ? data.title : "",
    description: typeof data.description === "string" ? data.description : "",
    thumbnail: typeof data.thumbnail === "string" ? data.thumbnail : "",
    backdrop: (typeof data.backdrop === "string" && data.backdrop) || data.thumbnail || "",
    isLive: data.isLive === true,
    startTime: toISODate(data.startTime) ?? new Date().toISOString(),
    endTime: toISODate(data.endTime),
    price: typeof data.price === "number" && data.price > 0 ? data.price : undefined,
    currency: typeof data.currency === "string" ? data.currency : undefined,
    host: typeof data.host === "string" ? data.host : "",
    country: typeof data.country === "string" ? data.country : "",
    genre: Array.isArray(data.genre) ? data.genre.filter((g): g is string => typeof g === "string" && g.length > 0) : [],
    chatEnabled: true,
    embedUrl: embedUrlFor(data.cloudflareUid),
  };
}

async function fetchPublishedLiveStreams(): Promise<LiveStream[]> {
  try {
    const snapshot = await adminDb.collection("liveStreams").get();
    return snapshot.docs.map((doc) => mapLiveStreamDoc(doc.id, doc.data())).filter((s) => s.title);
  } catch (err) {
    // Firestore being unreachable should never take the whole events list
    // down — just fall back to the hand-curated entries below.
    console.error("Failed to load live streams from Firestore:", err);
    return [];
  }
}

const getCachedLiveStreams = unstable_cache(fetchPublishedLiveStreams, ["published-live-streams"], {
  revalidate: 60,
  tags: ["live-streams"],
});

// The website's hand-curated events (data.ts) plus anything published
// through the admin dashboard — merged so a new admin-added event appears
// here automatically. Static entries win on id collisions.
export async function getAllLiveStreams(): Promise<LiveStream[]> {
  const remote = await getCachedLiveStreams();
  const staticIds = new Set(LIVE_STREAMS.map((s) => s.id));
  return [...LIVE_STREAMS, ...remote.filter((s) => !staticIds.has(s.id))];
}
