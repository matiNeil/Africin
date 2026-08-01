"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { LiveStream } from "@/lib/data";
import CountdownTimer from "./CountdownTimer";

type CardSize = "sm" | "md" | "lg";

const SIZE_CLASSES: Record<CardSize, string> = {
  sm: "w-40 sm:w-48",
  md: "w-44 sm:w-56",
  lg: "w-56 sm:w-64",
};

interface LiveEventCardProps {
  stream: LiveStream;
  size?: CardSize;
}

export default function LiveEventCard({ stream, size = "md" }: LiveEventCardProps) {
  const [now] = useState(() => Date.now());
  const hasEnded = stream.endTime ? now >= new Date(stream.endTime).getTime() : false;

  return (
    <Link
      href={`/live/${stream.id}`}
      className={`group relative z-0 hover:z-30 flex-none ${SIZE_CLASSES[size]}`}
    >
      <div className="relative aspect-video overflow-hidden rounded-xl bg-zinc-900 ring-1 ring-white/10 shadow-lg shadow-black/40 transition-all duration-300 group-hover:scale-[1.06] group-hover:-translate-y-1 group-hover:ring-red-500/60 group-hover:shadow-2xl group-hover:shadow-red-950/50">
        <Image
          src={stream.thumbnail}
          alt={stream.title}
          fill
          className="object-cover transition-transform duration-700 group-hover:scale-105"
          sizes="(max-width: 640px) 176px, (max-width: 768px) 224px, 256px"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

        <div className="absolute top-2 left-2">
          <span
            className={`text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
              hasEnded ? "bg-black/70 text-zinc-200 border border-white/20" : "bg-red-500 text-white"
            }`}
          >
            {hasEnded ? "On Demand" : "Live Event"}
          </span>
        </div>

        {stream.price != null && stream.price > 0 && (
          <div className="absolute top-2 right-2 bg-black/70 backdrop-blur-sm text-red-400 text-[10px] font-bold px-1.5 py-0.5 rounded border border-red-500/30">
            ${stream.price}
          </div>
        )}

        <div className="absolute bottom-0 left-0 right-0 p-3">
          <CountdownTimer targetDate={stream.startTime} className="text-[10px]" />
        </div>
      </div>

      <div className="mt-2.5 px-0.5">
        <h3 className="text-zinc-200 text-sm font-medium truncate group-hover:text-white transition-colors duration-300">
          {stream.title}
        </h3>
        <p className="text-zinc-600 text-xs mt-0.5 truncate">
          {stream.host} &middot; {stream.country}
        </p>
      </div>
    </Link>
  );
}
