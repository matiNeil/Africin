"use client";

import { useState, useMemo, useEffect, Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CONTENT, GENRES, COUNTRIES } from "@/lib/data";
import ContentCard from "@/components/ContentCard";

function BrowseContent() {
  const searchParams = useSearchParams();
  const [selectedGenre, setSelectedGenre] = useState("All");
  const [selectedCountry, setSelectedCountry] = useState("All");
  const [selectedType, setSelectedType] = useState<"all" | "movie" | "series">("all");
  const [search, setSearch] = useState(searchParams.get("q") || "");

  // Sync search input when URL ?q param changes (e.g. from navbar search)
  useEffect(() => {
    const q = searchParams.get("q") || "";
    setSearch(q);
  }, [searchParams]);

  const filtered = useMemo(() => {
    return CONTENT.filter((item) => {
      const matchesGenre = selectedGenre === "All" || item.genre.includes(selectedGenre);
      const matchesCountry = selectedCountry === "All" || item.country === selectedCountry;
      const matchesType = selectedType === "all" || item.type === selectedType;
      const matchesSearch =
        search === "" ||
        item.title.toLowerCase().includes(search.toLowerCase()) ||
        item.description.toLowerCase().includes(search.toLowerCase());
      return matchesGenre && matchesCountry && matchesType && matchesSearch;
    });
  }, [selectedGenre, selectedCountry, selectedType, search]);

  const clearAll = () => {
    setSelectedGenre("All"); setSelectedCountry("All");
    setSelectedType("all"); setSearch("");
  };

  return (
    <main className="min-h-screen bg-black pt-16 pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="py-10">
          <h1 className="font-display font-semibold text-3xl sm:text-4xl text-white tracking-tight mb-1">Browse</h1>
          <div className="h-px w-12 bg-gradient-to-r from-red-500 to-transparent mt-2" />
          <p className="text-zinc-500 text-xs uppercase tracking-widest mt-3">Explore African stories from across the continent</p>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search titles, descriptions…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white/5 border border-white/8 text-white placeholder-zinc-600 rounded-2xl pl-11 pr-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-red-500/50 transition-all"
          />
        </div>

        {/* Filters */}
        <div className="space-y-3 mb-8">
          {/* Type */}
          <div className="flex bg-white/5 rounded-full w-fit p-0.5 gap-0.5">
            {(["all", "movie", "series"] as const).map((type) => (
              <button key={type} onClick={() => setSelectedType(type)}
                className={`px-5 py-1.5 rounded-full text-[10px] font-semibold uppercase tracking-widest transition-all duration-300 ${
                  selectedType === type ? "bg-red-500 text-black" : "text-zinc-500 hover:text-white"
                }`}>
                {type === "all" ? "All" : type === "movie" ? "Films" : "Series"}
              </button>
            ))}
          </div>

          {/* Genres */}
          <div className="flex flex-wrap gap-2">
            {GENRES.map((genre) => (
              <button key={genre} onClick={() => setSelectedGenre(genre)}
                className={`px-3 py-1.5 rounded-full text-[10px] font-semibold uppercase tracking-wider transition-all duration-300 ${
                  selectedGenre === genre
                    ? "bg-red-500/15 border border-red-500/50 text-red-500"
                    : "border border-white/8 text-zinc-600 hover:border-white/20 hover:text-zinc-300"
                }`}>
                {genre}
              </button>
            ))}
          </div>

          {/* Countries */}
          <div className="flex flex-wrap gap-2">
            {COUNTRIES.map((country) => (
              <button key={country} onClick={() => setSelectedCountry(country)}
                className={`px-3 py-1.5 rounded-full text-[10px] font-semibold uppercase tracking-wider transition-all duration-300 ${
                  selectedCountry === country
                    ? "bg-red-500/15 border border-red-500/50 text-red-500"
                    : "border border-white/8 text-zinc-600 hover:border-white/20 hover:text-zinc-300"
                }`}>
                {country === "All" ? "All Countries" : country}
              </button>
            ))}
          </div>
        </div>

        {/* Count */}
        <p className="text-zinc-600 text-xs uppercase tracking-widest mb-6">
          {filtered.length} title{filtered.length !== 1 ? "s" : ""}
        </p>

        {/* Grid */}
        {filtered.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {filtered.map((item) => (
              <ContentCard key={item.id} content={item} size="sm" />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <div className="w-14 h-14 rounded-full border border-white/10 flex items-center justify-center mb-5">
              <svg className="w-6 h-6 text-zinc-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <h3 className="font-display text-xl text-zinc-500 mb-2">Nothing found</h3>
            <p className="text-zinc-700 text-sm mb-5">Try adjusting your filters</p>
            <button onClick={clearAll} className="border border-red-500/40 text-red-500 text-xs uppercase tracking-widest px-5 py-2 rounded-full hover:bg-red-500/10 transition-colors">
              Clear all
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

export default function BrowsePage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-black pt-16 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
      </main>
    }>
      <BrowseContent />
    </Suspense>
  );
}
