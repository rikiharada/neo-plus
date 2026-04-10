/**
 * Legacy /projects — merged into home (right column).
 */

import { permanentRedirect } from 'next/navigation';
import { APP_HOME_HREF } from '@/components/app-nav-config';

export default function LegacyProjectsRedirect() {
  permanentRedirect(APP_HOME_HREF);
}
