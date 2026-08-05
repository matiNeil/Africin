import { notFound } from "next/navigation";
import { getAllLiveStreams } from "@/lib/live-repo";
import LiveEventPageClient from "./LiveEventPageClient";

export const revalidate = 60;

export default async function LiveEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const stream = (await getAllLiveStreams()).find((s) => s.id === id);

  if (!stream) return notFound();

  return <LiveEventPageClient stream={stream} />;
}
