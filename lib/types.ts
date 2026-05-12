// PEO Reporting Types

export interface Expert {
  id: string;
  userId?: string;
  name: string;
  role: string;
  email?: string;
  phone?: string;
  category?: 'ap' | 'bh' | 'com' | 'cr' | 'cercetare' | 'gt' | 'gdpr';
  norma: number; // 2, 4, 6, or 8 hours/day
  saCodes?: string[]; // Assigned sub-activities (SA1.1, SA2.1, etc.)
  hasPmAccess?: boolean; // True if expert has access to PM module
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Activity {
  id: string;
  date: string;
  expertId: string;
  expertName?: string;
  hours: number;
  activityType: string;
  saCode?: string; // Sub-activity code (SA1.1, SA2.1, etc.)
  catalogActivityId?: string;
  title: string;
  description?: string;
  deliverables?: Deliverable[];
  location?: string;
  dayType?: 'lucratoare' | 'weekend' | 'sarbatoare';
  workingGroupId?: string;
  status?: 'draft' | 'sent' | 'approved';
  pmNotes?: string;
  grupTinta?: GrupTintaEntry[];
  createdAt?: string;
  updatedAt?: string;
}

export interface Deliverable {
  id: string;
  activityId?: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  filePath?: string;
  uploadedAt?: string;
  fileData?: string; // Base64 encoded for localStorage fallback
}

export interface GrupTintaEntry {
  id: string;
  expertId: string;
  activityId?: string;
  date: string;
  year: number;
  month: number;
  activityType: string;
  organizations: string[];
  participantsCount: number;
  notes?: string;
  createdAt?: string;
}

export interface ActivityCatalog {
  id: string;
  category: string;
  saCode: string;
  serviceCategory: string;
  activityNumber: number;
  activityName: string;
  description?: string;
  objectives?: string;
  serviceComponent?: string;
  beneficiaries?: string;
  expectedResults?: string;
  deliverables?: string;
  indicators?: string;
  createdAt?: string;
}

export interface WorkingGroup {
  id: string;
  name: string;
  type: 'Task Force' | 'Club' | 'Structura';
  email?: string;
  isActive: boolean;
  saCode?: string;
  notes?: string;
  createdAt?: string;
}

export interface ReportStatus {
  id: string;
  expertId: string;
  year: number;
  month: number;
  status: 'draft' | 'sent' | 'approved' | 'rejected';
  sentDate?: string;
  approvalDate?: string;
  pmNotes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ConcurrentProject {
  id: string;
  expertId: string;
  projectName: string;
  projectCode?: string;
  fundingSource?: string;
  dailyHours: number;
  startDate: string;
  endDate?: string;
  isActive: boolean;
  notes?: string;
  createdAt?: string;
}

export interface VerificationData {
  id?: string;
  expertId: string;
  expertName?: string;
  month: string;
  year: string;
  status: 'pending' | 'in-progress' | 'completed' | 'issues';
  pontajRows?: PontajRow[];
  raportRows?: RaportRow[];
  livrabilRows?: LivrabilRow[];
  crossExpertRows?: CrossExpertRow[];
  neconformitati?: Neconformitate[];
  notes?: VerificationNote[];
  createdAt?: string;
  updatedAt?: string;
  // Legacy field names for backward compatibility
  pontajData?: PontajRow[];
  raportActivitateData?: RaportRow[];
  livrabileData?: LivrabilRow[];
  crossExpertData?: CrossExpertRow[];
}

export interface PontajRow {
  id: string;
  date: string;
  hours: number;
  activityCode: string;
  description?: string;
  verified?: boolean;
  issues?: string[];
}

export interface RaportRow {
  id: string;
  date: string;
  activityTitle: string;
  description?: string;
  deliverables?: string[];
  verified?: boolean;
  matchesPontaj?: boolean;
  issues?: string[];
}

export interface LivrabilRow {
  id: string;
  fileName: string;
  activityDate?: string;
  activityTitle?: string;
  fileExists?: boolean;
  titleMatch?: boolean;
  issues?: string[];
}

export interface CrossExpertRow {
  id: string;
  date: string;
  expert1Id?: string;
  expert1Name: string;
  expert2Id?: string;
  expert2Name: string;
  // Legacy field names
  expert1?: string;
  expert2?: string;
  activity1: string;
  activity2: string;
  similarity: number;
  isPotentialIssue?: boolean;
}

export interface Neconformitate {
  id: string;
  verificationId?: string;
  type: 'pontaj' | 'raport' | 'livrabil' | 'cross-expert' | 'other';
  severity: 'low' | 'medium' | 'high';
  description: string;
  affectedDate?: string;
  affectedExpertId?: string;
  affectedExpert?: string; // Legacy
  resolved: boolean;
  resolution?: string;
  resolvedAt?: string;
  createdAt?: string;
}

export interface VerificationNote {
  id: string;
  verificationId?: string;
  content: string;
  category: string;
  authorId?: string;
  authorName?: string;
  author?: string; // Legacy
  createdAt?: string;
  updatedAt?: string;
}

export interface AppSettings {
  claudeApiKey: string;
  projectCode: string;
  projectTitle: string;
  contractNumber: string;
  experts: Expert[];
}

export interface MonthData {
  month: number;
  year: number;
  activities: Activity[];
  totalHours: number;
  workDays: number;
  maxHours: number; // Based on expert norma
}

// Working hours calculation result
export interface WorkingHoursInfo {
  workingDays: number;
  holidays: string[];
  maxHours: number;
  maxHoursWithNorma: number;
}

// Sub-activities based on PEO structure
export type SubActivityCode = 
  | 'SA1.1' | 'SA1.2' | 'SA1.3'
  | 'SA2.1' | 'SA2.2'
  | 'SA3.1' | 'SA3.2' | 'SA3.3'
  | 'SA4.1';

export const SUB_ACTIVITIES: { code: SubActivityCode; name: string; category: string }[] = [
  { code: 'SA1.1', name: 'Dezvoltare acord parteneriat', category: 'AP' },
  { code: 'SA1.2', name: 'Dezvoltare curriculum STEAM', category: 'Curriculum' },
  { code: 'SA1.3', name: 'Formare formatori STEAM', category: 'Formare' },
  { code: 'SA2.1', name: 'Cercetare educationala', category: 'Cercetare' },
  { code: 'SA2.2', name: 'Inovare didactica', category: 'Inovare' },
  { code: 'SA3.1', name: 'Selectie grup tinta', category: 'GT' },
  { code: 'SA3.2', name: 'Formare grup tinta', category: 'GT' },
  { code: 'SA3.3', name: 'Mentorat grup tinta', category: 'GT' },
  { code: 'SA4.1', name: 'Comunicare si diseminare', category: 'Comunicare' },
];

export type ActivityType = 
  | 'A4.1' 
  | 'A4.2' 
  | 'A4.3' 
  | 'A4.4' 
  | 'A4.5' 
  | 'A5.1' 
  | 'A5.2' 
  | 'A6.1' 
  | 'A6.2' 
  | 'Management';

export const ACTIVITY_TYPES: { value: ActivityType; label: string }[] = [
  { value: 'A4.1', label: 'A4.1 - Elaborare metodologie' },
  { value: 'A4.2', label: 'A4.2 - Formare formatori' },
  { value: 'A4.3', label: 'A4.3 - Dezvoltare curriculum' },
  { value: 'A4.4', label: 'A4.4 - Implementare pilot' },
  { value: 'A4.5', label: 'A4.5 - Evaluare și raportare' },
  { value: 'A5.1', label: 'A5.1 - Formare cadre didactice' },
  { value: 'A5.2', label: 'A5.2 - Mentorat' },
  { value: 'A6.1', label: 'A6.1 - Diseminare rezultate' },
  { value: 'A6.2', label: 'A6.2 - Conferințe' },
  { value: 'Management', label: 'Management proiect' },
];

// Expert categories
export const EXPERT_CATEGORIES: { value: string; label: string }[] = [
  { value: 'ap', label: 'Administrare Proiect' },
  { value: 'bh', label: 'Back Office / HR' },
  { value: 'com', label: 'Comunicare' },
  { value: 'cr', label: 'Curriculum' },
  { value: 'cercetare', label: 'Cercetare' },
  { value: 'gt', label: 'Grup Tinta' },
  { value: 'gdpr', label: 'GDPR' },
];

// Norma options (hours per day)
export const NORMA_OPTIONS: { value: number; label: string }[] = [
  { value: 8, label: '8 ore/zi (100%)' },
  { value: 6, label: '6 ore/zi (75%)' },
  { value: 4, label: '4 ore/zi (50%)' },
  { value: 2, label: '2 ore/zi (25%)' },
];
