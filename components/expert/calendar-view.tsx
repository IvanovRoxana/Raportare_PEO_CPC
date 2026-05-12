'use client';

import { useState, useMemo } from 'react';
import { Plus, X, Edit2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getWorkingDaysInMonth, getRomanianHolidays, getWorkingHoursInfo } from '@/lib/working-hours';
import type { Activity, Expert } from '@/lib/types';

interface CalendarViewProps {
  expert: Expert;
  activities: Activity[];
  month: number;
  year: number;
  onAddForDay: (date: string) => void;
  onEditActivity: (activity: Activity) => void;
  onDeleteActivity: (activityId: string) => void;
  readOnly?: boolean;
}

const DAY_NAMES = ['Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sa', 'Du'];

// Status colors
const STATUS_COLORS = {
  ok: { bg: 'bg-green-100', border: 'border-green-400', text: 'text-green-800' },
  issue: { bg: 'bg-red-100', border: 'border-red-300', text: 'text-red-800' },
  exceeds: { bg: 'bg-amber-100', border: 'border-amber-400', text: 'text-amber-800' },
  empty_past: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-600' },
  empty: { bg: 'bg-white', border: 'border-muted', text: 'text-muted-foreground' },
  nonworking: { bg: 'bg-muted/50', border: 'border-muted', text: 'text-muted-foreground' },
  co: { bg: 'bg-blue-100', border: 'border-blue-300', text: 'text-blue-800' },
  cm: { bg: 'bg-purple-100', border: 'border-purple-300', text: 'text-purple-800' },
};

export function CalendarView({
  expert,
  activities,
  month,
  year,
  onAddForDay,
  onEditActivity,
  onDeleteActivity,
  readOnly = false,
}: CalendarViewProps) {
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const holidays = useMemo(() => getRomanianHolidays(year), [year]);
  const hoursInfo = useMemo(() => getWorkingHoursInfo(month, year, expert.norma || 8, activities), [month, year, expert.norma, activities]);
  
  // Group activities by date
  const activitiesByDay = useMemo(() => {
    const map: Record<string, Activity[]> = {};
    activities.forEach(a => {
      if (!map[a.date]) map[a.date] = [];
      map[a.date].push(a);
    });
    return map;
  }, [activities]);

  // Build calendar cells
  const cells = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startDow = (firstDay.getDay() + 6) % 7; // Monday = 0
    
    const result: (null | {
      day: number;
      dateStr: string;
      isNonWorking: boolean;
      isHoliday: boolean;
      isWeekend: boolean;
      isPast: boolean;
      isToday: boolean;
      dayActivities: Activity[];
      totalHours: number;
      hasLeave: boolean;
      leaveType: string | null;
      hasMissing: boolean;
      exceeds: boolean;
      status: keyof typeof STATUS_COLORS;
    })[] = Array(startDow).fill(null);
    
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      date.setHours(0, 0, 0, 0);
      const dow = date.getDay();
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      
      const isWeekend = dow === 0 || dow === 6;
      const isHoliday = holidays.includes(dateStr);
      const isNonWorking = isWeekend || isHoliday;
      const isPast = date < today;
      const isToday = date.getTime() === today.getTime();
      
      const dayActivities = activitiesByDay[dateStr] || [];
      const totalHours = dayActivities.reduce((sum, a) => sum + (a.hours || 0), 0);
      const hasLeave = dayActivities.some(a => a.dayType === 'CO' || a.dayType === 'CM');
      const leaveType = hasLeave ? (dayActivities.find(a => a.dayType === 'CO') ? 'CO' : 'CM') : null;
      const hasMissing = dayActivities.some(a => !a.description && a.dayType !== 'CO' && a.dayType !== 'CM');
      const exceeds = totalHours > 8 && !hasLeave;
      
      let status: keyof typeof STATUS_COLORS = 'empty';
      if (isNonWorking) status = 'nonworking';
      else if (hasLeave) status = leaveType === 'CO' ? 'co' : 'cm';
      else if (exceeds) status = 'exceeds';
      else if (hasMissing) status = 'issue';
      else if (dayActivities.length > 0) status = 'ok';
      else if (isPast) status = 'empty_past';
      
      result.push({
        day: d,
        dateStr,
        isNonWorking,
        isHoliday,
        isWeekend,
        isPast,
        isToday,
        dayActivities,
        totalHours,
        hasLeave,
        leaveType,
        hasMissing,
        exceeds,
        status,
      });
    }
    
    return result;
  }, [year, month, holidays, today, activitiesByDay]);

  // Calculate stats
  const stats = useMemo(() => {
    const workingCells = cells.filter(c => c && !c.isNonWorking) as NonNullable<typeof cells[0]>[];
    return {
      emptyPast: workingCells.filter(c => c.status === 'empty_past').length,
      issueDays: workingCells.filter(c => c.status === 'issue').length,
      exceedsDays: workingCells.filter(c => c.status === 'exceeds').length,
      remaining: hoursInfo.remaining,
      maxHours: hoursInfo.maxHours,
      totalHours: hoursInfo.totalHours,
    };
  }, [cells, hoursInfo]);

  const selectedDayActivities = selectedDay ? (activitiesByDay[selectedDay] || []) : [];

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ro-RO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  };

  return (
    <div className="space-y-4">
      {/* Hours Info - Always visible */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="bg-blue-50 border-blue-300 text-blue-700 text-sm px-3 py-1">
          {stats.remaining > 0 ? (
            <span>&#8505; {stats.remaining}h ramase pana la norma lunara de {stats.maxHours}h</span>
          ) : stats.remaining === 0 ? (
            <span>&#10003; Norma lunara de {stats.maxHours}h completata ({stats.totalHours}h pontate)</span>
          ) : (
            <span>&#9888; Norma lunara depasita cu {Math.abs(stats.remaining)}h ({stats.totalHours}h / {stats.maxHours}h)</span>
          )}
        </Badge>
      </div>

      {/* Warnings */}
      {(stats.emptyPast > 0 || stats.issueDays > 0 || stats.exceedsDays > 0) && (
        <div className="flex flex-wrap gap-2">
          {stats.emptyPast > 0 && (
            <Badge variant="outline" className="bg-red-50 border-red-300 text-red-700">
              {stats.emptyPast} zile lucratoare necompletate
            </Badge>
          )}
          {stats.issueDays > 0 && (
            <Badge variant="outline" className="bg-red-100 border-red-300 text-red-700">
              {stats.issueDays} zile cu descriere lipsa
            </Badge>
          )}
          {stats.exceedsDays > 0 && (
            <Badge variant="outline" className="bg-amber-100 border-amber-400 text-amber-700">
              {stats.exceedsDays} zile cu peste 8h pontate
            </Badge>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="font-medium">Legenda:</span>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-green-100 border border-green-400" />
          <span>Complet</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-red-100 border border-red-300" />
          <span>Descriere lipsa</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-amber-100 border border-amber-400" />
          <span>Ore depasita</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-red-50 border border-red-200" />
          <span>Necompletat</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-blue-100 border border-blue-300" />
          <span>CO</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-muted/50 border border-muted" />
          <span>Nelucratoare</span>
        </div>
      </div>

      {/* Calendar Grid */}
      <Card>
        <CardContent className="p-2">
          {/* Day headers */}
          <div className="grid grid-cols-7 border-b">
            {DAY_NAMES.map((name, i) => (
              <div
                key={name}
                className={`p-2 text-center text-xs font-medium ${
                  i >= 5 ? 'text-red-600' : 'text-muted-foreground'
                }`}
              >
                {name}
              </div>
            ))}
          </div>

          {/* Calendar cells */}
          <div className="grid grid-cols-7 gap-1 p-1">
            {cells.map((cell, i) => {
              if (!cell) return <div key={`empty-${i}`} />;
              
              const colors = STATUS_COLORS[cell.status];
              const isSelected = selectedDay === cell.dateStr;
              
              return (
                <div
                  key={cell.dateStr}
                  onClick={() => !cell.isNonWorking && setSelectedDay(isSelected ? null : cell.dateStr)}
                  className={`
                    p-1.5 min-h-[70px] rounded-lg border transition-all
                    ${colors.bg} ${colors.border} ${colors.text}
                    ${isSelected ? 'ring-2 ring-primary ring-offset-1' : ''}
                    ${cell.isNonWorking ? 'cursor-default opacity-60' : 'cursor-pointer hover:ring-1 hover:ring-primary/50'}
                  `}
                >
                  <div className="flex justify-between items-start mb-0.5">
                    <span className={`text-sm ${cell.isToday ? 'font-bold' : 'font-medium'}`}>
                      {cell.day}
                    </span>
                    {cell.isToday && (
                      <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-primary text-primary-foreground">
                        azi
                      </span>
                    )}
                    {cell.isHoliday && !cell.isWeekend && (
                      <span className="text-[9px] opacity-65">SL</span>
                    )}
                  </div>
                  
                  {cell.hasLeave && (
                    <div className="text-base font-bold">{cell.leaveType}</div>
                  )}
                  
                  {!cell.isNonWorking && !cell.hasLeave && cell.totalHours > 0 && (
                    <div className="text-xl font-bold leading-tight">{cell.totalHours}h</div>
                  )}
                  
                  {!cell.isNonWorking && !cell.hasLeave && cell.totalHours === 0 && cell.isPast && (
                    <div className="text-sm opacity-50">—</div>
                  )}
                  
                  {cell.hasMissing && (
                    <div className="text-[9px] font-semibold mt-0.5">descr. lipsa</div>
                  )}
                  
                  {cell.exceeds && (
                    <div className="text-[9px] font-semibold mt-0.5">peste 8h!</div>
                  )}
                  
                  {cell.dayActivities.length > 0 && !cell.hasLeave && (
                    <div className="text-[9px] opacity-60 mt-auto">
                      {cell.dayActivities.length} activ.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Selected Day Details */}
      {selectedDay && (
        <Card>
          <CardHeader className="py-3 px-4 border-b bg-muted/30">
            <div className="flex justify-between items-center">
              <CardTitle className="text-sm font-medium">
                {formatDate(selectedDay)}
              </CardTitle>
              <div className="flex gap-2">
                {!readOnly && (
                  <Button size="sm" onClick={() => onAddForDay(selectedDay)}>
                    <Plus className="h-4 w-4 mr-1" />
                    Adauga
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => setSelectedDay(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-3">
            {selectedDayActivities.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-4">
                {readOnly
                  ? 'Nicio activitate pontata pentru aceasta zi.'
                  : 'Nicio activitate — apasa + pentru a adauga.'}
              </p>
            ) : (
              <div className="space-y-2">
                {selectedDayActivities.map(activity => (
                  <div
                    key={activity.id}
                    className="flex items-center gap-3 p-3 rounded-lg border bg-card"
                  >
                    <div className="text-xl font-bold min-w-[40px]">
                      {activity.hours}h
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" className="text-xs">
                          {activity.saCode || 'SA'}
                        </Badge>
                        <span className="text-sm font-medium truncate">
                          {activity.activityName || activity.description?.slice(0, 50) || 'Activitate'}
                        </span>
                      </div>
                      {activity.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                          {activity.description}
                        </p>
                      )}
                    </div>
                    {!readOnly && (
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onEditActivity(activity)}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => onDeleteActivity(activity.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
