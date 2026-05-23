export function getFinalDeliverableAttachmentDate(selectedDates: string[]) {
  const sortedDates = [...new Set(selectedDates.filter(Boolean))].sort();
  return sortedDates[sortedDates.length - 1] ?? null;
}

export function shouldAttachUploadedDeliverablesToDate(selectedDates: string[], activityDate: string) {
  const attachmentDate = getFinalDeliverableAttachmentDate(selectedDates);
  return attachmentDate === activityDate;
}
