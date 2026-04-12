/**
 * Root `/` — server redirect to `/cockpit` only.
 * Do not wrap redirect() in try/catch (it throws to perform the redirect).
 */

import { redirect } from 'next/navigation';

export default function RootPage() {
  redirect('/cockpit');
}
