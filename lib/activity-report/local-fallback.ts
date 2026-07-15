import { getMonthName } from '../app-utils.ts';
import { getDocumentAuditTitle } from '../document-sharing.ts';
import type { Activity } from '../types.ts';

export const LOCAL_FALLBACK_MARKER = '[LOCAL_FALLBACK]';
export const TRUNCATED_MARKER = '[TRUNCATED]';
export const MAX_ACTIVITY_DESCRIPTION_CHARS = 700;
export const MAX_DELIVERABLE_TITLES = 5;

export function isLocalFallbackReport(report: string) {
  return report.includes(LOCAL_FALLBACK_MARKER);
}

export function isBlockedActivityReportExport(report: string) {
  return isLocalFallbackReport(report) || report.includes(TRUNCATED_MARKER);
}

export function truncateActivityReportText(value: string) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= MAX_ACTIVITY_DESCRIPTION_CHARS) return normalized;
  return `${normalized.slice(0, MAX_ACTIVITY_DESCRIPTION_CHARS).trim()} ${TRUNCATED_MARKER}`;
}

export function buildLocalActivityReport({
  activities,
  month,
  year,
  expertName,
  preferredPhrases,
  forbiddenPhrases,
}: {
  activities: Activity[];
  month: number;
  year: number;
  expertName: string;
  preferredPhrases: string[];
  forbiddenPhrases: string[];
}) {
  const sortedActivities = [...activities].sort((first, second) => first.date.localeCompare(second.date));
  const totalHours = sortedActivities.reduce((sum, activity) => sum + (Number(activity.hours) || 0), 0);
  const uniqueDates = [...new Set(sortedActivities.map((activity) => activity.date))];
  const bySa = sortedActivities.reduce<Record<string, Activity[]>>((groups, activity) => {
    const key = activity.saCode || 'SA neprecizata';
    groups[key] = [...(groups[key] || []), activity];
    return groups;
  }, {});
  const preferredPhrase = preferredPhrases[0] || 'am realizat';
  const forbiddenLine = forbiddenPhrases.length > 0
    ? `\nFormulari evitate: ${forbiddenPhrases.join(', ')}.`
    : '';

  const tableRows = Object.entries(bySa).map(([saCode, items]) => {
    const hours = items.reduce((sum, activity) => sum + (Number(activity.hours) || 0), 0);
    const dates = [...new Set(items.map((activity) => activity.date))].join(', ');
    const titles = [...new Set(items.map((activity) => activity.title || activity.activityType || 'Activitate'))].join('; ');
    const deliverables = collectDeliverableTitles(items);
    return `| ${saCode} | ${dates} | ${titles} | ${deliverables || 'Lipsa livrabile confirmate'} | ${hours} |`;
  });

  const detailRows = Object.entries(bySa).flatMap(([saCode, items]) => [
    `### ${saCode}`,
    ...items.map((activity) => {
      const description = truncateActivityReportText(activity.gdprGeneratedText || activity.description || activity.title || activity.activityType || 'Activitate raportata');
      const deliverables = collectDeliverableTitles([activity]);
      return [
        `**${activity.date} - ${Number(activity.hours) || 0}h**`,
        `${preferredPhrase} activitatea "${activity.title || activity.activityType || 'activitate raportata'}".`,
        `Descriere introdusa: ${description}`,
        `Livrabile: ${deliverables || 'lipsa livrabile confirmate'}.`,
        `Locatie: ${activity.location || 'neprecizata'}.`,
        `Campuri care necesita completare/verificare: beneficiar, rezultat raportabil, indicator/impact si contributie personala.`,
      ].join('\n');
    }),
  ]);

  return [
    LOCAL_FALLBACK_MARKER,
    `# Raport de Activitate - ${expertName}`,
    '',
    `## ${getMonthName(month)} ${year}`,
    '',
    `Draft local generat dupa esecul AI. Documentul nu poate fi exportat ca Anexa 10.${forbiddenLine}`,
    '',
    '## 1. Tabel activitati',
    '',
    '| Subactivitate / cod SA | Perioada / zile acoperite | Activitate prestata | Rezultate / materiale elaborate / livrabile | Nr. ore lucrate |',
    '| --- | --- | --- | --- | ---: |',
    ...tableRows,
    '',
    '## 2. Descriere detaliata pe subactivitati si zile',
    '',
    ...detailRows,
    '',
    `Total local calculat: ${totalHours} ore pe ${uniqueDates.length} zile lucrate. Validati campurile lipsa si regenerati raportul cu AI inainte de export.`,
  ].join('\n');
}

function collectDeliverableTitles(activities: Activity[]) {
  return [...new Set(activities.flatMap((activity) =>
    (activity.deliverables || []).map((deliverable) => getDocumentAuditTitle(deliverable)).filter(Boolean),
  ))].slice(0, MAX_DELIVERABLE_TITLES).join('; ');
}
