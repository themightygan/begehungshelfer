/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["@react-pdf/renderer", "heic-convert", "sharp"],
  experimental: {
    serverActions: {
      // Foto-Uploads: bis 3 Fotos × ~8 MB Rohbild pro Upload.
      bodySizeLimit: "30mb",
    },
  },
};

export default nextConfig;
