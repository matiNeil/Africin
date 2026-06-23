import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import SplashScreen from "@/components/SplashScreen";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  weight: ["400", "500", "600", "700", "800", "900"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Africin — Stream African Cinema on the App",
  description:
    "Africin is your home for African cinema. Download the app to watch movies, series, documentaries, and live events from across the continent.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${playfair.variable} font-sans bg-black text-white antialiased min-h-screen`}>
        <SplashScreen />
        <Navbar />
        {children}
        <footer className="border-t border-white/5 py-5 mt-auto">
          <p className="text-center text-gray-600 text-xs tracking-wide">
            Powered by{" "}
            <span className="text-red-500 font-semibold">ForgeStackX</span>
          </p>
        </footer>
      </body>
    </html>
  );
}
