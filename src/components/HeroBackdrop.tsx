"use client";

import { useState } from "react";
import Image from "next/image";

interface HeroBackdropProps {
  title: string;
  backdrop: string;
  videoUrl?: string;
}

// Turns a Cloudflare Stream iframe URL (or bare "https://customer-x.
// cloudflarestream.com/{videoId}" link) into a chromeless, autoplaying,
// looping, muted background embed — same player used for live streams,
// just tuned for a hero-clip loop instead of a controllable video.
function buildBackgroundEmbedUrl(videoUrl?: string): string | null {
  if (!videoUrl) return null;
  const match = videoUrl.match(/([a-zA-Z0-9.-]*cloudflarestream\.com)\/([a-zA-Z0-9]+)/);
  if (!match) return null;
  const [, host, videoId] = match;
  const params = new URLSearchParams({
    autoplay: "true",
    muted: "true",
    loop: "true",
    controls: "false",
    preload: "auto",
  });
  return `https://${host}/${videoId}/iframe?${params.toString()}`;
}

// Netflix-style hero: the poster shows immediately, then a muted looping
// trailer clip cross-fades in once it's ready to play.
export default function HeroBackdrop({ title, backdrop, videoUrl }: HeroBackdropProps) {
  const [videoReady, setVideoReady] = useState(false);
  const embedUrl = buildBackgroundEmbedUrl(videoUrl);

  return (
    <div className="absolute inset-0 opacity-50">
      <Image src={backdrop} alt={title} fill priority className="object-cover" sizes="100vw" />
      {embedUrl && (
        <iframe
          src={embedUrl}
          title={`${title} — trailer`}
          className={`absolute inset-0 w-full h-full transition-opacity duration-1000 ${videoReady ? "opacity-100" : "opacity-0"}`}
          style={{ border: "none", pointerEvents: "none" }}
          allow="autoplay; fullscreen"
          onLoad={() => setVideoReady(true)}
        />
      )}
    </div>
  );
}
