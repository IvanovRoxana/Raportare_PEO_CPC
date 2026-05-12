'use client';

import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, AlertTriangle, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getMonthName, formatDate } from '@/lib/app-utils';
import { getWorkingHoursInfo } from '@/lib/working-hours';
import type { Activity } from '@/lib/types';

interface MultiSelectCalendarProps {
  selectedDates: string[];
  onSelectDates: (dates: string[]) => void;
  activities: Activity[];
  onMonthChange?: (month: number, year: number) => void;
  expertNorma?: number; // hours per day (4, 6, or 8)
}

export function MultiSelectCalendar({
  selectedDates,
  onSelectDates,
  activities,
  onMonthChange,
  expertNorma = 8,
}: MultiSelectCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<string | null>(null);

  const month = currentDate.getMonth();
  const year = currentDate.getFullYear();
  
  // Get working hours info (holidays, max hours, remaining)
  const workingInfo = useMemo(() => {
    return getWorkingHoursInfo(month, year, expertNorma, activities);
  }, [month, year, expertNorma, activities]);
  
  const totalHoursMonth = workingInfo.totalHours;
  const remainingHours = workingInfo.remaining;

  const daysInMonth = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days: { date: Date; isCurrentMonth: boolean }[] = [];

    // Add days from previous month to fill the first week
    const firstDayOfWeek = firstDay.getDay();
    const prevMonthStart = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;
    for (let i = prevMonthStart - 1; i >= 0; i--) {
      const date = new Date(year, month, -i);
      days.push({ date, isCurrentMonth: false });
    }

    // Add days of current month
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push({ date: new Date(year, month, i), isCurrentMonth: true });
    }

    // Add days from next month to complete the grid
    const remainingDays = 42 - days.length;
    for (let i = 1; i <= remainingDays; i++) {
      days.push({ date: new Date(year, month + 1, i), isCurrentMonth: false });
    }

    return days;
  }, [month, year]);

  const activityMap = useMemo(() => {
    const map: Record<string, Activity[]> = {};
    activities.forEach((activity) => {
      const dateKey = activity.date;
      if (!map[dateKey]) {
        map[dateKey] = [];
      }
      map[dateKey].push(activity);
    });
    return map;
  }, [activities]);

  const goToPrevMonth = () => {
    const newDate = new Date(year, month - 1, 1);
    setCurrentDate(newDate);
    onMonthChange?.(newDate.getMonth(), newDate.getFullYear());
  };

  const goToNextMonth = () => {
    const newDate = new Date(year, month + 1, 1);
    setCurrentDate(newDate);
    onMonthChange?.(newDate.getMonth(), newDate.getFullYear());
  };

  const handleDateClick = (date: Date, isCurrentMonth: boolean) => {
    if (!isCurrentMonth) return;

    const dateStr = formatDate(date);
    const dayOfWeek = date.getDay();

    // Skip weekends
    if (dayOfWeek === 0 || dayOfWeek === 6) return;

    if (selectedDates.includes(dateStr)) {
      onSelectDates(selectedDates.filter((d) => d !== dateStr));
    } else {
      onSelectDates([...selectedDates, dateStr]);
    }
  };

  const handleMouseDown = (date: Date, isCurrentMonth: boolean) => {
    if (!isCurrentMonth) return;
    const dayOfWeek = date.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) return;

    setIsSelecting(true);
    setSelectionStart(formatDate(date));
  };

  const handleMouseUp = () => {
    setIsSelecting(false);
    setSelectionStart(null);
  };

  const handleMouseEnter = (date: Date, isCurrentMonth: boolean) => {
    if (!isSelecting || !selectionStart || !isCurrentMonth) return;

    const dayOfWeek = date.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) return;

    const startDate = new Date(selectionStart);
    const endDate = date;
    const [start, end] = startDate <= endDate ? [startDate, endDate] : [endDate, startDate];

    const newDates: string[] = [];
    const current = new Date(start);
    while (current <= end) {
      const dow = current.getDay();
      if (dow !== 0 && dow !== 6) {
        newDates.push(formatDate(current));
      }
      current.setDate(current.getDate() + 1);
    }

    // Merge with existing selected dates
    const uniqueDates = [...new Set([...selectedDates, ...newDates])];
    onSelectDates(uniqueDates);
  };

  const isWeekend = (date: Date) => {
    const day = date.getDay();
    return day === 0 || day === 6;
  };

  const getDateActivities = (date: Date) => {
    return activityMap[formatDate(date)] || [];
  };

  const getTotalHours = (date: Date) => {
    const dateActivities = getDateActivities(date);
    return dateActivities.reduce((sum, a) => sum + a.hours, 0);
  };

  return (
    <div
      className="bg-card border border-border rounded-lg p-4"
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <Button variant="ghost" size="icon" onClick={goToPrevMonth}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h3 className="text-lg font-semibold text-foreground">
          {getMonthName(month)} {year}
        </h3>
        <Button variant="ghost" size="icon" onClick={goToNextMonth}>
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {['Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sâ', 'Du'].map((day) => (
          <div key={day} className="text-center text-sm font-medium text-muted-foreground py-2">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {daysInMonth.map(({ date, isCurrentMonth }, index) => {
          const dateStr = formatDate(date);
          const isSelected = selectedDates.includes(dateStr);
          const isWeekendDay = isWeekend(date);
          const dateActivities = getDateActivities(date);
          const hasActivities = dateActivities.length > 0;
          const totalHours = getTotalHours(date);
          const isToday = formatDate(new Date()) === dateStr;

          return (
            <div
              key={index}
              onClick={() => handleDateClick(date, isCurrentMonth)}
              onMouseDown={() => handleMouseDown(date, isCurrentMonth)}
              onMouseEnter={() => handleMouseEnter(date, isCurrentMonth)}
              className={cn(
                'relative min-h-[60px] p-1 rounded-md border transition-all cursor-pointer select-none',
                !isCurrentMonth && 'opacity-30 cursor-default',
                isWeekendDay && 'bg-muted/50 cursor-default',
                isCurrentMonth && !isWeekendDay && 'hover:bg-accent',
                isSelected && 'bg-primary/20 border-primary',
                isToday && 'ring-2 ring-primary',
                hasActivities && !isSelected && 'bg-green-50 dark:bg-green-950/30'
              )}
            >
              <div className="flex flex-col h-full">
                <span
                  className={cn(
                    'text-sm font-medium',
                    !isCurrentMonth && 'text-muted-foreground',
                    isWeekendDay && 'text-muted-foreground',
                    isToday && 'text-primary font-bold'
                  )}
                >
                  {date.getDate()}
                </span>
                {hasActivities && isCurrentMonth && (
                  <div className="mt-auto">
                    <span className="text-xs font-medium text-green-600 dark:text-green-400">
                      {totalHours}h
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Monthly summary */}
      <div className="mt-4 space-y-2">
        {/* Hours progress */}
        <div className={cn(
          'p-2 rounded-md text-xs flex items-center gap-2',
          remainingHours > 0 ? 'bg-blue-50 text-blue-800' :
          remainingHours < 0 ? 'bg-amber-50 text-amber-800' :
          'bg-green-50 text-green-800'
        )}>
          {remainingHours === 0 && <Check className="h-4 w-4" />}
          {remainingHours < 0 && <AlertTriangle className="h-4 w-4" />}
          <span>
            {totalHoursMonth}h / {workingInfo.maxHoursWithNorma}h
            {remainingHours > 0 && ` — ${remainingHours}h ramase`}
            {remainingHours < 0 && ` — depășire ${Math.abs(remainingHours)}h`}
          </span>
        </div>

        {/* Selected dates summary */}
        {selectedDates.length > 0 && (
          <div className="p-3 bg-primary/10 rounded-md">
            <p className="text-sm font-medium text-foreground">
              {selectedDates.length} {selectedDates.length === 1 ? 'zi selectată' : 'zile selectate'}
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-1 text-xs"
              onClick={() => onSelectDates([])}
            >
              Deselectează toate
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
