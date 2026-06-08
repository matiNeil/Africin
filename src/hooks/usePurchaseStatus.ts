"use client";

import { useState, useEffect } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";

export function usePurchaseStatus(contentId: string) {
  const { user } = useAuth();
  const [isPaid, setIsPaid] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!user) {
      setIsPaid(false);
      setChecking(false);
      return;
    }
    setChecking(true);
    const q = query(
      collection(db, "purchases"),
      where("userId", "==", user.uid),
      where("contentId", "==", contentId),
      where("status", "==", "paid")
    );
    getDocs(q)
      .then((snap) => setIsPaid(!snap.empty))
      .catch(() => setIsPaid(false))
      .finally(() => setChecking(false));
  }, [user, contentId]);

  return { isPaid, checking, markPaid: () => setIsPaid(true) };
}
