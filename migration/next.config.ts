import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // ─── TypeScript / ESLint ────────────────────────────────────────
  typescript:  { tsconfigPath: './tsconfig.json' },
  eslint:      { dirs: ['app', 'features', 'lib', 'components', 'hooks'] },

  // ─── 実験的機能（Next.js 15） ────────────────────────────────────
  experimental: {
    // Server Actions のペイロードサイズ上限（画像受付時は増やす）
    serverActionsBodySizeLimit: '4mb',
    // PPR (Partial Prerendering) — Suspense境界で静的+動的を混在
    ppr: 'incremental',
  },

  // ─── 画像ドメイン許可 ─────────────────────────────────────────────
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: '**.googleusercontent.com' },
    ],
  },

  // ─── セキュリティヘッダー ─────────────────────────────────────────
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options',           value: 'DENY' },
          { key: 'X-Content-Type-Options',     value: 'nosniff' },
          { key: 'Referrer-Policy',            value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy',         value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
