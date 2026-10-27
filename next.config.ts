import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  poweredByHeader: false,
  // Self-contained server build, used by the Dockerfile
  output: "standalone",
  // uploads go through server actions: receipts up to 5 MB, banners and logo up to 2 MB
  // SERVER_ACTIONS_ALLOWED_ORIGINS: extra public hosts in front of the app (e.g. "*.app.github.dev" in Codespaces)
  experimental: {
    serverActions: {
      bodySizeLimit: "6mb",
      allowedOrigins: (process.env.SERVER_ACTIONS_ALLOWED_ORIGINS ?? "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // the site must not be framed by other sites (clickjacking)
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self)" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
      {
        // everything except uploaded files (logo, banners, receipts), which send their own stricter policy
        source: "/((?!api/brand/|api/banners/|api/admin/receipts/|api/admin/drivers/|api/booking/).*)",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors 'none'" }],
      },
    ];
  },
};

export default nextConfig;
