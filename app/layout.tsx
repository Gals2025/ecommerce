import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const displaySerif = Fraunces({
  variable: "--font-display-serif",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Pickle Unltd — Small-batch pickles, delivered", template: "%s | Pickle Unltd" },
  description: "Shop Pickle Unltd online. Cash on delivery, GCash, bank transfer, or pay in store. Metro Manila delivery and nationwide shipping.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  openGraph: {
    type: "website",
    siteName: "Pickle Unltd",
    title: "Pickle Unltd — Small-batch pickles, delivered",
    description: "Cash on delivery, GCash, bank transfer, or pay in store.",
  },
  twitter: { card: "summary_large_image" },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${displaySerif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-stone-50 text-stone-900">{children}</body>
    </html>
  );
}
