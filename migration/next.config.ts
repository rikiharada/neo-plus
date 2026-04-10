const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  /** リポジトリ直下に別 lockfile があるとき、トレースのルートをこのアプリに固定（Vercel / ローカル警告対策） */
  outputFileTracingRoot: path.join(__dirname),
  env: {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  },
};

module.exports = nextConfig;
