'use client';

// Romanian public holidays (fixed dates)
const FIXED_HOLIDAYS = [
  '01-01', // Anul Nou
  '01-02', // Anul Nou (ziua 2)
  '01-24', // Ziua Unirii Principatelor Române
  '05-01', // Ziua Muncii
  '06-01', // Ziua Copilului
  '08-15', // Adormirea Maicii Domnului
  '11-30', // Sfântul Andrei
  '12-01', // Ziua Națională a României
  '12-25', // Crăciunul
  '12-26', // Crăciunul (ziua 2)
];

// Orthodox Easter dates (pre-calculated for 2024-2030)
// Format: [Paste, Paste+1 (Luni), Rusalii, Rusalii+1]
const ORTHODOX_EASTER: Record<number, string[]> = {
  2024: ['05-05', '05-06', '06-23', '06-24'],
  2025: ['04-20', '04-21', '06-08', '06-09'],
  2026: ['04-12', '04-13', '05-31', '06-01'], // Rusalii coincide cu 1 Iunie
  2027: ['05-02', '05-03', '06-20', '06-21'],
  2028: ['04-16', '04-17', '06-04', '06-05'],
  2029: ['04-08', '04-09', '05-27', '05-28'],
  2030: ['04-28', '04-29', '06-16', '06-17'],
};

// Monthly working hour norms for full-time (8h/day) - Romanian standard
// Based on typical working days per month
export const MONTH_NORMS_2026: Record<number, number> = {
  1: 168,  // Ianuarie - 21 zile
  2: 160,  // Februarie - 20 zile
  3: 176,  // Martie - 22 zile
  4: 168,  // Aprilie - 21 zile (include Paste)
  5: 160,  // Mai - 20 zile (1 Mai, Rusalii)
  6: 168,  // Iunie - 21 zile (1 Iunie)
  7: 184,  // Iulie - 23 zile
  8: 168,  // August - 21 zile (15 August)
  9: 176,  // Septembrie - 22 zile
  10: 176, // Octombrie - 22 zile
  11: 160, // Noiembrie - 20 zile (30 Nov)
  12: 168, // Decembrie - 21 zile (1, 25, 26 Dec)
};

/**
 * Get all Romanian public holidays for a given year
 */
export function getRomanianHolidays(year: number): Date[] {
  const holidays: Date[] = [];
  
  // Add fixed holidays
  FIXED_HOLIDAYS.forEach(date => {
    holidays.push(new Date(`${year}-${date}`));
  });
  
  // Add Orthodox Easter and Rusalii
  const easterDates = ORTHODOX_EASTER[year];
  if (easterDates) {
    easterDates.forEach(date => {
      holidays.push(new Date(`${year}-${date}`));
    });
  }
  
  return holidays;
}

/**
 * Check if a date is a Romanian public holiday
 */
export function isRomanianHoliday(date: Date): boolean {
  const year = date.getFullYear();
  const holidays = getRomanianHolidays(year);
  
  return holidays.some(holiday => 
    holiday.getFullYear() === date.getFullYear() &&
    holiday.getMonth() === date.getMonth() &&
    holiday.getDate() === date.getDate()
  );
}

/**
 * Check if a date is a working day (not weekend, not holiday)
 */
export function isWorkingDay(date: Date): boolean {
  const dayOfWeek = date.getDay();
  // 0 = Sunday, 6 = Saturday
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return false;
  }
  return !isRomanianHoliday(date);
}

/**
 * Get the number of working days in a month
 */
export function getWorkingDaysInMonth(month: number, year: number): number {
  let workingDays = 0;
  const daysInMonth = new Date(year, month, 0).getDate();
  
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day);
    if (isWorkingDay(date)) {
      workingDays++;
    }
  }
  
  return workingDays;
}

/**
 * Get list of working days in a month (as Date objects)
 */
export function getWorkingDaysListInMonth(month: number, year: number): Date[] {
  const workingDays: Date[] = [];
  const daysInMonth = new Date(year, month, 0).getDate();
  
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day);
    if (isWorkingDay(date)) {
      workingDays.push(date);
    }
  }
  
  return workingDays;
}

/**
 * Calculate maximum allowed hours for an expert in a given month
 * @param norma - Daily hours (4, 6, or 8)
 * @param month - Month (1-12)
 * @param year - Year
 */
export function getMaxHoursForMonth(norma: number, month: number, year: number): number {
  const workingDays = getWorkingDaysInMonth(month, year);
  return workingDays * norma;
}

/**
 * Calculate maximum allowed hours considering concurrent projects
 * Legal limit: 12 hours/day maximum across all projects
 * @param normaThisProject - Daily hours for this project
 * @param normaConcurrentProjects - Total daily hours from other projects
 * @param month - Month (1-12)
 * @param year - Year
 */
export function getMaxHoursWithConcurrentProjects(
  normaThisProject: number,
  normaConcurrentProjects: number,
  month: number,
  year: number
): { maxHours: number; limitedByLaw: boolean; legalLimit: number } {
  const workingDays = getWorkingDaysInMonth(month, year);
  const totalDailyHours = normaThisProject + normaConcurrentProjects;
  
  // Legal limit: 12 hours/day maximum
  const LEGAL_DAILY_LIMIT = 12;
  
  if (totalDailyHours > LEGAL_DAILY_LIMIT) {
    // Reduce this project's hours to stay within legal limit
    const allowedDailyHours = Math.max(0, LEGAL_DAILY_LIMIT - normaConcurrentProjects);
    return {
      maxHours: workingDays * allowedDailyHours,
      limitedByLaw: true,
      legalLimit: workingDays * LEGAL_DAILY_LIMIT,
    };
  }
  
  return {
    maxHours: workingDays * normaThisProject,
    limitedByLaw: false,
    legalLimit: workingDays * LEGAL_DAILY_LIMIT,
  };
}

/**
 * Get expert norm description
 */
export function getNormaDescription(norma: number): string {
  switch (norma) {
    case 8:
      return 'Full-time (8h/zi)';
    case 6:
      return '75% normă (6h/zi)';
    case 4:
      return '50% normă (4h/zi)';
    case 2:
      return '25% normă (2h/zi)';
    default:
      return `${norma}h/zi`;
  }
}

/**
 * Get day type for a given date
 */
export function getDayType(date: Date): 'lucratoare' | 'weekend' | 'sarbatoare' {
  const dayOfWeek = date.getDay();
  
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return 'weekend';
  }
  
  if (isRomanianHoliday(date)) {
    return 'sarbatoare';
  }
  
  return 'lucratoare';
}

/**
 * Format date as Romanian string
 */
export function formatDateRomanian(date: Date): string {
  const months = [
    'ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie',
    'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'
  ];
  
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * Get month name in Romanian
 */
export function getMonthNameRomanian(month: number): string {
  const months = [
    'Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie',
    'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie'
  ];
  return months[month - 1] || '';
}

/**
 * Get working hours info for a month (used by calendar)
 */
export interface WorkingHoursInfo {
  workingDays: number;
  maxHoursFullTime: number;
  maxHoursWithNorma: number;
  maxHours: number;
  totalHours: number;
  remaining: number;
  holidays: Date[];
}

interface ActivityWithHours {
  hours?: number;
}

export function getWorkingHoursInfo(
  month: number, 
  year: number, 
  norma: number = 8, 
  activities?: ActivityWithHours[]
): WorkingHoursInfo {
  const workingDays = getWorkingDaysInMonth(month + 1, year); // month is 0-indexed from calendar
  const holidays = getRomanianHolidays(year).filter(h => h.getMonth() === month);
  const maxHours = workingDays * norma;
  const totalHours = activities?.reduce((sum, a) => sum + (a.hours || 0), 0) || 0;
  const remaining = maxHours - totalHours;
  
  return {
    workingDays,
    maxHoursFullTime: workingDays * 8,
    maxHoursWithNorma: maxHours,
    maxHours,
    totalHours,
    remaining,
    holidays,
  };
}

/**
 * Calculate hours summary for an expert in a month
 */
export interface MonthlyHoursSummary {
  expertId: string;
  month: number;
  year: number;
  norma: number;
  workingDays: number;
  maxHours: number;
  loggedHours: number;
  remainingHours: number;
  percentComplete: number;
  isOverLimit: boolean;
}

export function calculateMonthlyHoursSummary(
  expertId: string,
  norma: number,
  month: number,
  year: number,
  loggedHours: number
): MonthlyHoursSummary {
  const workingDays = getWorkingDaysInMonth(month, year);
  const maxHours = workingDays * norma;
  const remainingHours = Math.max(0, maxHours - loggedHours);
  const percentComplete = maxHours > 0 ? Math.min(100, (loggedHours / maxHours) * 100) : 0;
  
  return {
    expertId,
    month,
    year,
    norma,
    workingDays,
    maxHours,
    loggedHours,
    remainingHours,
    percentComplete,
    isOverLimit: loggedHours > maxHours,
  };
}
