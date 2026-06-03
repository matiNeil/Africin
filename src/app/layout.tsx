import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  weight: ["400", "500", "600", "700", "800", "900"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Africin — Stream · Watch · Africa",
  description: "Your home for African stories. Watch movies, series, and documentaries from across the continent.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${playfair.variable} font-sans bg-black text-white antialiased min-h-screen`}>
        <Navbar />
        {children}
        <footer className="border-t border-white/5 py-5 mt-auto">
          <p className="text-center text-gray-600 text-xs tracking-wide">
            Powered by{" "}
            <span className="text-amber-500 font-semibold">ForgeStackX</span>
          </p>
        </footer>
      </body>
    </html>
  );
}
