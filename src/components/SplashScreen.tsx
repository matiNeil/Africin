"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

// Mirrors the mobile app's splash_screen.dart: a full-bleed white background
// (kept white so the logo's black + red marks stay legible) with the logo
// simply fading in, held briefly, then the whole screen fades out.
export default function SplashScreen() {
  const [phase, setPhase] = useState<"enter" | "hold" | "exit" | "done">("enter");

  useEffect(() => {
    const holdTimer = setTimeout(() => setPhase("hold"), 900);
    const exitTimer = setTimeout(() => setPhase("exit"), 2800);
    const doneTimer = setTimeout(() => setPhase("done"), 3300);

    return () => {
      clearTimeout(holdTimer);
      clearTimeout(exitTimer);
      clearTimeout(doneTimer);
    };
  }, []);

  if (phase === "done") return null;

  return (
    <div
      className="fixed inset-0 z-[9999] bg-white flex items-center justify-center"
      style={{
        opacity: phase === "exit" ? 0 : 1,
        transition: phase === "exit" ? "opacity 0.5s ease-in-out" : undefined,
      }}
    >
      <div
        className="w-2/3 max-w-[380px] px-8"
        style={{
          opacity: phase === "enter" ? 0 : 1,
          transition: "opacity 0.9s ease",
        }}
      >
        <Image
          src="/splash-logo-white.png"
          alt="Africin"
          width={2048}
          height={1448}
          className="object-contain w-full h-auto"
          priority
        />
      </div>
    </div>
  );
}
