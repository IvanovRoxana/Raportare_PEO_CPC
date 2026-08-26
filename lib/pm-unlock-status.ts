export type PmUnlockEligibilityStatus = 'active_blocked' | 'pm_unlocked' | 'auto_resolved' | 'none';

export type PmUnlockTrackingCheck = {
  status?: string;
  summary?: string;
  pmUnlockRequested?: boolean;
  pmUnlockRequestedAt?: string;
  pmUnlockRequestedBy?: string;
  pmUnlockReason?: string;
  pmUnlockApproved?: boolean;
  pmUnlockApprovedAt?: string;
  pmUnlockApprovedBy?: string;
  pmUnlockResolvedByCorrection?: boolean;
  pmUnlockResolvedAt?: string;
  pmUnlockOriginalStatus?: string;
  pmUnlockOriginalSummary?: string;
};

export function getPmUnlockEligibilityStatus(check?: PmUnlockTrackingCheck | null): PmUnlockEligibilityStatus {
  if (!check?.pmUnlockRequested) return 'none';
  if (check.pmUnlockApproved === true) return 'pm_unlocked';
  if (check.status === 'neeligibil') return 'active_blocked';
  if (check.pmUnlockResolvedByCorrection || check.status === 'eligibil' || check.status === 'eligibil_cu_observatii') {
    return 'auto_resolved';
  }
  return 'none';
}

export function isActivePmUnlockRequest(check?: PmUnlockTrackingCheck | null) {
  return getPmUnlockEligibilityStatus(check) === 'active_blocked';
}

export function isAutoResolvedPmUnlockRequest(check?: PmUnlockTrackingCheck | null) {
  return getPmUnlockEligibilityStatus(check) === 'auto_resolved';
}

export function mergeEligibilityCheckWithPmUnlockTracking<T extends PmUnlockTrackingCheck>(
  previous: PmUnlockTrackingCheck | null | undefined,
  next: T,
  resolvedAt = new Date().toISOString(),
): T & PmUnlockTrackingCheck {
  if (!previous?.pmUnlockRequested) return next;

  const autoResolved = next.status === 'eligibil' || next.status === 'eligibil_cu_observatii';
  const preserved = {
    pmUnlockRequested: true,
    pmUnlockRequestedAt: previous.pmUnlockRequestedAt ?? undefined,
    pmUnlockRequestedBy: previous.pmUnlockRequestedBy ?? undefined,
    pmUnlockReason: previous.pmUnlockReason ?? undefined,
    pmUnlockApproved: previous.pmUnlockApproved ?? undefined,
    pmUnlockApprovedAt: previous.pmUnlockApprovedAt ?? undefined,
    pmUnlockApprovedBy: previous.pmUnlockApprovedBy ?? undefined,
    pmUnlockOriginalStatus: previous.pmUnlockOriginalStatus || previous.status || undefined,
    pmUnlockOriginalSummary: previous.pmUnlockOriginalSummary || previous.summary || undefined,
  };

  return {
    ...next,
    ...preserved,
    pmUnlockResolvedByCorrection: autoResolved ? true : false,
    pmUnlockResolvedAt: autoResolved ? (previous.pmUnlockResolvedAt || resolvedAt) : undefined,
  };
}
