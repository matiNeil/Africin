import { getAllLiveStreams } from "@/lib/live-repo";
import LivePageClient from "./LivePageClient";

export const revalidate = 60;

export default async function LivePage() {
  const streams = await getAllLiveStreams();
  return <LivePageClient streams={streams} />;
}
