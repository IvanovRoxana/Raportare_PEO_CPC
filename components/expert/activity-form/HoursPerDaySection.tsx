'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Field, FieldLabel } from '@/components/ui/field';
import { formatDateRo } from '@/lib/app-utils';
import { normalizePontajHoursValue } from '@/lib/pontaj-rules';

interface HoursPerDaySectionProps {
  selectedDates: string[];
  dayType: 'lucratoare' | 'CO' | 'CM';
  onDayTypeChange: (value: 'lucratoare' | 'CO' | 'CM') => void;
  hoursPerDay: Record<string, string>;
  defaultHours: number;
  expertNorma: number;
  hourOptions: number[];
  onHoursChange: (date: string, value: string) => void;
}

export function HoursPerDaySection({
  selectedDates,
  dayType,
  onDayTypeChange,
  hoursPerDay,
  defaultHours,
  expertNorma,
  hourOptions,
  onHoursChange,
}: HoursPerDaySectionProps) {
  const isLeave = dayType === 'CO' || dayType === 'CM';
  const sortedDates = [...selectedDates].sort();

  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <Field>
          <FieldLabel htmlFor="dayType">Tip zi</FieldLabel>
          <Select value={dayType} onValueChange={(value: string) => onDayTypeChange(value as 'lucratoare' | 'CO' | 'CM')}>
            <SelectTrigger id="dayType">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="lucratoare">Lucratoare</SelectItem>
              <SelectItem value="CO">CO - Concediu odihna</SelectItem>
              <SelectItem value="CM">CM - Concediu medical</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        {!isLeave && selectedDates.length === 1 && (
          <Field>
            <FieldLabel htmlFor="hours">Ore lucrate (max 8h/zi, norma {expertNorma}h)</FieldLabel>
            <Select
              value={hoursPerDay[selectedDates[0]] || defaultHours.toString()}
              onValueChange={(value: string) => onHoursChange(selectedDates[0], value)}
            >
              <SelectTrigger id="hours">
                <SelectValue placeholder="Selecteaza orele" />
              </SelectTrigger>
              <SelectContent>
                {hourOptions.map((hours) => (
                  <SelectItem key={hours} value={hours.toString()}>
                    {hours} {hours === 1 ? 'ora' : 'ore'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
      </div>

      {!isLeave && selectedDates.length > 1 && (
        <div className="space-y-3">
          <FieldLabel>Ore pentru fiecare zi (max 8h/zi, norma {expertNorma}h)</FieldLabel>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {sortedDates.map((date) => (
              <div key={date} className="flex items-center gap-2 rounded-md bg-muted/50 p-2">
                <span className="min-w-[70px] text-xs font-medium">{formatDateRo(date)}</span>
                <Select
                  value={hoursPerDay[date] || defaultHours.toString()}
                  onValueChange={(value: string) => onHoursChange(date, value)}
                >
                  <SelectTrigger className="h-8 w-[70px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {hourOptions.map((hours) => (
                      <SelectItem key={hours} value={hours.toString()}>
                        {hours}h
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Total: {selectedDates.reduce((sum, date) => sum + Number(normalizePontajHoursValue(hoursPerDay[date], defaultHours)), 0)}h pentru {selectedDates.length} zile
          </p>
        </div>
      )}
    </>
  );
}
