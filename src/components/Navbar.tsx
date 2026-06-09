"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { user, signOut } = useAuth();

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
          <Link href="/" className="flex items-center group">
            <Image
              src="/logo.png"
              alt="Africin"
              width={200}
              height={32}
              className="object-contain h-8 w-auto [mix-blend-mode:screen]"
              priority
            />
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
                    : "text-zinc-400 hover:text-white"
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
            <button
              onClick={() => setSearchOpen(!searchOpen)}
              className="text-zinc-400 hover:text-red-500 transition-colors duration-300"
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

            {user ? (
              <div className="relative hidden sm:block">
                <button
                  onClick={() => setAccountOpen(!accountOpen)}
                  className="flex items-center gap-2 group cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-full bg-red-500/20 border border-red-500/40 group-hover:border-red-500 flex items-center justify-center transition-colors">
                    <span className="text-red-500 text-xs font-bold">
                      {(user.displayName?.[0] || user.email?.[0] || "U").toUpperCase()}
                    </span>
                  </div>
                  <svg className={`w-3 h-3 text-zinc-500 group-hover:text-red-500 transition-all duration-200 ${accountOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {accountOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-[#111]/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl shadow-black/60 py-2 z-50">
                    <div className="px-4 py-3 border-b border-white/5">
                      {user.displayName && (
                        <p className="text-white text-sm font-medium truncate">{user.displayName}</p>
                      )}
                      <p className="text-zinc-400 text-xs truncate mt-0.5">{user.email}</p>
                    </div>
                    <div className="py-1">
                      <Link
                        href="/account"
                        onClick={() => setAccountOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-zinc-300 hover:text-white hover:bg-white/5 text-xs font-medium tracking-wider uppercase transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        My Account
                      </Link>
                      <Link
                        href="/account#purchases"
                        onClick={() => setAccountOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-zinc-300 hover:text-white hover:bg-white/5 text-xs font-medium tracking-wider uppercase transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        My Purchases
                      </Link>
                    </div>
                    <div className="border-t border-white/5 pt-1">
                      <button
                        onClick={() => { signOut(); setAccountOpen(false); }}
                        className="flex items-center gap-3 w-full px-4 py-2.5 text-zinc-400 hover:text-red-400 hover:bg-white/5 text-xs font-medium tracking-wider uppercase transition-colors cursor-pointer"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        Sign Out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <Link
                href="/auth"
                className="hidden sm:flex items-center gap-2 border border-red-500/40 hover:border-red-500 hover:bg-red-500/8 text-red-500 hover:text-red-400 text-xs font-medium tracking-wider uppercase px-4 py-1.5 rounded-full transition-all duration-300"
              >
                Sign In
              </Link>
            )}

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

        {/* Search overlay */}
        {searchOpen && (
          <div className="border-t border-white/5">
            <form onSubmit={handleSearch} className="flex items-center gap-3 px-4 py-3">
              <svg className="w-4 h-4 text-zinc-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search films, events…"
                className="flex-1 bg-transparent text-white placeholder-zinc-600 text-sm focus:outline-none"
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
          <div className="md:hidden bg-[#050505]/95 backdrop-blur-2xl border-t border-white/5 py-4 space-y-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium tracking-widest uppercase transition-colors ${
                  pathname === link.href ? "text-red-500" : "text-zinc-400 hover:text-white"
                }`}
              >
                {"live" in link && link.live && (
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                )}
                {link.label}
              </Link>
            ))}
            <div className="px-4 pt-3 space-y-2">
              {user ? (
                <>
                  <div className="text-center pb-2 border-b border-white/5 mb-2">
                    {user.displayName && <p className="text-white text-sm font-medium">{user.displayName}</p>}
                    <p className="text-zinc-400 text-xs truncate">{user.email}</p>
                  </div>
                  <Link
                    href="/account"
                    onClick={() => setMenuOpen(false)}
                    className="block text-center w-full border border-red-500/40 text-red-500 text-xs font-medium tracking-wider uppercase py-2.5 rounded-full transition-all hover:bg-red-500/10"
                  >
                    My Account
                  </Link>
                  <button
                    onClick={() => { signOut(); setMenuOpen(false); }}
                    className="w-full border border-white/10 text-zinc-400 text-xs font-medium tracking-wider uppercase py-2.5 rounded-full transition-all hover:bg-white/5 hover:text-red-400 cursor-pointer"
                  >
                    Sign Out
                  </button>
                </>
              ) : (
                <Link
                  href="/auth"
                  onClick={() => setMenuOpen(false)}
                  className="block text-center w-full border border-red-500/40 text-red-500 text-xs font-medium tracking-wider uppercase py-2.5 rounded-full transition-all hover:bg-red-500/10"
                >
                  Sign In
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
