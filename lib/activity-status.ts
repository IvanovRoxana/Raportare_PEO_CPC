// ============================================
// Activity Entry Status Calculation
// ============================================

import { EXCEPTIONS, EVENT_ACTS, isEventActivity } from './peo-constants';
import type { Activity, Deliverable } from './types';

export type ActivityStatus = 
  | 'complete' 
  | 'exception' 
  | 'exc_desc' 
  | 'common_wait' 
  | 'missing' 
  | 'name_mismatch' 
  | 'title_mismatch' 
  | 'draft' 
  | 'leave';

export interface DeliverableWithStatus extends Deliverable {
  uploaded?: boolean;
  titleConfirmed?: boolean;
  stadiu?: string;
  aiCheck?: boolean;
  isPhoto?: boolean;
  category?: 'livrabil' | 'event_mom' | 'event_proof' | 'raport_preliminar' | 'justificativ';
  isPendingConfirm?: boolean;
  common?: boolean;
}

export interface ActivityEntry extends Activity {
  dayType?: 'lucratoare' | 'CO' | 'CM';
  uploaded?: boolean;
  fileNameMismatch?: boolean;
  common?: boolean;
  deliverables?: DeliverableWithStatus[];
}

/**
 * Calculate the status of an activity entry based on its data
 */
export function getActivityStatus(entry: ActivityEntry): ActivityStatus {
  // Leave days
  if (entry.dayType === 'CO' || entry.dayType === 'CM') {
    return 'leave';
  }
  
  // No hours = draft
  if (!entry.hours || entry.hours === 0) {
    return 'draft';
  }
  
  // Exception activities (Elaborare RA/OPIS, Sedinta interna, Verificare planning)
  if (EXCEPTIONS.includes(entry.activityType || '')) {
    return (entry.description || '').length >= 15 ? 'exception' : 'exc_desc';
  }
  
  const delivs = entry.deliverables || [];
  
  if (delivs.length > 0) {
    // Check main deliverables
    const mainDelivs = delivs.filter(d => !d.category || d.category === 'livrabil');
    
    if (mainDelivs.length === 0) {
      return 'missing';
    }
    
    if (mainDelivs.some(d => !d.uploaded)) {
      return 'missing';
    }
    
    // Check title confirmation and AI check for non-photo deliverables
    if (mainDelivs.some(d => !d.isPhoto && (!d.titleConfirmed || !d.stadiu || !d.aiCheck))) {
      return 'title_mismatch';
    }
    
    // Check event docs (only for event activities)
    const actLow = (entry.activityType || '').toLowerCase();
    const isEvent = isEventActivity(actLow);
    
    if (isEvent) {
      const hasMOM = delivs.some(d => 
        d.category === 'event_mom' && d.uploaded && !d.isPendingConfirm
      );
      const hasProof = delivs.some(d => 
        d.category === 'event_proof' && d.uploaded
      );
      
      if (!hasMOM || !hasProof) {
        return 'missing';
      }
    }
    
    return 'complete';
  }
  
  // Backward compatibility: old single-deliverable format
  if (entry.common && !entry.uploaded) {
    return 'common_wait';
  }
  
  if (!entry.uploaded) {
    return 'missing';
  }
  
  if (entry.fileNameMismatch) {
    return 'name_mismatch';
  }
  
  return 'complete';
}

/**
 * Get status display configuration
 */
export function getStatusConfig(status: ActivityStatus) {
  const configs: Record<ActivityStatus, { label: string; bg: string; txt: string; bd: string }> = {
    complete: { label: 'Complet', bg: '#EAF3DE', txt: '#3B6D11', bd: '#97C459' },
    exception: { label: 'Exceptie OK', bg: '#EAF3DE', txt: '#3B6D11', bd: '#97C459' },
    exc_desc: { label: 'Descriere lipsa', bg: '#FAEEDA', txt: '#633806', bd: '#EF9F27' },
    common_wait: { label: 'Comun — lipsa', bg: '#FAEEDA', txt: '#633806', bd: '#EF9F27' },
    missing: { label: 'Fara livrabil', bg: '#FCEBEB', txt: '#791F1F', bd: '#F09595' },
    name_mismatch: { label: 'Denumire neconcordanta', bg: '#FAEEDA', txt: '#633806', bd: '#EF9F27' },
    title_mismatch: { label: 'Titlu prima pagina gresit', bg: '#FAEEDA', txt: '#633806', bd: '#EF9F27' },
    draft: { label: 'Draft', bg: '#F1F5F9', txt: '#64748B', bd: '#E2E8F0' },
    leave: { label: 'CO / CM', bg: '#EFF6FF', txt: '#1E40AF', bd: '#BFDBFE' },
  };
  
  return configs[status] || configs.draft;
}

/**
 * Get calendar cell color based on day state
 */
export type CalendarCellState = 
  | 'nonworking' 
  | 'co' 
  | 'cm' 
  | 'empty_past' 
  | 'empty' 
  | 'exceeds' 
  | 'issue' 
  | 'ok';

export function getCalendarCellColor(state: CalendarCellState) {
  const colors: Record<CalendarCellState, { bg: string; txt: string; bd: string }> = {
    nonworking: { bg: '#F1F5F9', txt: '#94A3B8', bd: '#E2E8F0' },
    co: { bg: '#EFF6FF', txt: '#1E40AF', bd: '#BFDBFE' },
    cm: { bg: '#F0F9FF', txt: '#0369A1', bd: '#BAE6FD' },
    empty_past: { bg: '#FFF5F5', txt: '#FCA5A5', bd: '#FEE2E2' },
    empty: { bg: '#fff', txt: '#CBD5E1', bd: '#E2E8F0' },
    exceeds: { bg: '#FAEEDA', txt: '#92400E', bd: '#FCD34D' },
    issue: { bg: '#FCEBEB', txt: '#991B1B', bd: '#FCA5A5' },
    ok: { bg: '#EAF3DE', txt: '#3B6D11', bd: '#97C459' },
  };
  
  return colors[state] || colors.empty;
}

/**
 * Calculate calendar cell state for a specific day
 */
export function calculateCalendarCellState(
  dayEntries: ActivityEntry[],
  isNonWorking: boolean,
  isPast: boolean
): CalendarCellState {
  if (isNonWorking) return 'nonworking';
  
  const totalHours = dayEntries.reduce((s, en) => s + (Number(en.hours) || 0), 0);
  const hasLeave = dayEntries.some(en => en.dayType === 'CO' || en.dayType === 'CM');
  const leaveType = hasLeave 
    ? (dayEntries.find(en => en.dayType === 'CO') ? 'CO' : 'CM') 
    : null;
  
  if (hasLeave) {
    return leaveType === 'CO' ? 'co' : 'cm';
  }
  
  const exceeds = totalHours > 8;
  if (exceeds) return 'exceeds';
  
  const hasMissing = dayEntries.some(en => 
    ['missing', 'exc_desc', 'common_wait'].includes(getActivityStatus(en))
  );
  if (hasMissing) return 'issue';
  
  if (dayEntries.length > 0) return 'ok';
  
  if (isPast) return 'empty_past';
  
  return 'empty';
}

/**
 * Check if description is required for common activity
 */
export function needsCommonDescription(
  isActivityCommon: boolean,
  description: string
): boolean {
  return isActivityCommon && (description || '').trim().length < 30;
}

/**
 * Check if extended description is needed for event
 */
export function needsExtendedEventDescription(
  isEventActivity: boolean,
  eventDuration: number | undefined,
  totalHours: number,
  extendedDesc: string
): boolean {
  if (!isEventActivity || !eventDuration || eventDuration <= 0) return false;
  return totalHours > eventDuration && (extendedDesc || '').trim().length < 20;
}
