/**
 * app/page.tsx — ルート `/`
 * Middleware が未認証を /login、認証済みをここからメインへ誘導。
 */

export default function HomePage() {
  return (
    <div style={{ padding: '2rem', fontSize: '24px' }}>
      Hello Neo+ (Hydration Test)
    </div>
  );
}
