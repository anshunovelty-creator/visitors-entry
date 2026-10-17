import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  redirects: async () => [{ source: "/", destination: "/reception", permanent: false }],
  // The service worker must never be served stale, or alert changes wouldn't reach phones.
  headers: async () => [{ source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] }],
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
