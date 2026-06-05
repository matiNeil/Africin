"use client";

import { useEffect, useState } from "react";

interface CountdownTimerProps {
  targetDate: string;
  className?: string;
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

export default function CountdownTimer({ targetDate, className = "" }: CountdownTimerProps) {
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
        <Unit value={timeLeft.days} label="d" />
      )}
      <Unit value={timeLeft.hours} label="h" />
      <Sep />
      <Unit value={timeLeft.minutes} label="m" />
      <Sep />
      <Unit value={timeLeft.seconds} label="s" />
    </div>
  );
}

function Unit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex items-baseline gap-0.5">
      <span className="font-mono font-bold text-white tabular-nums">
        {String(value).padStart(2, "0")}
      </span>
      <span className="text-gray-400 text-xs">{label}</span>
    </div>
  );
}

function Sep() {
  return <span className="text-gray-500 font-bold">:</span>;
}
