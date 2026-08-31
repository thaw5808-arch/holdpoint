import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  // @ffmpeg-installer/ffmpeg locates its platform-specific binary by
  // building a path from __dirname at runtime (see its index.js) — that
  // breaks once webpack bundles it, since __dirname inside a bundle no
  // longer points at the real node_modules location. Marking it external
  // (sharp gets this by default from Next; this package doesn't) leaves
  // it as a plain Node `require`, resolved against the real filesystem.
  serverExternalPackages: ["@ffmpeg-installer/ffmpeg"],
};

export default nextConfig;
