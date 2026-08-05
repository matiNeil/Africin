import { Suspense } from "react";
import BrowseClient from "./BrowseClient";
import { getAllContent } from "@/lib/content-repo";

export const revalidate = 60;

export default async function BrowsePage() {
  const items = await getAllContent();
  const genres = ["All", ...Array.from(new Set(items.flatMap((c) => c.genre))).sort()];
  const countries = ["All", ...Array.from(new Set(items.map((c) => c.country).filter(Boolean))).sort()];

  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-black pt-16 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
        </main>
      }
    >
      <BrowseClient items={items} genres={genres} countries={countries} />
    </Suspense>
  );
}
