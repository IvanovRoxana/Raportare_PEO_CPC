'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatDate, getMonthName } from '@/lib/app-utils';
import { getNonWorkingDayInfo } from '@/lib/non-working-days';
import { getWorkingHoursInfo } from '@/lib/working-hours';
import {
  MAX_PONTAJ_HOURS,
  buildSelectedHoursForDates,
  isValidPontajHours,
  normalizePontajHoursForAvailableCapacity,
  normalizePontajHoursValue,
} from '@/lib/pontaj-rules';
import type { Activity } from '@/lib/types';

interface MultiSelectCalendarProps {
  selectedDates: string[];
  onSelectDates: (dates: string[], hours?: Record<string, string>) => void;
  selectedHours?: Record<string, string>;
  onSelectedHoursChange?: (hours: Record<string, string>) => void;
  activities: Activity[];
  onMonthChange?: (month: number, year: number) => void;
  onBlockedMonthChange?: (month: number, year: number) => void;
  canGoToPreviousMonth?: boolean;
  canGoToNextMonth?: boolean;
  monthAccessMessage?: string;
  expertNorma?: number;
  dailyHoursLimit?: number;
  displayMonth?: number;
  displayYear?: number;
}

export function MultiSelectCalendar({
  selectedDates,
  onSelectDates,
  selectedHours = {},
  onSelectedHoursChange,
  activities,
  onMonthChange,
  onBlockedMonthChange,
  canGoToPreviousMonth = true,
  canGoToNextMonth = true,
  monthAccessMessage,
  expertNorma = 8,
  dailyHoursLimit = MAX_PONTAJ_HOURS,
  displayMonth,
  displayYear,
}: MultiSelectCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<string | null>(null);
  const cimDailyHoursLimit = Math.max(0, Math.min(MAX_PONTAJ_HOURS, Math.floor(Number(dailyHoursLimit) || 0)));
  const [defaultHours, setDefaultHours] = useState(cimDailyHoursLimit > 0 ? Number(normalizePontajHoursValue(cimDailyHoursLimit)) : 0);

  const month = currentDate.getMonth();
  const year = currentDate.getFullYear();
  const sortedSelectedDates = useMemo(() => [...selectedDates].sort(), [selectedDates]);
  const normalizeHoursWithinCim = (value: unknown, fallback: number | string = defaultHours) => {
    if (cimDailyHoursLimit <= 0) return 0;
    const normalized = Number(normalizePontajHoursValue(value, fallback || cimDailyHoursLimit));
    return Math.min(normalized, cimDailyHoursLimit);
  };
  const getAvailableHoursForDate = useCallback(
    (date: string) => {
      const existingHours = activities
        .filter((activity) => activity.date === date)
        .reduce((sum, activity) => sum + (Number(activity.hours) || 0), 0);
      return Math.max(0, cimDailyHoursLimit - existingHours);
    },
    [activities, cimDailyHoursLimit],
  );
  const normalizeHoursForDate = useCallback(
    (date: string, value: unknown, fallback: number | string = defaultHours) => normalizePontajHoursForAvailableCapacity(
      value,
      getAvailableHoursForDate(date),
      fallback,
    ),
    [defaultHours, getAvailableHoursForDate],
  );

  useEffect(() => {
    if (displayMonth === undefined || displayYear === undefined) return;
    if (displayMonth === month && displayYear === year) return;
    setCurrentDate(new Date(displayYear, displayMonth, 1));
  }, [displayMonth, displayYear, month, year]);

  useEffect(() => {
    setDefaultHours((current) => {
      if (cimDailyHoursLimit <= 0) return 0;
      return Math.min(Number(normalizePontajHoursValue(current, cimDailyHoursLimit)), cimDailyHoursLimit);
    });
  }, [cimDailyHoursLimit]);

  const workingInfo = useMemo(
    () => getWorkingHoursInfo(month, year, expertNorma, activities),
    [month, year, expertNorma, activities],
  );
  const selectedTotalHours = useMemo(
    () => sortedSelectedDates.reduce((sum, date) => sum + (Number(normalizeHoursForDate(date, selectedHours[date])) || 0), 0),
    [normalizeHoursForDate, selectedHours, sortedSelectedDates],
  );

  const daysInMonth = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days: { date: Date; isCurrentMonth: boolean }[] = [];

    const firstDayOfWeek = firstDay.getDay();
    const prevMonthStart = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;
    for (let i = prevMonthStart - 1; i >= 0; i -= 1) {
      days.push({ date: new Date(year, month, -i), isCurrentMonth: false });
    }

    for (let day = 1; day <= lastDay.getDate(); day += 1) {
      days.push({ date: new Date(year, month, day), isCurrentMonth: true });
    }

    const remainingDays = 42 - days.length;
    for (let day = 1; day <= remainingDays; day += 1) {
      days.push({ date: new Date(year, month + 1, day), isCurrentMonth: false });
    }

    return days;
  }, [month, year]);

  const activityMap = useMemo(() => {
    const map: Record<string, Activity[]> = {};
    activities.forEach((activity) => {
      if (!map[activity.date]) {
        map[activity.date] = [];
      }
      map[activity.date].push(activity);
    });
    return map;
  }, [activities]);

  const syncSelectedDates = (dates: string[], baseHours = selectedHours) => {
    const uniqueDates = [...new Set(dates)].sort();
    const nextHours = cimDailyHoursLimit > 0
      ? Object.fromEntries(
          Object.entries(buildSelectedHoursForDates(uniqueDates, baseHours, defaultHours))
            .map(([date, hours]) => [date, normalizeHoursForDate(date, hours)]),
        )
      : Object.fromEntries(uniqueDates.map((date) => [date, '']));

    onSelectedHoursChange?.(nextHours);
    onSelectDates(uniqueDates, nextHours);
  };

  const updateSelectedHour = (date: string, value: string | number) => {
    if (!isValidPontajHours(value)) return;
    const numericValue = normalizeHoursForDate(date, value, selectedHours[date] || defaultHours);
    onSelectedHoursChange?.({
      ...selectedHours,
      [date]: numericValue,
    });
  };

  const applyHoursToAll = (value: string | number) => {
    if (!isValidPontajHours(value)) return;
    const numericValue = normalizeHoursWithinCim(value, defaultHours);
    setDefaultHours(numericValue);
    onSelectedHoursChange?.(
      Object.fromEntries(sortedSelectedDates.map((date) => [date, normalizeHoursForDate(date, value, numericValue)])),
    );
  };

  const goToPrevMonth = () => {
    const newDate = new Date(year, month - 1, 1);
    if (!canGoToPreviousMonth) {
      onBlockedMonthChange?.(newDate.getMonth(), newDate.getFullYear());
      return;
    }
    setCurrentDate(newDate);
    onMonthChange?.(newDate.getMonth(), newDate.getFullYear());
  };

  const goToNextMonth = () => {
    const newDate = new Date(year, month + 1, 1);
    if (!canGoToNextMonth) {
      onBlockedMonthChange?.(newDate.getMonth(), newDate.getFullYear());
      return;
    }
    setCurrentDate(newDate);
    onMonthChange?.(newDate.getMonth(), newDate.getFullYear());
  };

  const handleDateClick = (date: Date, isCurrentMonth: boolean) => {
    if (!isCurrentMonth || getNonWorkingDayInfo(date).isNonWorkingDay) return;

    const dateStr = formatDate(date);
    if (selectedDates.includes(dateStr)) {
      syncSelectedDates(selectedDates.filter((selectedDate) => selectedDate !== dateStr));
    } else {
      syncSelectedDates([...selectedDates, dateStr]);
    }
  };

  const handleMouseDown = (date: Date, isCurrentMonth: boolean) => {
    if (!isCurrentMonth || getNonWorkingDayInfo(date).isNonWorkingDay) return;
    setIsSelecting(true);
    setSelectionStart(formatDate(date));
  };

  const handleMouseUp = () => {
    setIsSelecting(false);
    setSelectionStart(null);
  };

  const handleMouseEnter = (date: Date, isCurrentMonth: boolean) => {
    if (!isSelecting || !selectionStart || !isCurrentMonth || getNonWorkingDayInfo(date).isNonWorkingDay) return;

    const startDate = new Date(`${selectionStart}T00:00:00`);
    const endDate = date;
    const [start, end] = startDate <= endDate ? [startDate, endDate] : [endDate, startDate];
    const newDates: string[] = [];
    const current = new Date(start);

    while (current <= end) {
      if (!getNonWorkingDayInfo(current).isNonWorkingDay) {
        newDates.push(formatDate(current));
      }
      current.setDate(current.getDate() + 1);
    }

    syncSelectedDates([...selectedDates, ...newDates]);
  };

  const getDateActivities = (date: Date) => activityMap[formatDate(date)] || [];
  const getTotalHours = (date: Date) =>
    getDateActivities(date).reduce((sum, activity) => sum + activity.hours, 0);

  const remainingHours = workingInfo.remaining;
  const projectedTotalHours = workingInfo.totalHours + selectedTotalHours;
  const projectedRemainingHours = workingInfo.maxHoursWithNorma - projectedTotalHours;

  return (
    <div
      className="rounded-lg border border-border bg-card p-4"
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div className="mb-4 flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={goToPrevMonth} disabled={!canGoToPreviousMonth}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h3 className="text-lg font-semibold text-foreground">
          {getMonthName(month)} {year}
        </h3>
        <Button variant="ghost" size="icon" onClick={goToNextMonth} disabled={!canGoToNextMonth}>
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {monthAccessMessage && (
        <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {monthAccessMessage}
        </p>
      )}

      <div className="mb-2 grid grid-cols-7 gap-1">
        {['Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sa', 'Du'].map((day) => (
          <div key={day} className="py-2 text-center text-sm font-medium text-muted-foreground">
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {daysInMonth.map(({ date, isCurrentMonth }, index) => {
          const dateStr = formatDate(date);
          const isSelected = selectedDates.includes(dateStr);
          const nonWorkingInfo = getNonWorkingDayInfo(date);
          const isNonWorkingDay = nonWorkingInfo.isNonWorkingDay;
          const hasActivities = getDateActivities(date).length > 0;
          const totalHours = getTotalHours(date);
          const isToday = formatDate(new Date()) === dateStr;
          const selectedHour = normalizeHoursForDate(dateStr, selectedHours[dateStr]);
          const projectedDailyHours = totalHours + (isSelected ? Number(selectedHour) || 0 : 0);
          const exceedsDailyLimit = isCurrentMonth
            && !isNonWorkingDay
            && projectedDailyHours > cimDailyHoursLimit;

          return (
            <div
              key={index}
              onClick={() => handleDateClick(date, isCurrentMonth)}
              onMouseDown={() => handleMouseDown(date, isCurrentMonth)}
              onMouseEnter={() => handleMouseEnter(date, isCurrentMonth)}
              className={cn(
                'relative min-h-[96px] cursor-pointer select-none rounded-md border p-1 transition-all',
                !isCurrentMonth && 'cursor-default opacity-30',
                isNonWorkingDay && 'cursor-default bg-muted/50',
                isCurrentMonth && !isNonWorkingDay && 'hover:bg-accent',
                isSelected && 'border-primary bg-primary/20',
                isToday && !isSelected && 'ring-1 ring-slate-300',
                isToday && isSelected && 'ring-2 ring-primary',
                hasActivities && !isSelected && 'bg-green-50 dark:bg-green-950/30',
                exceedsDailyLimit && 'border-amber-500 bg-amber-50 text-amber-950 dark:bg-amber-950/30',
              )}
            >
              <div className="flex h-full flex-col">
                <span
                  className={cn(
                    'text-sm font-medium',
                    !isCurrentMonth && 'text-muted-foreground',
                    isNonWorkingDay && 'text-muted-foreground',
                    isToday && 'font-bold text-primary',
                  )}
                >
                  {date.getDate()}
                </span>
                {isCurrentMonth && nonWorkingInfo.badgeLabels.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {nonWorkingInfo.badgeLabels.map((label) => (
                      <span key={label} className="rounded border bg-background/70 px-1 text-[9px] leading-4 text-muted-foreground">
                        {label}
                      </span>
                    ))}
                  </div>
                )}
                {isCurrentMonth && nonWorkingInfo.holidayNames.length > 0 && (
                  <div className="mt-1 space-y-0.5 text-[9px] leading-tight text-muted-foreground">
                    {nonWorkingInfo.holidayNames.map((name) => (
                      <div key={name}>{name}</div>
                    ))}
                  </div>
                )}
                {isSelected && isCurrentMonth ? (
                  <div className="mt-auto space-y-0.5">
                    <span
                      className={cn(
                        'flex items-center gap-1 text-xs font-semibold text-primary',
                        exceedsDailyLimit && 'text-amber-700',
                      )}
                    >
                      {exceedsDailyLimit && <AlertTriangle className="h-3 w-3" />}
                      selectata
                    </span>
                    {exceedsDailyLimit && (
                      <span className="block text-[10px] leading-tight text-amber-700">
                        Total {projectedDailyHours}h
                      </span>
                    )}
                  </div>
                ) : (
                  hasActivities &&
                  isCurrentMonth && (
                    <div className="mt-auto">
                      <span
                        className={cn(
                          'text-xs font-medium text-green-600 dark:text-green-400',
                          exceedsDailyLimit && 'text-amber-700 dark:text-amber-400',
                        )}
                      >
                        {totalHours}h
                      </span>
                    </div>
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 space-y-2">
        <div
          className={cn(
            'flex items-center gap-2 rounded-md p-2 text-xs',
            remainingHours > 0
              ? 'bg-blue-50 text-blue-800'
              : remainingHours < 0
                ? 'bg-amber-50 text-amber-800'
                : 'bg-green-50 text-green-800',
          )}
        >
          {remainingHours === 0 && <Check className="h-4 w-4" />}
          {remainingHours < 0 && <AlertTriangle className="h-4 w-4" />}
          <span>
            {workingInfo.totalHours}h / {workingInfo.maxHoursWithNorma}h
            {remainingHours > 0 && ` - ${remainingHours}h ramase`}
            {remainingHours < 0 && ` - depasire ${Math.abs(remainingHours)}h`}
          </span>
        </div>

        {selectedDates.length > 0 && (
          <div className="space-y-3 rounded-md bg-primary/10 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-foreground">
                {selectedDates.length} {selectedDates.length === 1 ? 'zi selectata' : 'zile selectate'}
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => syncSelectedDates([])}
              >
                Sterge selectia
              </Button>
            </div>

            {selectedDates.length > 1 && (
              <div className="flex items-center gap-2">
                <span className="flex-1 text-xs text-muted-foreground">Aplica la toate:</span>
                <input
                  type="number"
                  min={1}
                  max={cimDailyHoursLimit}
                  value={defaultHours}
                  onChange={(event) => applyHoursToAll(event.target.value)}
                  disabled={cimDailyHoursLimit <= 0}
                  className="h-8 w-16 rounded-md border border-input bg-background px-2 text-center text-xs"
                />
                <span className="text-xs text-muted-foreground">h</span>
              </div>
            )}

            <div className="max-h-44 space-y-1 overflow-y-auto pr-1">
              {sortedSelectedDates.map((date) => {
                const existingHours = (activityMap[date] || []).reduce((sum, activity) => sum + activity.hours, 0);
                const selectedValue = Number(normalizeHoursForDate(date, selectedHours[date])) || 0;
                const projectedHours = existingHours + selectedValue;
                const isOverDailyLimit = projectedHours > cimDailyHoursLimit;

                return (
                  <div
                    key={date}
                    className={cn(
                      'flex items-center gap-2 rounded-md bg-background/80 px-2 py-1.5',
                      isOverDailyLimit && 'border border-amber-300 bg-amber-50 text-amber-900',
                    )}
                  >
                    <span className="flex-1 text-xs font-medium">
                      {new Date(`${date}T00:00:00`).toLocaleDateString('ro-RO', {
                        weekday: 'short',
                        day: '2-digit',
                        month: '2-digit',
                      })}
                      {isOverDailyLimit && (
                        <span className="block text-[10px] leading-tight text-amber-700">
                          Total {projectedHours}h
                        </span>
                      )}
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={cimDailyHoursLimit}
                      step={1}
                      value={normalizeHoursForDate(date, selectedHours[date])}
                      onChange={(event) => updateSelectedHour(date, event.target.value)}
                      disabled={cimDailyHoursLimit <= 0}
                      className="h-8 w-16 rounded-md border border-input bg-background px-2 text-center text-xs"
                    />
                    <span className="text-xs text-muted-foreground">h</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground"
                      onClick={() => syncSelectedDates(selectedDates.filter((selectedDate) => selectedDate !== date))}
                    >
                      x
                    </Button>
                  </div>
                );
              })}
            </div>

            <p
              className={cn(
                'text-xs',
                projectedRemainingHours < 0 ? 'font-medium text-amber-700' : 'text-muted-foreground',
              )}
            >
              Total selectie: {selectedTotalHours}h. Dupa selectie: {projectedTotalHours}h /{' '}
              {workingInfo.maxHoursWithNorma}h
              {projectedRemainingHours >= 0
                ? ` - ${projectedRemainingHours}h ramase`
                : ` - depasire ${Math.abs(projectedRemainingHours)}h`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
