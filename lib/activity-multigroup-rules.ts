import type { Activity } from './types';

type ActivityIdentity = Pick<Activity, 'activityType' | 'title'>;

function normalizeRuleText(value?: string | null) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function getActivityLabel(activity: ActivityIdentity) {
  return normalizeRuleText(activity.activityType || activity.title);
}

export function isComCommunicationMultiGroupActivity(activity: ActivityIdentity) {
  const label = getActivityLabel(activity);
  if (!label) return false;

  const mentionsSocialMedia = label.includes('some')
    || label.includes('social media')
    || label.includes('retele sociale')
    || label.includes('sociale');
  const mentionsVisualContent = label.includes('content')
    || label.includes('continut')
    || label.includes('vizual')
    || label.includes('visual');

  return (
    label.includes('aliniere experti in comunicare')
    || (label.includes('articole') && label.includes('concordia.ro'))
    || (mentionsSocialMedia && mentionsVisualContent)
  );
}

export function areComCommunicationMultiGroupActivities(
  activity: ActivityIdentity,
  candidate: ActivityIdentity,
) {
  return isComCommunicationMultiGroupActivity(activity)
    && isComCommunicationMultiGroupActivity(candidate);
}

export function getComCommunicationMultiGroupKey(activity: ActivityIdentity) {
  return isComCommunicationMultiGroupActivity(activity)
    ? 'com:communication-multigroup'
    : null;
}
