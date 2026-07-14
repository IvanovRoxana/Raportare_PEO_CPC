export function getFinalDeliverableAttachmentDate(selectedDates: string[]) {
  const sortedDates = [...new Set(selectedDates.filter(Boolean))].sort();
  return sortedDates[sortedDates.length - 1] ?? null;
}

export function getDeliverableAttachmentDate(selectedDates: string[], preferredDate?: string | null) {
  const uniqueDates = new Set(selectedDates.filter(Boolean));
  if (preferredDate && uniqueDates.has(preferredDate)) {
    return preferredDate;
  }

  return getFinalDeliverableAttachmentDate(selectedDates);
}

export function shouldAttachUploadedDeliverablesToDate(
  selectedDates: string[],
  activityDate: string,
  preferredDate?: string | null,
) {
  const attachmentDate = getDeliverableAttachmentDate(selectedDates, preferredDate);
  return attachmentDate === activityDate;
}
