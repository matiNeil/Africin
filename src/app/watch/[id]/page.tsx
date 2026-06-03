import { notFound } from "next/navigation";
import { CONTENT } from "@/lib/data";
import WatchClient from "@/components/WatchClient";

interface WatchPageProps {
  params: Promise<{ id: string }>;
}

export async function generateStaticParams() {
  return CONTENT.map((item) => ({ id: item.id }));
}

export default async function WatchPage({ params }: WatchPageProps) {
  const { id } = await params;
  const content = CONTENT.find((c) => c.id === id);

  if (!content) notFound();

  const related = CONTENT.filter(
    (c) => c.id !== content.id && c.genre.some((g) => content.genre.includes(g))
  ).slice(0, 6);

  return (
    <main className="min-h-screen bg-black pt-16">
      <WatchClient content={content} related={related} />
    </main>
  );
}
