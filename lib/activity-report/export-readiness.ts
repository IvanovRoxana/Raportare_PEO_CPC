import type { Anexa10ReportModel } from './build-report-model.ts';

export type Anexa10ExportReadiness = {
  canExport: boolean;
  severity: 'ready' | 'warning' | 'blocked';
  score: number;
  scoreLabel: string;
  statusLabel: string;
  summary: string;
  checks: {
    datesAndHours: number;
    deliverables: number;
    narrative: number;
    finalValidation: number;
  };
  blockingMessages: string[];
  warningMessages: string[];
};

export type Anexa10ExportReadinessOptions = {
  usesPersistedWorkBlocks?: boolean;
};

const FALLBACK_WORK_BLOCK_WARNING =
  'Work block-urile persistate nu sunt disponibile; exportul foloseste gruparea fallback din activitati.';

export function getAnexa10ExportReadiness(
  model: Pick<Anexa10ReportModel, 'problems' | 'warnings'>,
  options: Anexa10ExportReadinessOptions = {},
): Anexa10ExportReadiness {
  const blockingMessages = model.problems.map((problem) => problem.message);
  const warningMessages = options.usesPersistedWorkBlocks === false
    ? [...model.warnings, FALLBACK_WORK_BLOCK_WARNING]
    : model.warnings;
  const canExport = blockingMessages.length === 0;
  const severity = !canExport ? 'blocked' : warningMessages.length > 0 ? 'warning' : 'ready';
  const checks = getReadinessChecks(blockingMessages.length, warningMessages.length);
  const score = checks.datesAndHours + checks.deliverables + checks.narrative + checks.finalValidation;

  return {
    canExport,
    severity,
    score,
    scoreLabel: `${score}/100`,
    statusLabel: getReadinessStatusLabel(severity),
    summary: getReadinessSummary(severity, blockingMessages.length, warningMessages.length, score),
    checks,
    blockingMessages,
    warningMessages,
  };
}

function getReadinessStatusLabel(severity: Anexa10ExportReadiness['severity']) {
  if (severity === 'blocked') return 'Blocat pentru verificare';
  if (severity === 'warning') return 'Pregatit cu avertizari';
  return 'Pregatit pentru export';
}

function getReadinessSummary(
  severity: Anexa10ExportReadiness['severity'],
  blockingCount: number,
  warningCount: number,
  score: number,
) {
  if (severity === 'blocked') {
    return `Exportul este blocat pana la corectarea problemelor de alocare (${blockingCount}). Scor readiness: ${score}/100.`;
  }
  if (severity === 'warning') {
    return `Exportul poate continua, dar necesita verificare manuala pentru avertizari (${warningCount}). Scor readiness: ${score}/100.`;
  }
  return `Modelul determinist nu a raportat probleme sau avertizari. Scor readiness: ${score}/100.`;
}

function getReadinessChecks(blockingCount: number, warningCount: number): Anexa10ExportReadiness['checks'] {
  if (blockingCount > 0) {
    return {
      datesAndHours: 0,
      deliverables: warningCount > 0 ? 10 : 15,
      narrative: 15,
      finalValidation: 0,
    };
  }

  if (warningCount > 0) {
    return {
      datesAndHours: 40,
      deliverables: 15,
      narrative: 15,
      finalValidation: 15,
    };
  }

  return {
    datesAndHours: 40,
    deliverables: 25,
    narrative: 20,
    finalValidation: 15,
  };
}
