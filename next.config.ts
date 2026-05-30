import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The editor canvas touches `window` (ProseMirror-free, but auto-fit reads the DOM)
  // and is mounted as a client island via dynamic import; nothing to special-case here yet.
  reactStrictMode: true,
};

export default nextConfig;
