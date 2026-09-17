export type EvidenceInterval = { start: number; end: number };
export type DocumentCoverage = {
  documentId: string; version: string; totalChars: number; extractionComplete: boolean;
  intervals: EvidenceInterval[]; consultedChars: number; analysisComplete: boolean;
};

/** Half-open character offsets refer to the versioned extraction, never invented PDF pages. */
export function mergeEvidenceIntervals(intervals: EvidenceInterval[], length: number): EvidenceInterval[] {
  const sorted = intervals.map(({ start, end }) => ({ start: Math.max(0, Math.floor(start)), end: Math.min(length, Math.floor(end)) }))
    .filter(({ start, end }) => Number.isFinite(start) && Number.isFinite(end) && end > start).sort((a, b) => a.start - b.start);
  const merged: EvidenceInterval[] = [];
  for (const interval of sorted) {
    const previous = merged.at(-1);
    if (previous && interval.start <= previous.end) previous.end = Math.max(previous.end, interval.end);
    else merged.push({ ...interval });
  }
  return merged;
}

export class EligibilityCoverage {
  private entries = new Map<string, { text: string; coverage: DocumentCoverage }>();
  constructor(documents: Array<{ id: string; text: string; version: string; extractionComplete: boolean }>) {
    for (const doc of documents) this.entries.set(doc.id, { text: doc.text, coverage: {
      documentId: doc.id, version: doc.version, totalChars: doc.text.length, extractionComplete: doc.extractionComplete,
      intervals: [], consultedChars: 0, analysisComplete: false,
    } });
  }
  read(id: string, start: number, end: number) {
    const entry = this.entries.get(id);
    if (!entry) throw new Error('ELIGIBILITY_DOCUMENT_FORBIDDEN');
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || start >= entry.text.length) throw new Error('ELIGIBILITY_INTERVAL_INVALID');
    const interval = { start, end: Math.min(end, entry.text.length) };
    entry.coverage.intervals = mergeEvidenceIntervals([...entry.coverage.intervals, interval], entry.text.length);
    entry.coverage.consultedChars = entry.coverage.intervals.reduce((n, part) => n + part.end - part.start, 0);
    entry.coverage.analysisComplete = entry.coverage.extractionComplete && entry.coverage.consultedChars === entry.text.length;
    return { documentId: id, version: entry.coverage.version, ...interval, totalChars: entry.text.length,
      extractionComplete: entry.coverage.extractionComplete, text: entry.text.slice(interval.start, interval.end) };
  }
  texts(id: string) {
    const entry = this.entries.get(id);
    return entry?.coverage.intervals.map(({ start, end }) => entry.text.slice(start, end)) || [];
  }
  snapshot(): DocumentCoverage[] { return [...this.entries.values()].map(({ coverage }) => structuredClone(coverage)); }
}
