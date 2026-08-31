import { isActivePmUnlockRequest } from './pm-unlock-status.ts';
import type { Activity, DashboardComplianceRow, DocumentMetadata, Expert } from './types.ts';

export type PmTimesheetExpertChip = {
  expert: Expert;
  row?: DashboardComplianceRow;
  totalHours: number;
  utilizationPercent: number;
  isActive: boolean;
};

export type PmTimesheetCalendarDayStatus = 'worked' | 'blocked' | 'missing_timesheet' | 'non_working';

export type PmTimesheetCalendarDay = {
  date: string;
  day: number;
  activities: Activity[];
  totalHours: number;
  expectedHours: number;
  status: PmTimesheetCalendarDayStatus;
};

export type PmTimesheetViewModel = {
  selectedExpert?: Expert;
  selectedRow?: DashboardComplianceRow;
  selectedActivities: Activity[];
  selectedActiveBlockedDocuments: DocumentMetadata[];
  selectedAutoResolvedDocuments: DocumentMetadata[];
  blockedActivityIds: Set<string>;
  activitiesByDay: Map<string, Activity[]>;
  calendarDays: PmTimesheetCalendarDay[];
  expertChips: PmTimesheetExpertChip[];
  daysInMonth: number;
  leadingEmptyDays: number;
  dailyNormHours: number;
};

function isDocumentLinkedToMonth(args: {
  document: DocumentMetadata;
  selectedExpert?: Expert;
  selectedActivityIds: Set<string>;
  selectedMonth: number;
  selectedYear: number;
}) {
  if (!args.selectedExpert || args.document.uploadedByExpertId !== args.selectedExpert.id) return false;
  if (args.document.sourceActivityId && args.selectedActivityIds.has(args.document.sourceActivityId)) return true;

  const uploadedAt = args.document.uploadDate ? new Date(args.document.uploadDate) : null;
  return Boolean(
    uploadedAt &&
      uploadedAt.getMonth() === args.selectedMonth &&
      uploadedAt.getFullYear() === args.selectedYear,
  );
}

function isoDate(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function isBusinessDay(year: number, month: number, day: number) {
  const weekDay = new Date(year, month, day).getDay();
  return weekDay !== 0 && weekDay !== 6;
}

function getCalendarDayStatus(args: {
  year: number;
  month: number;
  day: number;
  activities: Activity[];
  blockedActivityIds: Set<string>;
}): PmTimesheetCalendarDayStatus {
  if (args.activities.some((activity) => args.blockedActivityIds.has(activity.id))) return 'blocked';
  if (args.activities.length > 0) return 'worked';
  if (isBusinessDay(args.year, args.month, args.day)) return 'missing_timesheet';
  return 'non_working';
}

export function buildPmTimesheetViewModel(args: {
  experts: Expert[];
  dashboardRows: DashboardComplianceRow[];
  activities: Activity[];
  activeBlockedDocuments: DocumentMetadata[];
  autoResolvedDocuments: DocumentMetadata[];
  selectedExpertId?: string;
  selectedMonth: number;
  selectedYear: number;
}): PmTimesheetViewModel {
  const selectedExpert =
    args.experts.find((expert) => expert.id === args.selectedExpertId) ||
    args.experts[0];
  const selectedRow = args.dashboardRows.find((row) => row.expertId === selectedExpert?.id);
  const selectedActivities = args.activities.filter((activity) => activity.expertId === selectedExpert?.id);
  const selectedActivityIds = new Set(selectedActivities.map((activity) => activity.id));
  const isDocumentInSelectedMonth = (document: DocumentMetadata) =>
    isDocumentLinkedToMonth({
      document,
      selectedExpert,
      selectedActivityIds,
      selectedMonth: args.selectedMonth,
      selectedYear: args.selectedYear,
    });

  const selectedActiveBlockedDocuments = args.activeBlockedDocuments.filter(isDocumentInSelectedMonth);
  const selectedAutoResolvedDocuments = args.autoResolvedDocuments.filter(isDocumentInSelectedMonth);
  const blockedActivityIds = new Set<string>();

  selectedActiveBlockedDocuments.forEach((document) => {
    if (document.sourceActivityId) blockedActivityIds.add(document.sourceActivityId);
  });
  selectedActivities.forEach((activity) => {
    if ((activity.deliverables || []).some((deliverable) => isActivePmUnlockRequest(deliverable.eligibilityCheck))) {
      blockedActivityIds.add(activity.id);
    }
  });

  const activitiesByDay = new Map<string, Activity[]>();
  selectedActivities.forEach((activity) => {
    activitiesByDay.set(activity.date, [...(activitiesByDay.get(activity.date) || []), activity]);
  });

  const expertChips = args.experts.map((expert) => {
    const row = args.dashboardRows.find((item) => item.expertId === expert.id);
    return {
      expert,
      row,
      totalHours: row?.totalHours || 0,
      utilizationPercent: row?.utilizationPercent || 0,
      isActive: expert.id === selectedExpert?.id,
    };
  });

  const daysInMonth = new Date(args.selectedYear, args.selectedMonth + 1, 0).getDate();
  const leadingEmptyDays = (new Date(args.selectedYear, args.selectedMonth, 1).getDay() + 6) % 7;
  const dailyNormHours = Math.round((selectedRow?.monthlyNorm || 0) / 23);
  const calendarDays = Array.from({ length: daysInMonth }).map((_, index) => {
    const day = index + 1;
    const date = isoDate(args.selectedYear, args.selectedMonth, day);
    const activities = activitiesByDay.get(date) || [];
    const totalHours = activities.reduce((sum, activity) => sum + (activity.hours || 0), 0);
    return {
      date,
      day,
      activities,
      totalHours,
      expectedHours: dailyNormHours,
      status: getCalendarDayStatus({
        year: args.selectedYear,
        month: args.selectedMonth,
        day,
        activities,
        blockedActivityIds,
      }),
    };
  });

  return {
    selectedExpert,
    selectedRow,
    selectedActivities,
    selectedActiveBlockedDocuments,
    selectedAutoResolvedDocuments,
    blockedActivityIds,
    activitiesByDay,
    calendarDays,
    expertChips,
    daysInMonth,
    leadingEmptyDays,
    dailyNormHours,
  };
}
