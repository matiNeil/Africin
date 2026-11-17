import InfluencerDetailClient from "./InfluencerDetailClient";

export const metadata = { title: "Influencer | Africin admin" };

export default async function InfluencerDetailPage({
  params,
}: {
  params: Promise<{ influencerId: string }>;
}) {
  const { influencerId } = await params;
  return <InfluencerDetailClient influencerId={influencerId} />;
}
