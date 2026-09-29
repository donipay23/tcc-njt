import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  const name = process.env.NEXT_PUBLIC_APP_NAME || "Manpower Bontang";
  return {
    name: `${name} – Dashboard Manpower Supply`,
    short_name: name,
    description: "Monitoring karyawan, lembur, cost & profit proyek Soda Ash Bontang",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f4f6f9",
    theme_color: "#155ea8",
    lang: "id",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
