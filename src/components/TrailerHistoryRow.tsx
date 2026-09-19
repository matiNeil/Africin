"use client";

import { useEffect, useState } from "react";
import { collection, getFirestore, limit, orderBy, query, where, getDocs } from "firebase/firestore";
import { getFirebaseApp, watchAuthState, requireRealUser } from "@/lib/firebase-client";
import type { Content } from "@/lib/data";
import ContentRow from "./ContentRow";

interface TrailerHistoryRowProps {
  /** Full catalog already fetched server-side — resolves contentId -> Content
      client-side without a second network round trip. */
  content: Content[];
}

// Mirrors the mobile app's trailerHistoryProvider: signed out or no history
// -> renders nothing at all, no "sign in to see this" nagging.
export default function TrailerHistoryRow({ content }: TrailerHistoryRowProps) {
  const [items, setItems] = useState<Content[] | null>(null);

  useEffect(() => {
    const unsubscribe = watchAuthState(async (rawUser) => {
      const user = await requireRealUser(rawUser);
      if (!user) {
        setItems(null);
        return;
      }
      const db = getFirestore(getFirebaseApp());
      const q = query(
        collection(db, "trailerHistory"),
        where("userId", "==", user.uid),
        orderBy("watchedAt", "desc"),
        limit(20),
      );
      try {
        const snap = await getDocs(q);
        const byId = new Map(content.map((c) => [c.id, c]));
        const resolved = snap.docs
          .map((d) => byId.get(d.data().contentId as string))
          .filter((c): c is Content => c != null);
        setItems(resolved);
      } catch (err) {
        console.error("Failed to load trailer history:", err);
        setItems(null);
      }
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!items || items.length === 0) return null;
  return <ContentRow title="Trailers You've Watched" items={items} />;
}
