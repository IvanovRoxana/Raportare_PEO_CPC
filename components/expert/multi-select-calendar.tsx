'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatDate, getMonthName } from '@/lib/app-utils';
import { getWorkingHoursInfo } from '@/lib/working-hours';
import type { Activity } from '@/lib/types';

interface MultiSelectCalendarProps {
  selectedDates: string[];
  onSelectDates: (dates: string[]) => void;
  selectedHours?: Record<string, string>;
  onSelectedHoursChange?: (hours: Record<string, string>) => void;
  activities: Activity[];
  onMonthChange?: (month: number, year: number) => void;
  expertNorma?: number;
}

export function MultiSelectCalendar({
  selectedDates,
  onSelectDates,
  selectedHours = {},
  onSelectedHoursChange,
  activities,
  onMonthChange,
  expertNorma = 8,
}: MultiSelectCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<string | null>(null);
  const [defaultHours, setDefaultHours] = useState(Math.min(expertNorma, 8));

  const month = currentDate.getMonth();
  const year = currentDate.getFullYear();
  const sortedSelectedDates = useMemo(() => [...selectedDates].sort(), [selectedDates]);

  const workingInfo = useMemo(
    () => getWorkingHoursInfo(month, year, expertNorma, activities),
    [month, year, expertNorma, activities],
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
    const nextHours: Record<string, string> = {};

    uniqueDates.forEach((date) => {
      nextHours[date] = baseHours[date] || defaultHours.toString();
    });

    onSelectedHoursChange?.(nextHours);
    onSelectDates(uniqueDates);
  };

  const updateSelectedHour = (date: string, value: string | number) => {
    const numericValue = Math.min(8, Math.max(0, Number(value) || 0));
    onSelectedHoursChange?.({
      ...selectedHours,
      [date]: numericValue.toString(),
    });
  };

  const applyHoursToAll = (value: string | number) => {
    const numericValue = Math.min(8, Math.max(1, Number(value) || 1));
    setDefaultHours(numericValue);
    onSelectedHoursChange?.(
      Object.fromEntries(sortedSelectedDates.map((date) => [date, numericValue.toString()])),
    );
  };

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

  const isWeekend = (date: Date) => {
    const day = date.getDay();
    return day === 0 || day === 6;
  };

  const handleDateClick = (date: Date, isCurrentMonth: boolean) => {
    if (!isCurrentMonth || isWeekend(date)) return;

    const dateStr = formatDate(date);
    if (selectedDates.includes(dateStr)) {
      syncSelectedDates(selectedDates.filter((selectedDate) => selectedDate !== dateStr));
    } else {
      syncSelectedDates([...selectedDates, dateStr]);
    }
  };

  const handleMouseDown = (date: Date, isCurrentMonth: boolean) => {
    if (!isCurrentMonth || isWeekend(date)) return;
    setIsSelecting(true);
    setSelectionStart(formatDate(date));
  };

  const handleMouseUp = () => {
    setIsSelecting(false);
    setSelectionStart(null);
  };

  const handleMouseEnter = (date: Date, isCurrentMonth: boolean) => {
    if (!isSelecting || !selectionStart || !isCurrentMonth || isWeekend(date)) return;

    const startDate = new Date(`${selectionStart}T00:00:00`);
    const endDate = date;
    const [start, end] = startDate <= endDate ? [startDate, endDate] : [endDate, startDate];
    const newDates: string[] = [];
    const current = new Date(start);

    while (current <= end) {
      if (!isWeekend(current)) {
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

  return (
    <div
      className="rounded-lg border border-border bg-card p-4"
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div className="mb-4 flex items-center justify-between">
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
          const isWeekendDay = isWeekend(date);
          const hasActivities = getDateActivities(date).length > 0;
          const totalHours = getTotalHours(date);
          const isToday = formatDate(new Date()) === dateStr;
          const selectedHour = selectedHours[dateStr] || defaultHours.toString();

          return (
            <div
              key={index}
              onClick={() => handleDateClick(date, isCurrentMonth)}
              onMouseDown={() => handleMouseDown(date, isCurrentMonth)}
              onMouseEnter={() => handleMouseEnter(date, isCurrentMonth)}
              className={cn(
                'relative min-h-[60px] cursor-pointer select-none rounded-md border p-1 transition-all',
                !isCurrentMonth && 'cursor-default opacity-30',
                isWeekendDay && 'cursor-default bg-muted/50',
                isCurrentMonth && !isWeekendDay && 'hover:bg-accent',
                isSelected && 'border-primary bg-primary/20',
                isToday && 'ring-2 ring-primary',
                hasActivities && !isSelected && 'bg-green-50 dark:bg-green-950/30',
              )}
            >
              <div className="flex h-full flex-col">
                <span
                  className={cn(
                    'text-sm font-medium',
                    !isCurrentMonth && 'text-muted-foreground',
                    isWeekendDay && 'text-muted-foreground',
                    isToday && 'font-bold text-primary',
                  )}
                >
                  {date.getDate()}
                </span>
                {isSelected && isCurrentMonth ? (
                  <div className="mt-auto">
                    <span className="text-xs font-semibold text-primary">{selectedHour}h</span>
                  </div>
                ) : (
                  hasActivities &&
                  isCurrentMonth && (
                    <div className="mt-auto">
                      <span className="text-xs font-medium text-green-600 dark:text-green-400">
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
                  max={8}
                  value={defaultHours}
                  onChange={(event) => applyHoursToAll(event.target.value)}
                  className="h-8 w-16 rounded-md border border-input bg-background px-2 text-center text-xs"
                />
                <span className="text-xs text-muted-foreground">h</span>
              </div>
            )}

            <div className="max-h-44 space-y-1 overflow-y-auto pr-1">
              {sortedSelectedDates.map((date) => (
                <div key={date} className="flex items-center gap-2 rounded-md bg-background/80 px-2 py-1.5">
                  <span className="flex-1 text-xs font-medium text-foreground">
                    {new Date(`${date}T00:00:00`).toLocaleDateString('ro-RO', {
                      weekday: 'short',
                      day: '2-digit',
                      month: '2-digit',
                    })}
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={8}
                    step={0.5}
                    value={selectedHours[date] || defaultHours.toString()}
                    onChange={(event) => updateSelectedHour(date, event.target.value)}
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
              ))}
            </div>

            <p className="text-xs text-muted-foreground">
              Total selectie:{' '}
              {sortedSelectedDates.reduce(
                (sum, date) => sum + Number(selectedHours[date] || defaultHours),
                0,
              )}
              h
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
