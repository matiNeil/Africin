"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import SignInStatus from "@/components/SignInStatus";
import ThemeToggle from "@/components/ThemeToggle";

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Focus input when overlay opens
  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
    else setSearchQuery("");
  }, [searchOpen]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/browse?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchOpen(false);
    }
  };

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
    { href: "/support", label: "Support" },
  ];

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled
          ? "bg-background/90 backdrop-blur-2xl border-b border-hairline shadow-2xl shadow-black/10 dark:shadow-black/40"
          : "bg-gradient-to-b from-background/80 to-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">

          {/* Logo — kept on a permanent dark chip since the wordmark asset
              bakes in a black backdrop and needs to read on light mode too */}
          <Link href="/" className="flex items-center group">
            <span className="flex items-center bg-black rounded-md px-2.5 py-1">
              <Image
                src="/logo.png"
                alt="Africin"
                width={200}
                height={32}
                className="object-contain h-6 w-auto"
                priority
              />
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
                    ? "text-red-500"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {"live" in link && link.live && (
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                )}
                {link.label}
                {pathname === link.href && (
                  <span className="absolute -bottom-1 left-0 right-0 h-px bg-gradient-to-r from-red-500 to-transparent" />
                )}
              </Link>
            ))}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-4">
            <ThemeToggle />

            <button
              onClick={() => setSearchOpen(!searchOpen)}
              className="text-muted hover:text-red-500 transition-colors duration-300"
              aria-label="Search"
            >
              {searchOpen ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              )}
            </button>

            <div className="hidden sm:block">
              <SignInStatus />
            </div>

            <button
              className="md:hidden text-muted hover:text-foreground transition-colors"
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

        {/* Search overlay */}
        {searchOpen && (
          <div className="border-t border-hairline">
            <form onSubmit={handleSearch} className="flex items-center gap-3 px-4 py-3">
              <svg className="w-4 h-4 text-subtle flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search films, events…"
                className="flex-1 bg-transparent text-foreground placeholder-subtle text-sm focus:outline-none"
                onKeyDown={(e) => e.key === "Escape" && setSearchOpen(false)}
              />
              {searchQuery && (
                <button type="submit" className="text-red-500 text-xs font-medium uppercase tracking-wider hover:text-red-400 transition-colors">
                  Go
                </button>
              )}
            </form>
          </div>
        )}

        {/* Mobile menu */}
        {menuOpen && (
          <div className="md:hidden bg-background/95 backdrop-blur-2xl border-t border-hairline py-4 space-y-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium tracking-widest uppercase transition-colors ${
                  pathname === link.href ? "text-red-500" : "text-muted hover:text-foreground"
                }`}
              >
                {"live" in link && link.live && (
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                )}
                {link.label}
              </Link>
            ))}
            <div className="px-4 pt-3 flex justify-center">
              <SignInStatus />
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
