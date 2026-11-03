import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  icons: { icon: "/brand/mark.png", apple: "/brand/mark.png" },
  title: { default: "PickleUNLTD — Pickleball paddles, balls & apparel", template: "%s | PickleUNLTD" },
  description: "Shop PickleUNLTD online for brand-new pickleball paddles, balls, sportswear and apparel. Cash on delivery, GCash, bank transfer, or pay in store. Metro Manila delivery and nationwide shipping.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  openGraph: {
    type: "website",
    siteName: "PickleUNLTD",
    title: "PickleUNLTD — Pickleball paddles, balls & apparel",
    description: "Brand-new pickleball paddles, balls, sportswear and apparel. Cash on delivery, GCash, bank transfer, or pay in store.",
  },
  twitter: { card: "summary_large_image" },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#10284a",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-stone-50 text-stone-900">{children}</body>
    </html>
  );
}
