export function isProcurementAiEnabled() {
  return process.env.OPENAI_PROCUREMENT_AI_ENABLED !== 'false';
}

export function selectProcurementEvaluationModel() {
  return process.env.OPENAI_PROCUREMENT_EVAL_MODEL || process.env.OPENAI_STANDARD_REPORT_MODEL || 'openai/gpt-4o-mini';
}

export function truncateForProcurementAi(text: string, maxChars = Number(process.env.OPENAI_PROCUREMENT_MAX_CHARS ?? 18_000)) {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n[TRUNCATED_FOR_AI_REVIEW]`;
}
