import type { Activity, AdminInterventionRequest, AuditLog, Expert } from './types.ts';

function normalizeRole(role?: string) {
  return (role || '').trim().toLowerCase();
}

function stringifyAuditValue(value: unknown) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function requireAdminRole(actorRole: string) {
  const normalizedRole = normalizeRole(actorRole);
  if (!normalizedRole.split(/[,\s/]+/).includes('admin')) {
    throw new Error('Interventia este permisa doar administratorului.');
  }
}

function requireJustification(justification?: string) {
  if (!justification || justification.trim().length < 10) {
    throw new Error('Justificarea este obligatorie pentru interventiile administratorului.');
  }
}

export function createAuditLog(input: AdminInterventionRequest): AuditLog {
  requireAdminRole(input.actorRole);
  requireJustification(input.justification);

  const createdAt = new Date().toISOString();
  const compactId = [
    input.actionType,
    input.affectedExpertId,
    input.projectCode,
    input.year,
    input.month,
    createdAt,
  ]
    .filter(Boolean)
    .join(':')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .slice(0, 48);

  return {
    id: `audit_${compactId}`,
    actionType: input.actionType,
    actorId: input.actorId,
    actorName: input.actorName,
    actorRole: input.actorRole,
    createdAt,
    affectedExpertId: input.affectedExpertId,
    affectedExpertName: input.affectedExpertName,
    projectCode: input.projectCode,
    month: input.month,
    year: input.year,
    fieldName: input.fieldName,
    oldValue: stringifyAuditValue(input.oldValue),
    newValue: stringifyAuditValue(input.newValue),
    justification: input.justification.trim(),
    source: input.source ?? 'manual',
  };
}

export function prepareManualMonthlyNormUpdate(args: {
  expert: Expert;
  month: number;
  year: number;
  newMonthlyNorm: number;
  actorId: string;
  actorName?: string;
  actorRole: string;
  justification: string;
}) {
  if (!Number.isFinite(args.newMonthlyNorm) || args.newMonthlyNorm < 0) {
    throw new Error('Norma lunara trebuie sa fie un numar pozitiv sau zero.');
  }

  const audit = createAuditLog({
    actionType: 'manual_monthly_norm_updated',
    actorId: args.actorId,
    actorName: args.actorName,
    actorRole: args.actorRole,
    affectedExpertId: args.expert.id,
    affectedExpertName: args.expert.name,
    projectCode: args.expert.projectCode,
    month: args.month,
    year: args.year,
    fieldName: 'manualMonthlyNorm',
    oldValue: args.expert.manualMonthlyNorm,
    newValue: args.newMonthlyNorm,
    justification: args.justification,
  });

  return {
    expertPatch: {
      normType: 'manual_adjusted',
      manualMonthlyNorm: args.newMonthlyNorm,
    } satisfies Partial<Expert>,
    audit,
  };
}

export function prepareAdminActivityOverride(args: {
  activity: Omit<Activity, 'id' | 'createdAt' | 'updatedAt'>;
  actorId: string;
  actorName?: string;
  actorRole: string;
  justification: string;
  actionType?: 'activity_admin_created' | 'activity_admin_updated' | 'daily_limit_overridden';
}) {
  const audit = createAuditLog({
    actionType: args.actionType ?? 'activity_admin_created',
    actorId: args.actorId,
    actorName: args.actorName,
    actorRole: args.actorRole,
    affectedExpertId: args.activity.expertId,
    affectedExpertName: args.activity.expertName,
    projectCode: args.activity.projectCode,
    month: new Date(`${args.activity.date}T00:00:00`).getMonth(),
    year: new Date(`${args.activity.date}T00:00:00`).getFullYear(),
    fieldName: 'activity',
    oldValue: '',
    newValue: {
      date: args.activity.date,
      hours: args.activity.hours,
      title: args.activity.title,
    },
    justification: args.justification,
  });

  return {
    activity: {
      ...args.activity,
      status: args.activity.status ?? 'approved',
      pmNotes: [args.activity.pmNotes, `Interventie admin: ${args.justification.trim()}`].filter(Boolean).join('\n'),
    },
    audit,
  };
}
