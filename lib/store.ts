// PEO LocalStorage Store

import type {
  Activity,
  Deliverable,
  VerificationData,
  AppSettings,
  Expert,
  EXPERTS_LIST,
} from './types';

const STORAGE_KEYS = {
  ACTIVITIES: 'peo_activities',
  VERIFICATION: 'peo_verification',
  SETTINGS: 'peo_settings',
  EXPERTS: 'peo_experts',
} as const;

// Default settings
const DEFAULT_SETTINGS: AppSettings = {
  claudeApiKey: '',
  projectCode: '302141',
  projectTitle: 'Proiect PEO',
  contractNumber: '',
  experts: [],
};

// Activities Store
export const activitiesStore = {
  getAll: (): Activity[] => {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(STORAGE_KEYS.ACTIVITIES);
    return data ? JSON.parse(data) : [];
  },

  getByExpert: (expertId: string): Activity[] => {
    return activitiesStore.getAll().filter((a) => a.expertId === expertId);
  },

  getByMonth: (month: number, year: number): Activity[] => {
    return activitiesStore.getAll().filter((a) => {
      const date = new Date(a.date);
      return date.getMonth() === month && date.getFullYear() === year;
    });
  },

  getByDateRange: (startDate: string, endDate: string): Activity[] => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    return activitiesStore.getAll().filter((a) => {
      const date = new Date(a.date);
      return date >= start && date <= end;
    });
  },

  add: (activity: Activity): void => {
    const activities = activitiesStore.getAll();
    activities.push(activity);
    localStorage.setItem(STORAGE_KEYS.ACTIVITIES, JSON.stringify(activities));
  },

  addBatch: (newActivities: Activity[]): void => {
    const activities = activitiesStore.getAll();
    activities.push(...newActivities);
    localStorage.setItem(STORAGE_KEYS.ACTIVITIES, JSON.stringify(activities));
  },

  update: (id: string, updates: Partial<Activity>): void => {
    const activities = activitiesStore.getAll();
    const index = activities.findIndex((a) => a.id === id);
    if (index !== -1) {
      activities[index] = { ...activities[index], ...updates, updatedAt: new Date().toISOString() };
      localStorage.setItem(STORAGE_KEYS.ACTIVITIES, JSON.stringify(activities));
    }
  },

  delete: (id: string): void => {
    const activities = activitiesStore.getAll().filter((a) => a.id !== id);
    localStorage.setItem(STORAGE_KEYS.ACTIVITIES, JSON.stringify(activities));
  },

  deleteByDates: (dates: string[]): void => {
    const activities = activitiesStore.getAll().filter((a) => !dates.includes(a.date));
    localStorage.setItem(STORAGE_KEYS.ACTIVITIES, JSON.stringify(activities));
  },

  clear: (): void => {
    localStorage.removeItem(STORAGE_KEYS.ACTIVITIES);
  },
};

// Verification Store
export const verificationStore = {
  getAll: (): VerificationData[] => {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(STORAGE_KEYS.VERIFICATION);
    return data ? JSON.parse(data) : [];
  },

  getByExpertAndMonth: (expertId: string, month: string, year: string): VerificationData | null => {
    const all = verificationStore.getAll();
    return all.find((v) => v.expertId === expertId && v.month === month && v.year === year) || null;
  },

  save: (data: VerificationData): void => {
    const all = verificationStore.getAll();
    const index = all.findIndex(
      (v) => v.expertId === data.expertId && v.month === data.month && v.year === data.year
    );
    if (index !== -1) {
      all[index] = data;
    } else {
      all.push(data);
    }
    localStorage.setItem(STORAGE_KEYS.VERIFICATION, JSON.stringify(all));
  },

  delete: (expertId: string, month: string, year: string): void => {
    const all = verificationStore
      .getAll()
      .filter((v) => !(v.expertId === expertId && v.month === month && v.year === year));
    localStorage.setItem(STORAGE_KEYS.VERIFICATION, JSON.stringify(all));
  },

  clear: (): void => {
    localStorage.removeItem(STORAGE_KEYS.VERIFICATION);
  },
};

// Settings Store
export const settingsStore = {
  get: (): AppSettings => {
    if (typeof window === 'undefined') return DEFAULT_SETTINGS;
    const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    return data ? { ...DEFAULT_SETTINGS, ...JSON.parse(data) } : DEFAULT_SETTINGS;
  },

  save: (settings: Partial<AppSettings>): void => {
    const current = settingsStore.get();
    const updated = { ...current, ...settings };
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(updated));
  },

  getApiKey: (): string => {
    return settingsStore.get().claudeApiKey;
  },

  setApiKey: (key: string): void => {
    settingsStore.save({ claudeApiKey: key });
  },

  clear: (): void => {
    localStorage.removeItem(STORAGE_KEYS.SETTINGS);
  },
};

// Experts Store
export const expertsStore = {
  getAll: (): Expert[] => {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(STORAGE_KEYS.EXPERTS);
    return data ? JSON.parse(data) : [];
  },

  add: (expert: Expert): void => {
    const experts = expertsStore.getAll();
    experts.push(expert);
    localStorage.setItem(STORAGE_KEYS.EXPERTS, JSON.stringify(experts));
  },

  update: (id: string, updates: Partial<Expert>): void => {
    const experts = expertsStore.getAll();
    const index = experts.findIndex((e) => e.id === id);
    if (index !== -1) {
      experts[index] = { ...experts[index], ...updates };
      localStorage.setItem(STORAGE_KEYS.EXPERTS, JSON.stringify(experts));
    }
  },

  delete: (id: string): void => {
    const experts = expertsStore.getAll().filter((e) => e.id !== id);
    localStorage.setItem(STORAGE_KEYS.EXPERTS, JSON.stringify(experts));
  },

  clear: (): void => {
    localStorage.removeItem(STORAGE_KEYS.EXPERTS);
  },
};

// Utility functions
export const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

export const formatDate = (date: Date | string): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString().split('T')[0];
};

export const formatDateRo = (date: Date | string): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('ro-RO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

export const getMonthName = (month: number): string => {
  const months = [
    'Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie',
    'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie'
  ];
  return months[month];
};

export const calculateWorkingDays = (month: number, year: number): number => {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let workingDays = 0;
  
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const dayOfWeek = date.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      workingDays++;
    }
  }
  
  return workingDays;
};
