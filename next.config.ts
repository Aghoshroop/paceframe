import type { NextConfig } from "next";

const isGithubPages = process.env.GITHUB_PAGES === "true";

const nextConfig: NextConfig = {
  output: isGithubPages ? "export" : undefined,
  basePath: isGithubPages ? "/paceframe" : "",
  images: {
    unoptimized: true,
  },
  webpack: (config, { dev }) => {
    if (dev) {
      // Disable Webpack disk gzip caching in dev to prevent Array buffer allocation failures on Windows
      config.cache = false;
    }
    return config;
  },
};

export default nextConfig;
