'use client';

import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ActivitySavePanelProps {
  isLeave: boolean;
  isException: boolean;
  mainDeliverablesCount: number;
  validationError: string | null;
  saveBlockers: string[];
  isSaving: boolean;
  isEditing: boolean;
  onCancel: () => void;
  onSave: () => void;
}

export function ActivitySavePanel({
  isLeave,
  isException,
  mainDeliverablesCount,
  validationError,
  saveBlockers,
  isSaving,
  isEditing,
  onCancel,
  onSave,
}: ActivitySavePanelProps) {
  const isSaveDisabled = saveBlockers.length > 0;

  return (
    <>
      {!isLeave && !isException && mainDeliverablesCount === 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <span className="text-sm text-amber-800">Activitatea necesita cel putin un livrabil principal.</span>
        </div>
      )}

      {validationError && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{validationError}</span>
        </div>
      )}

      {isSaveDisabled && !isSaving && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-medium">Activitatea nu poate fi salvata inca:</div>
            <ul className="mt-1 list-disc pl-4">
              {saveBlockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Anuleaza
        </Button>
        <Button type="button" onClick={onSave} disabled={isSaveDisabled}>
          {isSaving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Se salveaza...
            </>
          ) : isEditing ? 'Salveaza modificarile' : 'Adauga activitate'}
        </Button>
      </div>
    </>
  );
}
