import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Permissions-Policy",
            value: "camera=(self), xr-spatial-tracking=(self), microphone=(self)",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
