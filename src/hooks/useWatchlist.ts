"use client";

import { useState, useEffect } from "react";
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";

/** Toggle a single content item in the user's watchlist. */
export function useWatchlist(contentId: string) {
  const { user } = useAuth();
  const [isInList, setIsInList] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setIsInList(false); setLoading(false); return; }
    const ref = doc(db, `watchlists/${user.uid}/items/${contentId}`);
    getDoc(ref).then((snap) => {
      setIsInList(snap.exists());
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [user, contentId]);

  const toggle = async () => {
    if (!user) return;
    const ref = doc(db, `watchlists/${user.uid}/items/${contentId}`);
    if (isInList) {
      await deleteDoc(ref);
      setIsInList(false);
    } else {
      await setDoc(ref, { contentId, addedAt: new Date().toISOString() });
      setIsInList(true);
    }
  };

  return { isInList, loading, toggle };
}

/** Fetch all watchlist item IDs for the current user. */
export function useWatchlistItems() {
  const { user } = useAuth();
  const [items, setItems] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setItems([]); setLoading(false); return; }
    const ref = collection(db, `watchlists/${user.uid}/items`);
    getDocs(ref)
      .then((snap) => {
        setItems(snap.docs.map((d) => d.id));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [user]);

  return { items, loading };
}
