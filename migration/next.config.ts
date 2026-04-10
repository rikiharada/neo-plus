/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  },
  // 既存の他の設定はここに追加できます
  // 例: typescript: { ignoreBuildErrors: true },
};

module.exports = nextConfig;
