"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface TrailerButtonProps {
  title: string;
  videoUrl: string;
}

// Same Cloudflare Stream embed as the background hero clip, but played with
// sound and controls in a modal instead of muted/looping/chromeless.
function buildPlayableEmbedUrl(videoUrl: string): string {
  const [base] = videoUrl.split("?");
  const params = new URLSearchParams({ autoplay: "true", muted: "false" });
  return `${base}?${params.toString()}`;
}

export default function TrailerButton({ title, videoUrl }: TrailerButtonProps) {
  const [open, setOpen] = useState(false);

  // Lock background scroll and allow Escape to close while the modal is up.
  // Rendering this fixed-inset overlay in place (instead of via a portal)
  // meant any ancestor with a CSS transform/filter/etc. silently turned
  // `position: fixed` into "fixed to that ancestor" instead of the
  // viewport — the modal ended up boxed inside the hero section instead of
  // covering the page, with the content behind it still scrollable.
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 bg-white/15 hover:bg-white/25 backdrop-blur text-white font-semibold text-sm px-6 py-2.5 rounded-md border border-white/10 transition-colors"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
        Trailer
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] bg-black flex items-center justify-center p-4"
            onClick={() => setOpen(false)}
          >
            <div className="relative w-full max-w-4xl aspect-video" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close trailer"
                className="absolute -top-10 right-0 text-zinc-300 hover:text-white text-sm font-medium"
              >
                Close ✕
              </button>
              <iframe
                src={buildPlayableEmbedUrl(videoUrl)}
                title={`${title} — trailer`}
                className="w-full h-full rounded-xl"
                style={{ border: "none" }}
                allow="autoplay; fullscreen"
                allowFullScreen
              />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
