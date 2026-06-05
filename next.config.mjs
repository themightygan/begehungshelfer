// Hostnames, unter denen die App extern erreichbar ist (Cloudflare Tunnel).
// *.trycloudflare.com = Wegwerf-Schnelltunnel; app.begehungshelfer.de = später permanent.
const TUNNEL_HOSTS = [
  "*.trycloudflare.com",
  "app.begehungshelfer.de",
  "begehungshelfer.de",
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["@react-pdf/renderer", "heic-convert", "sharp", "exceljs"],
  // Next-15-Dev blockt sonst Cross-Origin-Requests (HMR) vom Tunnel-Host.
  allowedDevOrigins: TUNNEL_HOSTS,
  experimental: {
    serverActions: {
      // Foto-Uploads: große iPhone-HEICs (~8 MB) pro Upload.
      bodySizeLimit: "30mb",
      // Server Actions prüfen Origin gegen Host (CSRF) -> Tunnel-Hosts erlauben.
      allowedOrigins: TUNNEL_HOSTS,
    },
    // Body-Limit für Requests, die durch die Middleware laufen (Default 10 MB);
    // sonst werden große Foto-Uploads abgeschnitten ("Unexpected end of form").
    middlewareClientMaxBodySize: "30mb",
  },
};

export default nextConfig;
