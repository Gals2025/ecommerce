import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },
    { url: `${base}/shop`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/promotions`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${base}/membership`, changeFrequency: "monthly", priority: 0.5 },
  ];
}
