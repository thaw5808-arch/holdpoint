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
  // serverExternalPackages above only stops *webpack* from mangling this
  // package — it says nothing about Vercel's separate deploy-time file
  // tracer (@vercel/nft), which decides what actually gets copied into
  // the deployed function. That tracer works by statically finding
  // `require()`/`import` calls, but @ffmpeg-installer/ffmpeg picks its
  // target sub-package with a require() built from process.platform/arch
  // at runtime — not a literal string — which is exactly the kind of
  // dynamic pattern static analysis can miss. Confirmed as a real,
  // recurring failure mode for this package on Vercel, not a
  // theoretical one: https://github.com/vercel/next.js/issues/53791.
  //
  // Globbing the whole @ffmpeg-installer scope, rather than naming
  // darwin-arm64 (what happens to be installed on this dev machine) or
  // hardcoding just linux-x64, is deliberate: npm's own
  // optionalDependencies os/cpu gating (every @ffmpeg-installer/<platform>
  // sub-package declares real "os"/"cpu" fields) means only the one
  // platform that actually matches the build machine ever lands in
  // node_modules in the first place — nothing else exists on disk for
  // this glob to accidentally pull in. On Vercel's Linux x64 build
  // machine that's @ffmpeg-installer/linux-x64 (~65MB unpacked, well
  // under the 250MB Hobby function-size cap); this repo's own
  // node_modules only has @ffmpeg-installer/darwin-arm64 (~35MB) because
  // that's what matches this machine, not because it's what ships.
  outputFileTracingIncludes: {
    "/*": ["./node_modules/@ffmpeg-installer/**/*"],
  },
};

export default nextConfig;
