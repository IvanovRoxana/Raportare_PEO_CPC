import type { Anexa10ReportModel } from './build-report-model.ts';

export type Anexa10ExportReadiness = {
  canExport: boolean;
  severity: 'ready' | 'warning' | 'blocked';
  statusLabel: string;
  summary: string;
  blockingMessages: string[];
  warningMessages: string[];
};

export function getAnexa10ExportReadiness(model: Pick<Anexa10ReportModel, 'problems' | 'warnings'>): Anexa10ExportReadiness {
  const blockingMessages = model.problems.map((problem) => problem.message);
  const warningMessages = model.warnings;
  const canExport = blockingMessages.length === 0;
  const severity = !canExport ? 'blocked' : warningMessages.length > 0 ? 'warning' : 'ready';

  return {
    canExport,
    severity,
    statusLabel: getReadinessStatusLabel(severity),
    summary: getReadinessSummary(severity, blockingMessages.length, warningMessages.length),
    blockingMessages,
    warningMessages,
  };
}

function getReadinessStatusLabel(severity: Anexa10ExportReadiness['severity']) {
  if (severity === 'blocked') return 'Blocat pentru verificare';
  if (severity === 'warning') return 'Pregatit cu avertizari';
  return 'Pregatit pentru export';
}

function getReadinessSummary(severity: Anexa10ExportReadiness['severity'], blockingCount: number, warningCount: number) {
  if (severity === 'blocked') {
    return `Exportul este blocat pana la corectarea problemelor de alocare (${blockingCount}).`;
  }
  if (severity === 'warning') {
    return `Exportul poate continua, dar necesita verificare manuala pentru avertizari (${warningCount}).`;
  }
  return 'Modelul determinist nu a raportat probleme sau avertizari.';
}
