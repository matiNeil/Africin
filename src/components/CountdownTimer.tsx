"use client";

import { useEffect, useState } from "react";

interface CountdownTimerProps {
  targetDate: string;
  className?: string;
  /** "onDark" (default) is white digits for use over video/image scrims that
      are always dark regardless of site theme. "theme" follows light/dark
      mode for placements directly on the page background. */
  variant?: "onDark" | "theme";
}

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

function getTimeLeft(targetDate: string): TimeLeft | null {
  const diff = new Date(targetDate).getTime() - Date.now();
  if (diff <= 0) return null;
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  };
}

export default function CountdownTimer({ targetDate, className = "", variant = "onDark" }: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState<TimeLeft | null>(null);

  useEffect(() => {
    setTimeLeft(getTimeLeft(targetDate));
    const interval = setInterval(() => {
      const t = getTimeLeft(targetDate);
      setTimeLeft(t);
      if (!t) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  if (!timeLeft) {
    return (
      <span className={`text-red-500 font-semibold ${className}`}>Available Now</span>
    );
  }

  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {timeLeft.days > 0 && (
        <Unit value={timeLeft.days} label="d" variant={variant} />
      )}
      <Unit value={timeLeft.hours} label="h" variant={variant} />
      <Sep variant={variant} />
      <Unit value={timeLeft.minutes} label="m" variant={variant} />
      <Sep variant={variant} />
      <Unit value={timeLeft.seconds} label="s" variant={variant} />
    </div>
  );
}

function Unit({ value, label, variant }: { value: number; label: string; variant: "onDark" | "theme" }) {
  return (
    <div className="flex items-baseline gap-0.5">
      <span className={`font-mono font-bold tabular-nums ${variant === "onDark" ? "text-white" : "text-foreground"}`}>
        {String(value).padStart(2, "0")}
      </span>
      <span className={`text-xs ${variant === "onDark" ? "text-gray-400" : "text-subtle"}`}>{label}</span>
    </div>
  );
}

function Sep({ variant }: { variant: "onDark" | "theme" }) {
  return <span className={`font-bold ${variant === "onDark" ? "text-gray-500" : "text-subtle"}`}>:</span>;
}
