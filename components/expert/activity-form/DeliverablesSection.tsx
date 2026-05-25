'use client';

import { FileText, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EventDocsPanel } from '@/components/expert/event-docs-panel';
import { DeliverableItem } from '@/components/expert/deliverable-item';
import type { DeliverableSlot } from '@/lib/deliverable-types';
import type { ActivityCatalog, Expert } from '@/lib/types';

interface DeliverablesSectionProps {
  deliverables: DeliverableSlot[];
  mainDeliverables: DeliverableSlot[];
  prelimDeliverables: DeliverableSlot[];
  justifDeliverables: DeliverableSlot[];
  onAddSlot: (type: 'livrabil' | 'raport_preliminar' | 'justificativ') => void;
  onUpdateDeliverable: (id: string, patch: Partial<DeliverableSlot>) => void;
  onRemoveDeliverable: (id: string) => void;
  isEvent: boolean;
  saCode: string;
  activityTitle: string;
  selectedCatalogItem: ActivityCatalog | null;
  deliverableOptions: string[];
  apiKey: string | null;
  projectCode?: string;
  month: number;
  year: number;
  expertName: string;
  allExperts: Expert[];
  expertId: string;
  selectedDate: string;
  description: string;
  onUpsertEventSlot: (slotType: 'event_mom' | 'event_proof', name: string, patch: Partial<DeliverableSlot>) => void;
}

export function DeliverablesSection({
  deliverables,
  mainDeliverables,
  prelimDeliverables,
  justifDeliverables,
  onAddSlot,
  onUpdateDeliverable,
  onRemoveDeliverable,
  isEvent,
  saCode,
  activityTitle,
  selectedCatalogItem,
  deliverableOptions,
  apiKey,
  projectCode,
  month,
  year,
  expertName,
  allExperts,
  expertId,
  selectedDate,
  description,
  onUpsertEventSlot,
}: DeliverablesSectionProps) {
  const commonProps = {
    apiKey,
    subActivity: saCode,
    activityTitle,
    selectedActivityId: selectedCatalogItem?.id,
    catalogDescription: selectedCatalogItem?.description,
    catalogObjectives: selectedCatalogItem?.objectives,
    catalogComponent: selectedCatalogItem?.serviceComponent,
    catalogBeneficiaries: selectedCatalogItem?.beneficiaries,
    catalogExpectedResults: selectedCatalogItem?.expectedResults,
    catalogDeliverables: selectedCatalogItem?.deliverables,
    catalogIndicators: selectedCatalogItem?.indicators,
    projectCode,
    month,
    year,
    expertName,
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-slate-50 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <FileText className="h-4 w-4" />
              Livrabile principale
            </div>
            <div className="text-xs text-muted-foreground">Outputurile directe ale activitatii - obligatorii</div>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => onAddSlot('livrabil')}>
            <Plus className="mr-1 h-4 w-4" />
            Adauga livrabil
          </Button>
        </div>

        {mainDeliverables.length === 0 && (
          <div className="rounded-md border border-dashed py-4 text-center text-xs text-muted-foreground">
            Niciun livrabil. Apasa + pentru a adauga outputul activitatii.
          </div>
        )}

        <div className="space-y-3">
          {mainDeliverables.map((deliverable) => (
            <DeliverableItem
              key={deliverable.id}
              deliverable={deliverable}
              {...commonProps}
              onUpdate={(patch) => onUpdateDeliverable(deliverable.id, patch)}
              onRemove={() => onRemoveDeliverable(deliverable.id)}
              deliverableOptions={deliverableOptions}
            />
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-purple-200 bg-purple-50 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-purple-800">
              <FileText className="h-4 w-4" />
              Raport preliminar / descriptiv
              <Badge variant="outline" className="text-[10px] text-purple-600">optional</Badge>
            </div>
            <div className="text-xs text-purple-600">Context detaliat al activitatii (ex: raport de aliniere, nota interna)</div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onAddSlot('raport_preliminar')}
            className="border-purple-300 text-purple-700"
          >
            <Plus className="mr-1 h-4 w-4" />
            Adauga raport
          </Button>
        </div>
        <div className="space-y-3">
          {prelimDeliverables.map((deliverable) => (
            <DeliverableItem
              key={deliverable.id}
              deliverable={deliverable}
              {...commonProps}
              onUpdate={(patch) => onUpdateDeliverable(deliverable.id, patch)}
              onRemove={() => onRemoveDeliverable(deliverable.id)}
              required={false}
            />
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-amber-800">
              <FileText className="h-4 w-4" />
              Alte documente justificative
              <Badge variant="outline" className="text-[10px] text-amber-600">optional</Badge>
            </div>
            <div className="text-xs text-amber-600">Agende, invitatii, corespondenta, documente suport suplimentare</div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onAddSlot('justificativ')}
            className="border-amber-300 text-amber-700"
          >
            <Plus className="mr-1 h-4 w-4" />
            Adauga
          </Button>
        </div>
        {justifDeliverables.length > 0 && (
          <div className="space-y-3">
            {justifDeliverables.map((deliverable) => (
              <DeliverableItem
                key={deliverable.id}
                deliverable={deliverable}
                apiKey={null}
                subActivity={saCode}
                activityTitle={activityTitle}
                onUpdate={(patch) => onUpdateDeliverable(deliverable.id, patch)}
                onRemove={() => onRemoveDeliverable(deliverable.id)}
                required={false}
              />
            ))}
          </div>
        )}
      </div>

      {isEvent && (
        <EventDocsPanel
          deliverables={deliverables}
          subActivity={saCode}
          activityTitle={activityTitle}
          date={selectedDate}
          description={description}
          allExperts={allExperts}
          currentExpertId={expertId}
          onUpdateDeliverable={onUpdateDeliverable}
          onUpsertSlot={onUpsertEventSlot}
        />
      )}
    </div>
  );
}
