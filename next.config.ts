import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // LAN IP used to reach this dev server from a phone on the same Wi-Fi.
  allowedDevOrigins: ["192.168.11.31"],
  experimental: {
    serverActions: {
      allowedOrigins: ["192.168.11.31:3000"],
    },
  },
};

export default nextConfig;
