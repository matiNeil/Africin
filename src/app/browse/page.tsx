import { Suspense } from "react";
import BrowseClient from "./BrowseClient";

export default function BrowsePage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-black pt-16 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
        </main>
      }
    >
      <BrowseClient />
    </Suspense>
  );
}
