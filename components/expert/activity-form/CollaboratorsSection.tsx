'use client';

import { Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import type { DeliverableSlot } from '@/lib/deliverable-types';
import type { Expert } from '@/lib/types';

interface CollaboratorsSectionProps {
  activityCommon: boolean;
  onActivityCommonChange: (checked: boolean) => void;
  collaborators: string[];
  allExperts: Expert[];
  expertId: string;
  collaboratorSuggestions: Array<{ expert: Expert; reason: string }>;
  onCollaboratorChecked: (id: string, checked: boolean) => void;
  onAddAllSuggestedCollaborators: () => void;
  mainDeliverables: DeliverableSlot[];
  onUpdateDeliverable: (id: string, patch: Partial<DeliverableSlot>) => void;
}

export function CollaboratorsSection({
  activityCommon,
  onActivityCommonChange,
  collaborators,
  allExperts,
  expertId,
  collaboratorSuggestions,
  onCollaboratorChecked,
  onAddAllSuggestedCollaborators,
  mainDeliverables,
  onUpdateDeliverable,
}: CollaboratorsSectionProps) {
  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-blue-800">
        <Users className="h-4 w-4" />
        Colaborare
      </div>

      <div className="space-y-3">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="activityCommon"
            checked={activityCommon}
            onCheckedChange={(checked: boolean | 'indeterminate') => onActivityCommonChange(checked === true)}
          />
          <label htmlFor="activityCommon" className="cursor-pointer text-sm text-blue-800">
            Activitate desfasurata in comun cu alti experti
          </label>
        </div>

        {activityCommon && (
          <div className="space-y-3">
            {collaboratorSuggestions.length > 0 && (
              <div className="rounded-md border border-blue-200 bg-white/70 p-3">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs text-blue-700">Sugestii experti</Label>
                  {collaboratorSuggestions.some(({ expert }) => !collaborators.includes(expert.id)) && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={onAddAllSuggestedCollaborators}
                      className="h-7 border-blue-300 px-2 text-[10px] text-blue-800 hover:bg-blue-100"
                    >
                      Adauga toate
                    </Button>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {collaboratorSuggestions.map(({ expert, reason }) => {
                    const selected = collaborators.includes(expert.id);
                    return (
                      <button
                        key={expert.id}
                        type="button"
                        onClick={() => onCollaboratorChecked(expert.id, !selected)}
                        className={`rounded-md border px-3 py-1.5 text-left text-xs transition-colors ${
                          selected
                            ? 'border-blue-500 bg-blue-100 text-blue-900'
                            : 'border-blue-200 bg-white text-blue-800 hover:bg-blue-50'
                        }`}
                        title={reason}
                      >
                        <span className="font-medium">{expert.name}</span>
                        <span className="ml-1 text-blue-600">({reason})</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <Label className="text-xs text-blue-700">Experti implicati in aceasta activitate</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {allExperts.filter((expert) => expert.id !== expertId).map((expert) => (
                <label
                  key={expert.id}
                  className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-xs transition-colors ${
                    collaborators.includes(expert.id)
                      ? 'border-blue-400 bg-blue-100 text-blue-800'
                      : 'border-blue-200 bg-white text-blue-700'
                  }`}
                >
                  <Checkbox
                    checked={collaborators.includes(expert.id)}
                    onCheckedChange={(checked: boolean | 'indeterminate') => onCollaboratorChecked(expert.id, checked === true)}
                    className="h-3 w-3"
                  />
                  {expert.name}
                </label>
              ))}
            </div>
            {allExperts.filter((expert) => expert.id !== expertId).length === 0 && (
              <div className="text-xs text-blue-600">Nu exista alti experti disponibili pentru selectie.</div>
            )}
          </div>
        )}

        {mainDeliverables.length > 0 && activityCommon && (
          <div>
            <div className="mb-2 text-xs font-medium text-blue-700">Marcheaza livrabilele comune</div>
            <div className="mb-2 text-xs text-blue-600">Un singur expert il incarca, ceilalti confirma.</div>
            <div className="space-y-1">
              {mainDeliverables.map((deliverable) => (
                <label
                  key={deliverable.id}
                  className={`flex cursor-pointer items-center gap-2 rounded border px-3 py-2 text-xs ${
                    deliverable.common ? 'border-blue-400 bg-blue-100' : 'border-blue-200 bg-white/60'
                  }`}
                >
                  <Checkbox
                    checked={!!deliverable.common}
                    onCheckedChange={(checked: boolean | 'indeterminate') => onUpdateDeliverable(deliverable.id, { common: checked === true })}
                    className="h-3 w-3"
                  />
                  <span className="flex-1 truncate">{deliverable.declaredTitle || deliverable.name || deliverable.filename || 'Livrabil fara titlu'}</span>
                  {deliverable.common && <Badge variant="secondary" className="text-[10px]">comun</Badge>}
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
