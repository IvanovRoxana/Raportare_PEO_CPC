import type { Anexa10ReportModel } from './build-report-model.ts';

export type Anexa10ExportReadiness = {
  canExport: boolean;
  blockingMessages: string[];
  warningMessages: string[];
};

export function getAnexa10ExportReadiness(model: Pick<Anexa10ReportModel, 'problems' | 'warnings'>): Anexa10ExportReadiness {
  return {
    canExport: model.problems.length === 0,
    blockingMessages: model.problems.map((problem) => problem.message),
    warningMessages: model.warnings,
  };
}
