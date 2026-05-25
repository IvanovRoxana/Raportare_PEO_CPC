'use client';

import { CheckCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Field, FieldLabel } from '@/components/ui/field';
import type { ActivityCatalog, Expert } from '@/lib/types';

interface ActivityBasicFieldsProps {
  isGdprExpert: boolean;
  role?: string;
  saCode: string;
  onSaCodeChange: (value: string) => void;
  availableSaCodes: string[];
  catalogLoading: boolean;
  catalogCount: number;
  location: string;
  onLocationChange: (value: string) => void;
  activityTitle: string;
  onActivityTitleChange: (value: string) => void;
  availableActivities: string[];
  selectedCatalogItem: ActivityCatalog | null;
  apiKey: string | null;
  isVerifyingTitle: boolean;
  titleVerificationResult: string | null;
  onVerifyTitle: () => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  activityCommon: boolean;
  isException: boolean;
  needsCommonDesc: boolean;
  isEvent: boolean;
  eventDuration: string;
  onEventDurationChange: (value: string) => void;
  totalHours: number;
  eventDur: number;
  needsExtendedDesc: boolean;
  eventExtendedDesc: string;
  onEventExtendedDescChange: (value: string) => void;
  selectedGdprSaCode?: string;
  expert?: Expert;
}

export function ActivityBasicFields({
  isGdprExpert,
  role,
  saCode,
  onSaCodeChange,
  availableSaCodes,
  catalogLoading,
  catalogCount,
  location,
  onLocationChange,
  activityTitle,
  onActivityTitleChange,
  availableActivities,
  selectedCatalogItem,
  apiKey,
  isVerifyingTitle,
  titleVerificationResult,
  onVerifyTitle,
  description,
  onDescriptionChange,
  activityCommon,
  isException,
  needsCommonDesc,
  isEvent,
  eventDuration,
  onEventDurationChange,
  totalHours,
  eventDur,
  needsExtendedDesc,
  eventExtendedDesc,
  onEventExtendedDescChange,
  selectedGdprSaCode,
}: ActivityBasicFieldsProps) {
  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <Field>
          <FieldLabel htmlFor="saCode">Subactivitate (Rol: {role})</FieldLabel>
          {isGdprExpert ? (
            <Input id="saCode" value={saCode || selectedGdprSaCode || 'SA1.1'} disabled />
          ) : (
            <Select value={saCode} onValueChange={onSaCodeChange} disabled={catalogLoading && catalogCount === 0}>
              <SelectTrigger id="saCode">
                <SelectValue placeholder={catalogLoading && catalogCount === 0 ? 'Se incarca...' : 'Selecteaza SA'} />
              </SelectTrigger>
              <SelectContent>
                {availableSaCodes.length === 0 ? (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">Nicio subactivitate disponibila</div>
                ) : (
                  availableSaCodes.map((sa) => (
                    <SelectItem key={sa} value={sa}>{sa}</SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          )}
          {availableSaCodes.length === 0 && !catalogLoading && (
            <p className="mt-1 text-xs text-amber-600">Nu exista subactivitati alocate pentru rolul tau. Contacteaza PM.</p>
          )}
        </Field>

        <Field>
          <FieldLabel htmlFor="location">Locatie</FieldLabel>
          <Select value={location} onValueChange={onLocationChange}>
            <SelectTrigger id="location">
              <SelectValue placeholder="Selecteaza locatia" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Birou">Birou</SelectItem>
              <SelectItem value="Teren">Teren</SelectItem>
              <SelectItem value="Online">Online</SelectItem>
              <SelectItem value="Sediu CPC">Sediu CPC</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>

      {!isGdprExpert && (
        <Field>
          <div className="flex items-center justify-between">
            <FieldLabel htmlFor="activity">Activitate</FieldLabel>
            {apiKey && activityTitle && (
              <Button type="button" variant="outline" size="sm" onClick={onVerifyTitle} disabled={isVerifyingTitle}>
                {isVerifyingTitle ? (
                  <>
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    Verificare...
                  </>
                ) : 'Verifica cu AI'}
              </Button>
            )}
          </div>
          <Select value={activityTitle} onValueChange={onActivityTitleChange} disabled={!saCode || availableActivities.length === 0}>
            <SelectTrigger id="activity">
              <SelectValue placeholder={!saCode ? 'Selecteaza SA mai intai' : '-- Selecteaza activitatea --'} />
            </SelectTrigger>
            <SelectContent>
              {availableActivities.length === 0 ? (
                <div className="px-2 py-1.5 text-sm text-muted-foreground">Nicio activitate pentru acest SA</div>
              ) : (
                availableActivities.map((activity) => (
                  <SelectItem key={activity} value={activity}>{activity}</SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          {selectedCatalogItem && (
            <p className="mt-1 text-xs text-muted-foreground">
              {selectedCatalogItem.serviceCategory} - {selectedCatalogItem.description}
            </p>
          )}
          {titleVerificationResult && (
            <p className="mt-1 rounded bg-muted p-2 text-sm text-muted-foreground">{titleVerificationResult}</p>
          )}
        </Field>
      )}

      <Field>
        <FieldLabel htmlFor="description">
          {isException
            ? 'Descriere (obligatorie - min 15 caractere)'
            : activityCommon
              ? 'Descriere contributie individuala (obligatorie - min 30 caractere)'
              : 'Descriere activitate'}
        </FieldLabel>
        <Textarea
          id="description"
          value={description}
          onChange={(event) => onDescriptionChange(event.target.value)}
          placeholder={activityCommon
            ? 'Descrie specific ce ai realizat tu in aceasta activitate comuna (persoana I, contributie specifica)...'
            : 'Ce anume ai realizat...'}
          rows={4}
          className={needsCommonDesc ? 'border-amber-500' : ''}
        />
        {isException && description.length < 15 && (
          <div className="mt-1 text-xs text-amber-700">{description.length}/15 caractere</div>
        )}
        {needsCommonDesc && (
          <div className="mt-1 rounded bg-amber-50 p-2 text-xs text-amber-700">
            Activitate comuna - descriere obligatorie min. 30 caractere ({description.trim().length}/30). Specifica contributia ta individuala.
          </div>
        )}
      </Field>

      {isEvent && (
        <Field>
          <FieldLabel>Durata evenimentului (ore) - optional</FieldLabel>
          <div className="flex items-center gap-4">
            <Input
              type="number"
              min="0.5"
              max="8"
              step="0.5"
              value={eventDuration}
              onChange={(event) => onEventDurationChange(event.target.value)}
              placeholder="ex: 2"
              className="w-24"
            />
            {eventDur > 0 && totalHours > eventDur && (
              <span className="text-xs text-amber-700">
                Ai pontat {totalHours}h dar evenimentul a durat {eventDur}h - explica orele suplimentare
              </span>
            )}
            {eventDur > 0 && totalHours <= eventDur && (
              <span className="flex items-center gap-1 text-xs text-green-700">
                <CheckCircle className="h-3 w-3" />
                Ore pontate ({totalHours}h) = durata evenimentului ({eventDur}h)
              </span>
            )}
          </div>
          {needsExtendedDesc && (
            <div className="mt-2">
              <FieldLabel className="text-xs text-amber-700">Activitati conexe evenimentului - obligatoriu</FieldLabel>
              <div className="mb-2 text-xs text-amber-600">
                Ai pontat mai multe ore decat durata evenimentului. Descrie ce ai realizat in orele suplimentare.
              </div>
              <Textarea
                value={eventExtendedDesc}
                onChange={(event) => onEventExtendedDescChange(event.target.value)}
                rows={3}
                placeholder="Ex: 1h pregatire materiale de prezentare inainte de eveniment, 1h redactare minuta si sinteza concluzii dupa eveniment..."
                className="border-amber-500"
              />
            </div>
          )}
        </Field>
      )}
    </>
  );
}
