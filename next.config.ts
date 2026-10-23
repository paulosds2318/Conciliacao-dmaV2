import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  output: "standalone",
  async headers() {
    const ancestors = process.env.FRAME_ANCESTORS?.trim() || "'self'";
    return [{ source: "/:path*", headers: [
      { key: "Content-Security-Policy", value: `frame-ancestors ${ancestors}` },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" }
    ] }];
  }
};
export default nextConfig;
