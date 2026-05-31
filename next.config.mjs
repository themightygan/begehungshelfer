// Hostnames, unter denen die App extern erreichbar ist (Cloudflare Tunnel).
// *.trycloudflare.com = Wegwerf-Schnelltunnel; app.begehungshelfer.de = später permanent.
const TUNNEL_HOSTS = [
  "*.trycloudflare.com",
  "app.begehungshelfer.de",
  "begehungshelfer.de",
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["@react-pdf/renderer", "heic-convert", "sharp"],
  // Next-15-Dev blockt sonst Cross-Origin-Requests (HMR) vom Tunnel-Host.
  allowedDevOrigins: TUNNEL_HOSTS,
  experimental: {
    serverActions: {
      // Foto-Uploads: bis 3 Fotos × ~8 MB Rohbild pro Upload.
      bodySizeLimit: "30mb",
      // Server Actions prüfen Origin gegen Host (CSRF) -> Tunnel-Hosts erlauben.
      allowedOrigins: TUNNEL_HOSTS,
    },
  },
};

export default nextConfig;
