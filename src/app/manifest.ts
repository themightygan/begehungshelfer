import type { MetadataRoute } from "next";

// Web-App-Manifest: Name + Icons fürs Hinzufügen zum Homescreen (Android/PWA).
// iOS nutzt zusätzlich app/apple-icon.png (automatisch verlinkt).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Begehungshelfer",
    short_name: "Begehung",
    description: "Gartenbegehungen Gartenfreunde Sillenbuch e.V.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#15803d",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
