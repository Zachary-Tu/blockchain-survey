import type { NextConfig } from "next";

const classroomIsolationHeaders = [
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/tim-classroom",
        headers: classroomIsolationHeaders,
      },
      {
        source: "/tim-classroom/:path*",
        headers: classroomIsolationHeaders,
      },
    ];
  },
};

export default nextConfig;
