import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PickleUNLTD",
    short_name: "PickleUNLTD",
    description: "Shop pickleball paddles, balls, sportswear and apparel.",
    start_url: "/",
    display: "standalone",
    background_color: "#10284a",
    theme_color: "#10284a",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
