/**
 * app/page.tsx — ルート `/`
 * Middleware が未認証を /login、認証済みをここからメインへ誘導。
 */

import { redirect } from 'next/navigation';

export default function HomePage() {
  redirect('/cockpit');
}
