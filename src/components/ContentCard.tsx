"use client";

import Link from "next/link";
import Image from "next/image";
import { Content } from "@/lib/data";

type CardSize = "sm" | "md" | "lg";

const SIZE_CLASSES: Record<CardSize, string> = {
  sm: "w-40 sm:w-48",
  md: "w-44 sm:w-56",
  lg: "w-56 sm:w-64",
};

function frameClass(size: CardSize, fluid: boolean) {
  return fluid ? "w-full" : `flex-none ${SIZE_CLASSES[size]}`;
}

interface ContentCardProps {
  content: Content;
  size?: CardSize;
  /** Fill the parent (e.g. a grid cell) instead of a fixed row width. */
  fluid?: boolean;
}

export default function ContentCard({ content, size = "md", fluid = false }: ContentCardProps) {
  return (
    <Link
      href={`/watch/${content.id}`}
      className={`group relative z-0 hover:z-30 ${frameClass(size, fluid)}`}
    >
      <div className="relative aspect-video overflow-hidden rounded-xl bg-zinc-900 ring-1 ring-white/10 shadow-lg shadow-black/40 transition-all duration-300 group-hover:scale-[1.06] group-hover:-translate-y-1 group-hover:ring-red-500/60 group-hover:shadow-2xl group-hover:shadow-red-950/50">
        <Image
          src={content.thumbnail}
          alt={content.title}
          fill
          className="object-cover transition-transform duration-700 group-hover:scale-105"
          sizes="(max-width: 640px) 176px, (max-width: 768px) 224px, 256px"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300">
          <div className="w-12 h-12 rounded-full bg-red-500/25 backdrop-blur-md border border-red-500/60 flex items-center justify-center shadow-lg shadow-red-500/30">
            <svg className="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>

        <div className="absolute top-2 left-2 flex flex-col gap-1">
          {content.premiere && (
            <span className="bg-gradient-to-r from-red-500 to-red-700 text-white text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">
              Premiere
            </span>
          )}
          {content.ppv && !content.premiere && (
            <span className="bg-white/15 backdrop-blur-sm text-white text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider border border-white/15">
              PPV
            </span>
          )}
          {content.type === "series" && !content.premiere && !content.ppv && (
            <span className="bg-white/10 backdrop-blur-sm text-gray-200 text-[9px] font-medium px-2 py-0.5 rounded uppercase tracking-wider border border-white/10">
              Series
            </span>
          )}
        </div>

        {content.price != null && content.price > 0 && (
          <div className="absolute top-2 right-2 bg-black/70 backdrop-blur-sm text-red-400 text-[10px] font-bold px-1.5 py-0.5 rounded border border-red-500/30">
            ${content.price}
          </div>
        )}

        <div className="absolute bottom-0 left-0 right-0 p-3 translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
          <div className="flex items-center gap-1.5 text-[10px]">
            <span className="text-red-400 font-semibold">{content.country}</span>
            <span className="text-white/30">·</span>
            <span className="text-white/60">{content.year}</span>
            <span className="text-white/30">·</span>
            <span className="text-white/60">{content.rating}</span>
          </div>
        </div>
      </div>

      <div className="mt-2.5 px-0.5">
        <h3 className="text-zinc-200 text-sm font-medium truncate group-hover:text-white transition-colors duration-300">
          {content.title}
        </h3>
        <p className="text-zinc-600 text-xs mt-0.5 truncate">
          {content.genre.slice(0, 2).join(" · ")}
        </p>
      </div>
    </Link>
  );
}

/** Honest "Coming soon" placeholder tile used to fill rows/grids. */
export function ComingSoonCard({
  size = "md",
  fluid = false,
}: {
  size?: CardSize;
  fluid?: boolean;
}) {
  return (
    <div className={`relative ${frameClass(size, fluid)}`} aria-hidden="true">
      <div className="relative aspect-video overflow-hidden rounded-xl border border-dashed border-white/10 bg-gradient-to-br from-zinc-900 via-zinc-950 to-black flex flex-col items-center justify-center gap-2">
        <svg className="w-6 h-6 text-zinc-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4h16a1 1 0 011 1v14a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1zM7 4v16M17 4v16M3 9h4m10 0h4M3 15h4m10 0h4" />
        </svg>
        <span className="text-zinc-600 text-[9px] font-medium uppercase tracking-[0.25em]">Coming soon</span>
      </div>
      <div className="mt-2.5 px-0.5">
        <div className="h-2.5 w-2/3 rounded bg-white/5" />
      </div>
    </div>
  );
}
