import type { MetadataRoute } from "next";

// Lets staff add the app to their home screen; on iPhone that's required for visitor alerts.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Novelty Labels Visitors",
    short_name: "Visitors",
    start_url: "/reception",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#10553f",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
