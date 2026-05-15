/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { dev }) => {
    if (dev) {
      // Synced folders (e.g. OneDrive) and subst-drive dev can leave webpack’s disk cache
      // pointing at missing vendor-chunks and cause MODULE_NOT_FOUND at runtime.
      config.cache = false;
    }
    return config;
  },
};

export default nextConfig;
