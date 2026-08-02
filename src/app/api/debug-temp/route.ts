import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

// TEMPORARY diagnostic route — delete once the Apple IAP unlock issue is
// resolved. Protected by a shared-secret query param so it isn't a public
// data leak while it exists.
export async function GET(req: Request) {
  const secret = new URL(req.url).searchParams.get("key");
  if (secret !== "africin-debug-2026") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const contentSnap = await adminDb.collection("content").get();
  const content = contentSnap.docs
    .map((d) => ({
      id: d.id,
      title: d.data().title,
      appleProductId: d.data().appleProductId ?? null,
      androidProductId: d.data().androidProductId ?? null,
      price: d.data().price ?? null,
    }))
    .filter((c) => (c.title ?? "").toLowerCase().includes("madlela"));

  const purchasesSnap = await adminDb
    .collection("purchases")
    .orderBy("createdAt", "desc")
    .limit(15)
    .get();
  const purchases = purchasesSnap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  }));

  return NextResponse.json({ content, purchases });
}
