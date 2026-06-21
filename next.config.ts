import type { NextConfig } from "next";
import path from "path";
import os from "os";

// Dynamically gather all local IPs so accessing via any local network IP doesn't block HMR.
const getLocalIPs = () => {
  const interfaces = os.networkInterfaces();
  const ips: string[] = ["localhost", "127.0.0.1"];
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name] || []) {
      if (net.family === "IPv4") {
        ips.push(net.address);
        ips.push(`${net.address}:3001`);
        ips.push(`${net.address}:3000`);
      }
    }
  }
  return ips;
};

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname),
  allowedDevOrigins: getLocalIPs(),
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
