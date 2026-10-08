import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  redirects: async () => [{ source: "/", destination: "/reception", permanent: false }],
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
