/**
 * Drive upload / pending-booking types (no 'use server').
 * Client components import types from here, not from actions.ts.
 */

import type { DriveUploadKind } from '@/lib/validation';

/** Draft passed to insertActivity (user may edit amount in banner). */
export interface SuggestedActivityDraft {
  type:            'expense';
  category:        string;
  title:           string;
  amount:          number;
  date:            string;
  is_bookkeeping:  boolean;
  receipt_url:     string | null;
}

export interface PendingDriveConfirmation {
  pointerId:        string;
  driveFileId:      string;
  webViewLink:      string | null;
  fileName:         string;
  mimeType:         string;
  kind:             DriveUploadKind;
  suggestedDraft:   SuggestedActivityDraft;
}

export interface DriveUploadSoulResult {
  ok:       boolean;
  message?: string;
  error?:   string;
  code?:    string;
  _debug?:  { soul?: unknown };
}

export interface UploadToDriveResult {
  ok:                        boolean;
  message?:                  string;
  /** @deprecated prefer pendingDriveConfirmation */
  pointerId?:                string;
  driveFileId?:              string;
  webViewLink?:              string;
  pendingDriveConfirmation?: PendingDriveConfirmation;
  error?:                    string;
  code?: string;
  _debug?:                   { soul?: unknown };
}
