import { getPmUnlockEligibilityStatus } from './pm-unlock-status.ts';
import type { DocumentMetadata } from './types.ts';

export type PmDeliverableStatus =
  | 'approved'
  | 'sent'
  | 'clarifications'
  | 'draft'
  | 'ineligible'
  | 'pm_unlocked'
  | 'auto_resolved';

export const PM_DELIVERABLE_STATUS_LABELS: Record<PmDeliverableStatus, string> = {
  approved: 'Aprobat',
  sent: 'Trimis',
  clarifications: 'Clarificări',
  draft: 'Draft',
  ineligible: 'Neeligibil',
  pm_unlocked: 'Deblocat PM',
  auto_resolved: 'Corectat expert',
};

export function getPmDeliverableStatus(document: Pick<DocumentMetadata,
  'titleMatch' | 'titleCheckStatus' | 'eligibilityCheck' | 'uploadDate'
>): PmDeliverableStatus {
  const unlockStatus = getPmUnlockEligibilityStatus(document.eligibilityCheck);
  if (unlockStatus === 'active_blocked') return 'ineligible';
  if (unlockStatus === 'pm_unlocked') return 'pm_unlocked';
  if (unlockStatus === 'auto_resolved') return 'auto_resolved';

  if (document.eligibilityCheck?.status === 'neeligibil') return 'ineligible';
  if (document.titleMatch === false || document.titleCheckStatus === 'mismatch' || document.titleCheckStatus === 'extraction_failed') {
    return 'clarifications';
  }
  if (
    document.titleMatch === true
    || document.titleCheckStatus === 'matched'
    || document.titleCheckStatus === 'admin_overridden'
    || document.eligibilityCheck?.status === 'eligibil'
    || document.eligibilityCheck?.status === 'eligibil_cu_observatii'
  ) {
    return 'approved';
  }
  if (!document.titleCheckStatus && !document.titleMatch) return 'draft';
  return document.uploadDate ? 'sent' : 'draft';
}

export function isPmDeliverableInMonth(
  document: Pick<DocumentMetadata, 'uploadDate' | 'activityDate' | 'createdAt'>,
  month: number,
  year: number,
) {
  const dateValue = document.uploadDate || document.activityDate || document.createdAt;
  if (!dateValue) return false;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return false;
  return date.getFullYear() === year && date.getMonth() === month;
}
