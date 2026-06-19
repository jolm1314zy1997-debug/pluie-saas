/** @type {import('next').NextConfig} */
const nextConfig = {
  // API Routes now handle backend proxying with proper timeout support
  // See: src/app/api/leads/search/route.ts
  // See: src/app/api/generate-copy/route.ts
};

module.exports = nextConfig;
