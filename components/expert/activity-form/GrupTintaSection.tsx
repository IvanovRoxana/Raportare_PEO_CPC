'use client';

import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { GrupTintaEntry } from '@/lib/types';

interface GrupTintaSectionProps {
  entries: GrupTintaEntry[];
  onAddEntry: () => void;
  onUpdateEntry: (id: string, field: keyof GrupTintaEntry, value: string | number | string[]) => void;
  onRemoveEntry: (id: string) => void;
}

export function GrupTintaSection({ entries, onAddEntry, onUpdateEntry, onRemoveEntry }: GrupTintaSectionProps) {
  return (
    <div className="space-y-3 rounded-lg border border-teal-200 bg-teal-50 p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-teal-800">Grup Tinta</div>
        <Button type="button" variant="outline" size="sm" onClick={onAddEntry} className="border-teal-300 text-teal-700">
          <Plus className="mr-1 h-4 w-4" />
          Adauga intrare GT
        </Button>
      </div>

      {entries.length > 0 && (
        <div className="space-y-3">
          {entries.map((entry) => (
            <div key={entry.id} className="flex items-center gap-2 rounded-md border border-teal-200 bg-white p-2">
              <Input
                placeholder="Organizatii"
                value={entry.organizations?.join(', ') || ''}
                onChange={(event) => onUpdateEntry(entry.id, 'organizations', event.target.value.split(',').map((item) => item.trim()).filter(Boolean))}
                className="flex-1"
              />
              <Input
                placeholder="Nr. participanti"
                type="number"
                value={entry.participantsCount || ''}
                onChange={(event) => onUpdateEntry(entry.id, 'participantsCount', parseInt(event.target.value, 10) || 0)}
                className="w-28"
              />
              <Button type="button" variant="ghost" size="icon" onClick={() => onRemoveEntry(entry.id)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
