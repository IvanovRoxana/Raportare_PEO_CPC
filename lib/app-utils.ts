'use client';

export const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
};

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const padDatePart = (value: number): string => value.toString().padStart(2, '0');

const parseLocalDate = (date: Date | string): Date => {
  if (typeof date !== 'string') return date;

  if (DATE_ONLY_PATTERN.test(date)) {
    const [year, month, day] = date.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  return new Date(date);
};

export const formatDate = (date: Date | string): string => {
  const d = parseLocalDate(date);
  return `${d.getFullYear()}-${padDatePart(d.getMonth() + 1)}-${padDatePart(d.getDate())}`;
};

export const formatDateRo = (date: Date | string): string => {
  const d = parseLocalDate(date);
  return d.toLocaleDateString('ro-RO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

export const getMonthName = (month: number): string => {
  const months = [
    'Ianuarie',
    'Februarie',
    'Martie',
    'Aprilie',
    'Mai',
    'Iunie',
    'Iulie',
    'August',
    'Septembrie',
    'Octombrie',
    'Noiembrie',
    'Decembrie',
  ];
  return months[month] ?? '';
};

export const calculateWorkingDays = (month: number, year: number): number => {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let workingDays = 0;

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month, day);
    const dayOfWeek = date.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      workingDays += 1;
    }
  }

  return workingDays;
};
