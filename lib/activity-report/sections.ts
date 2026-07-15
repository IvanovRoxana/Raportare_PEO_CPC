export type GeneratedActivityReportSections = {
  table: string;
  narrative: string;
};

export function combineActivityReportSections({ table, narrative }: GeneratedActivityReportSections) {
  return [table.trim(), narrative.trim()].filter(Boolean).join('\n\n');
}

export function splitActivityReportSections(report: string): GeneratedActivityReportSections {
  const narrativeStart = report.search(/^##\s+2[.\s-]/m);
  if (narrativeStart < 0) {
    return {
      table: report,
      narrative: '',
    };
  }

  return {
    table: report.slice(0, narrativeStart).trim(),
    narrative: report.slice(narrativeStart).trim(),
  };
}
