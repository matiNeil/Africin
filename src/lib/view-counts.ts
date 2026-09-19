import { unstable_cache } from "next/cache";
import { adminDb } from "@/lib/firebase-admin";

// Aggregate play counts written by the mobile app (see watch_screen.dart's
// _trackPlaybackStart) — not written from the website, which only reads
// this to power the "Trending" row. contentId -> count.
async function fetchViewCounts(): Promise<Record<string, number>> {
  try {
    const snap = await adminDb.collection("viewCounts").get();
    const counts: Record<string, number> = {};
    for (const doc of snap.docs) {
      const count = doc.data().count;
      counts[doc.id] = typeof count === "number" ? count : 0;
    }
    return counts;
  } catch (err) {
    console.error("Failed to load view counts from Firestore:", err);
    return {};
  }
}

export const getViewCounts = unstable_cache(fetchViewCounts, ["view-counts"], {
  revalidate: 60,
  tags: ["view-counts"],
});
