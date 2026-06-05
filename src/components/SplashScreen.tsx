"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

export default function SplashScreen() {
  const [phase, setPhase] = useState<"enter" | "hold" | "exit" | "done">("enter");

  useEffect(() => {
    // Logo animates in → hold → fade out → unmount
    const holdTimer = setTimeout(() => setPhase("hold"), 800);
    const exitTimer = setTimeout(() => setPhase("exit"), 3500);
    const doneTimer = setTimeout(() => setPhase("done"), 4200);

    return () => {
      clearTimeout(holdTimer);
      clearTimeout(exitTimer);
      clearTimeout(doneTimer);
    };
  }, []);

  if (phase === "done") return null;

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black flex items-center justify-center"
      style={{
        opacity: phase === "exit" ? 0 : 1,
        transition: phase === "exit" ? "opacity 0.7s ease-in-out" : undefined,
      }}
    >
      <div
        style={{
          transform: phase === "enter" ? "scale(0.85)" : "scale(1)",
          opacity: phase === "enter" ? 0 : 1,
          transition: "transform 0.8s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.8s ease",
        }}
      >
        <Image
          src="/splash-logo.jpg"
          alt="Africin"
          width={420}
          height={315}
          className="object-contain"
          priority
        />
      </div>
    </div>
  );
}
