"use client";

import Link from "next/link";
import Image from "next/image";
import { Content } from "@/lib/data";

interface ContentCardProps {
  content: Content;
  size?: "sm" | "md" | "lg";
}

export default function ContentCard({ content, size = "md" }: ContentCardProps) {
  const sizeClasses = {
    sm: "w-36 sm:w-44",
    md: "w-44 sm:w-52",
    lg: "w-52 sm:w-64",
  };

  return (
    <Link href={`/watch/${content.id}`} className={`group flex-none ${sizeClasses[size]}`}>
      <div className="card-hover relative overflow-hidden rounded-2xl bg-zinc-950 aspect-video border border-white/5 group-hover:border-amber-500/20 group-hover:glow-gold">
        <Image
          src={content.thumbnail}
          alt={content.title}
          fill
          className="object-cover transition-transform duration-700 group-hover:scale-105"
          sizes="(max-width: 640px) 144px, (max-width: 768px) 176px, 208px"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/30 to-black/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300">
          <div className="w-11 h-11 rounded-full bg-amber-400/20 backdrop-blur-md border border-amber-400/50 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <svg className="w-4 h-4 text-amber-300 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>

        <div className="absolute top-2 left-2 flex flex-col gap-1">
          {content.premiere && (
            <span className="bg-gradient-to-r from-amber-500 to-amber-600 text-black text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
              Premiere
            </span>
          )}
          {content.ppv && !content.premiere && (
            <span className="bg-purple-500/80 backdrop-blur-sm text-white text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
              PPV
            </span>
          )}
          {content.type === "series" && !content.premiere && !content.ppv && (
            <span className="bg-white/10 backdrop-blur-sm text-gray-200 text-[9px] font-medium px-2 py-0.5 rounded-full uppercase tracking-wider border border-white/10">
              Series
            </span>
          )}
        </div>

        {content.price && content.price > 0 && (
          <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm text-amber-400 text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-amber-500/30">
            ${content.price}
          </div>
        )}

        <div className="absolute bottom-0 left-0 right-0 p-3 translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
          <div className="flex items-center gap-1.5 text-[10px]">
            <span className="text-amber-400 font-semibold">{content.country}</span>
            <span className="text-white/30">·</span>
            <span className="text-white/50">{content.year}</span>
            <span className="text-white/30">·</span>
            <span className="text-white/50">{content.rating}</span>
          </div>
        </div>
      </div>

      <div className="mt-2.5 px-0.5">
        <h3 className="text-zinc-200 text-sm font-medium truncate group-hover:text-amber-300 transition-colors duration-300">
          {content.title}
        </h3>
        <p className="text-zinc-600 text-xs mt-0.5 truncate">
          {content.genre.slice(0, 2).join(" · ")}
        </p>
      </div>
    </Link>
  );
}
