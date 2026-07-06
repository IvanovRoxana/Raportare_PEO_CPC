'use client';

import type { ObservationGroup, ObservationRailItem, ObservationTone } from '@/hooks/use-observation-rail';

const OBSERVATION_GROUP_LABELS: Record<ObservationGroup, string> = {
  form: 'Formular',
  deliverables: 'Livrabile',
  ai: 'AI',
};

function getObservationToneClass(tone: ObservationTone) {
  if (tone === 'danger') return 'border-red-200 bg-red-50 text-red-900';
  if (tone === 'warning') return 'border-amber-200 bg-amber-50 text-amber-900';
  if (tone === 'success') return 'border-emerald-200 bg-emerald-50 text-emerald-900';
  return 'border-blue-200 bg-blue-50 text-blue-900';
}

function getObservationBadgeClass(tone: ObservationTone) {
  if (tone === 'danger') return 'bg-red-600';
  if (tone === 'warning') return 'bg-amber-500';
  if (tone === 'success') return 'bg-emerald-600';
  return 'bg-blue-600';
}

interface ObservationRailProps {
  items: ObservationRailItem[];
  onAction?: (item: ObservationRailItem, actionId: string) => void;
  onFocusItem?: (item: ObservationRailItem) => void;
  onNavigateToItem?: (item: ObservationRailItem) => void;
}

export function ObservationRail({ items, onAction, onFocusItem, onNavigateToItem }: ObservationRailProps) {
  const groups: ObservationGroup[] = ['form', 'deliverables', 'ai'];
  const isInteractive = Boolean(onFocusItem || onNavigateToItem);

  const handleItemClick = (item: ObservationRailItem) => {
    onFocusItem?.(item);
    onNavigateToItem?.(item);
  };

  return (
    <aside className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm xl:sticky xl:top-24 xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto">
      <div className="mb-3">
        <div className="text-sm font-semibold text-slate-950">Observatii si atentionari</div>
        <p className="mt-1 text-xs text-muted-foreground">
          Raman vizibile cat timp completezi formularul.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
          Nu exista atentionari active.
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => {
            const groupItems = items.filter((item) => item.group === group);
            if (groupItems.length === 0) return null;

            return (
              <section key={group} className="space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {OBSERVATION_GROUP_LABELS[group]}
                </div>
                {groupItems.map((item) => {
                  const content = (
                    <div className="flex items-start gap-2">
                      <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${getObservationBadgeClass(item.tone)}`} />
                      <div className="min-w-0 space-y-1">
                        <div className="font-semibold leading-5">{item.title}</div>
                        {item.detail && (
                          <p className="whitespace-pre-wrap leading-5">{item.detail}</p>
                        )}
                        {item.meta && item.meta.length > 0 && (
                          <ul className="space-y-0.5 text-[11px] opacity-90">
                            {item.meta.map((meta, index) => (
                              <li key={`${item.id}-${index}`} className="break-words">
                                {meta}
                              </li>
                            ))}
                          </ul>
                        )}
                        {item.actions && item.actions.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {item.actions.map((action) => (
                              <button
                                key={action.id}
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onAction?.(item, action.id);
                                }}
                                className="rounded-full border border-current/30 bg-white/70 px-2 py-1 text-[11px] font-semibold transition hover:bg-white"
                              >
                                {action.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );

                  if (isInteractive) {
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleItemClick(item)}
                        className={`w-full rounded-md border p-2 text-left text-xs transition hover:shadow-sm ${getObservationToneClass(item.tone)}`}
                      >
                        {content}
                      </button>
                    );
                  }

                  return (
                    <div
                      key={item.id}
                      className={`rounded-md border p-2 text-xs ${getObservationToneClass(item.tone)}`}
                    >
                      {content}
                    </div>
                  );
                })}
              </section>
            );
          })}
        </div>
      )}
    </aside>
  );
}
