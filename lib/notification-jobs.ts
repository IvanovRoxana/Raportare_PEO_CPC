import { buildDashboardComplianceRows } from './reporting-dashboard.ts';
import type { Activity, EmailDraft, Expert } from './types.ts';
import { isWorkingDay } from './working-hours.ts';

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function previousDate(date: Date) {
  const result = new Date(date);
  result.setDate(result.getDate() - 1);
  return result;
}

function emailId(kind: EmailDraft['kind'], to: string, reference: string) {
  return `${kind}_${to}_${reference}`.replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 80);
}

export function buildMissingActivityEmailDrafts(args: {
  experts: Expert[];
  activities: Activity[];
  today: Date;
  appUrl: string;
}): EmailDraft[] {
  const targetDate = previousDate(args.today);
  if (!isWorkingDay(targetDate)) return [];

  const targetDateIso = isoDate(targetDate);
  const activeExperts = args.experts.filter((expert) => expert.isActive !== false && expert.email);

  return activeExperts
    .filter((expert) => !args.activities.some((activity) => activity.expertId === expert.id && activity.date === targetDateIso))
    .map((expert) => ({
      id: emailId('missing_activity', expert.email!, targetDateIso),
      to: [expert.email!],
      kind: 'missing_activity',
      subject: `Activitate lipsa pentru ${targetDateIso}`,
      body: [
        `Buna ziua, ${expert.name},`,
        '',
        `Nu exista activitate inregistrata pentru data ${targetDateIso}.`,
        `Proiect: ${expert.projectTitle ?? expert.projectCode ?? 'PEO'}`,
        `Rol: ${expert.role}`,
        '',
        `Completeaza activitatea aici: ${args.appUrl.replace(/\/$/, '')}/expert/peo`,
      ].join('\n'),
      metadata: {
        expertId: expert.id,
        date: targetDateIso,
        projectCode: expert.projectCode,
      },
    }));
}

export function buildWeeklyPmStatusEmailDraft(args: {
  pmEmails: string[];
  experts: Expert[];
  activities: Activity[];
  month: number;
  year: number;
  appUrl: string;
}): EmailDraft {
  const rows = buildDashboardComplianceRows({
    experts: args.experts,
    activities: args.activities,
    month: args.month,
    year: args.year,
  });
  const lines = rows.map((row) =>
    [
      row.expertName,
      row.role,
      row.projectCode ?? 'PEO',
      `${row.totalHours}/${row.monthlyNorm}h`,
      `${row.remainingHours}h ramase`,
      `${row.utilizationPercent}%`,
      `${row.missingActivityDays.length} zile fara activitate`,
      `${row.blockedDays.length} zile blocate`,
      `${row.adminInterventions} interventii admin`,
      row.hasDailyLimitIssue || row.hasMonthlyNormIssue || row.hasProjectNormIssue ? 'ATENTIE' : 'OK',
    ].join(' | '),
  );

  return {
    id: emailId('pm_weekly_status', args.pmEmails.join(','), `${args.year}-${args.month}`),
    to: args.pmEmails,
    kind: 'pm_weekly_status',
    subject: `Status ore pontate - luna ${args.month + 1}/${args.year}`,
    body: [
      'Status saptamanal ore pontate',
      '',
      'Expert | Rol | Proiect | Ore | Ramase | Utilizare | Zile lipsa | Zile blocate | Interventii | Status',
      ...lines,
      '',
      `Dashboard: ${args.appUrl.replace(/\/$/, '')}/pm`,
    ].join('\n'),
    metadata: {
      month: args.month,
      year: args.year,
      experts: rows.length,
    },
  };
}
