"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";

export default function Navbar() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const links = [
    { href: "/", label: "Home" },
    { href: "/browse", label: "Browse" },
    { href: "/browse?type=movie", label: "Movies" },
    { href: "/browse?type=series", label: "Series" },
    { href: "/live", label: "Live", live: true },
  ];

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled
          ? "bg-[#050505]/90 backdrop-blur-2xl border-b border-white/5 shadow-2xl shadow-black/40"
          : "bg-gradient-to-b from-black/70 to-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="relative w-7 h-7">
              <div className="absolute inset-0 rounded-full shimmer-gold opacity-90" />
              <div className="absolute inset-[1.5px] rounded-full bg-black flex items-center justify-center">
                <span className="font-display font-bold text-amber-400 text-xs tracking-tight">A</span>
              </div>
            </div>
            <span className="font-display font-semibold text-lg tracking-wide text-white group-hover:text-amber-100 transition-colors duration-300">
              afric<span className="text-gold">in</span>
            </span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-8">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`relative flex items-center gap-1.5 text-xs font-medium tracking-widest uppercase transition-all duration-300 ${
                  pathname === link.href
                    ? "text-amber-400"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                {"live" in link && link.live && (
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                )}
                {link.label}
                {pathname === link.href && (
                  <span className="absolute -bottom-1 left-0 right-0 h-px bg-gradient-to-r from-amber-500 to-transparent" />
                )}
              </Link>
            ))}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-4">
            <Link
              href="/browse"
              className="text-zinc-400 hover:text-amber-400 transition-colors duration-300"
              aria-label="Search"
            >
              <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </Link>

            <button className="hidden sm:flex items-center gap-2 border border-amber-500/40 hover:border-amber-400 hover:bg-amber-500/8 text-amber-400 hover:text-amber-300 text-xs font-medium tracking-wider uppercase px-4 py-1.5 rounded-full transition-all duration-300">
              Sign In
            </button>

            <button
              className="md:hidden text-zinc-400 hover:text-white transition-colors"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Toggle menu"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {menuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="md:hidden bg-[#050505]/95 backdrop-blur-2xl border-t border-white/5 py-4 space-y-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium tracking-widest uppercase transition-colors ${
                  pathname === link.href ? "text-amber-400" : "text-zinc-400 hover:text-white"
                }`}
              >
                {"live" in link && link.live && (
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                )}
                {link.label}
              </Link>
            ))}
            <div className="px-4 pt-3">
              <button className="w-full border border-amber-500/40 text-amber-400 text-xs font-medium tracking-wider uppercase py-2.5 rounded-full transition-all hover:bg-amber-500/10">
                Sign In
              </button>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
