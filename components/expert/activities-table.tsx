'use client';

import { useState } from 'react';
import { Edit2, Trash2, FileText, Users, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { formatDateRo } from '@/lib/app-utils';
import {
  GDPR_CONCLUSION_OPTIONS,
  getGdprTemplate,
  parseGdprMetaJson,
  validateGdprActivityDraft,
} from '@/lib/gdpr-reporting';
import type { Activity } from '@/lib/types';

interface ActivitiesTableProps {
  activities: Activity[];
  onEdit: (activity: Activity) => void;
  onDelete: (activityId: string) => void;
}

export function ActivitiesTable({ activities, onEdit, onDelete }: ActivitiesTableProps) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  const sortedActivities = [...activities].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const totalHours = activities.reduce((sum, a) => sum + a.hours, 0);

  if (activities.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>Nu există activități înregistrate.</p>
        <p className="text-sm mt-1">Selectați zile din calendar pentru a adăuga activități.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Activități ({activities.length})</h3>
        <Badge variant="secondary" className="text-sm">
          Total: {totalHours} ore
        </Badge>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10"></TableHead>
              <TableHead className="w-28">Data</TableHead>
              <TableHead className="w-20">Ore</TableHead>
              <TableHead className="w-24">Tip</TableHead>
              <TableHead>Titlu</TableHead>
              <TableHead className="w-24">Locație</TableHead>
              <TableHead className="w-20 text-center">Fișiere</TableHead>
              <TableHead className="w-20 text-center">GT</TableHead>
              <TableHead className="w-24 text-right">Acțiuni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedActivities.map((activity) => {
              const isExpanded = expandedRows.has(activity.id);
              const deliverables = activity.deliverables ?? [];
              const grupTinta = activity.grupTinta ?? [];
              return (
                <>
                  <TableRow key={activity.id} className="hover:bg-muted/50">
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => toggleRow(activity.id)}
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                    </TableCell>
                    <TableCell className="font-medium">{formatDateRo(activity.date)}</TableCell>
                    <TableCell>{activity.hours}h</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {activity.activityType}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate" title={activity.title}>
                      {activity.title}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {activity.location}
                    </TableCell>
                    <TableCell className="text-center">
                      {deliverables.length > 0 && (
                        <div className="flex items-center justify-center gap-1">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">{deliverables.length}</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {grupTinta.length > 0 && (
                        <div className="flex items-center justify-center gap-1">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">{grupTinta.length}</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => onEdit(activity)}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Șterge activitatea?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Această acțiune nu poate fi anulată. Activitatea din{' '}
                                {formatDateRo(activity.date)} va fi ștearsă permanent.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Anulează</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => onDelete(activity.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Șterge
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                  {isExpanded && (
                    <TableRow key={`${activity.id}-expanded`}>
                      <TableCell colSpan={9} className="bg-muted/30 p-4">
                        <div className="space-y-3">
                          <div>
                            <h4 className="text-sm font-medium mb-1">Descriere:</h4>
                            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                              {activity.description || 'Fără descriere'}
                            </p>
                          </div>
                          {activity.gdprTemplateCode && <GdprActivityDetails activity={activity} />}
                          {deliverables.length > 0 && (
                            <div>
                              <h4 className="text-sm font-medium mb-1">Livrabile:</h4>
                              <ul className="list-disc list-inside text-sm text-muted-foreground">
                                {deliverables.map((d) => (
                                  <li key={d.id}>{d.fileName}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {grupTinta.length > 0 && (
                            <div>
                              <h4 className="text-sm font-medium mb-1">Grup Țintă:</h4>
                              <ul className="list-disc list-inside text-sm text-muted-foreground">
                                {grupTinta.map((g) => (
                                  <li key={g.id}>
                                    {g.name || g.type || g.activityType || 'Intrare GT'} {g.cnp && `(CNP: ${g.cnp})`}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function GdprActivityDetails({ activity }: { activity: Activity }) {
  const meta = parseGdprMetaJson(activity.gdprMetaJson);
  const template = getGdprTemplate(activity.gdprTemplateCode);
  const validation = validateGdprActivityDraft({
    templateCode: activity.gdprTemplateCode,
    meta,
    conclusionCode: activity.gdprConclusionCode,
    description: activity.gdprGeneratedText || activity.description,
    hasDeliverable: Boolean(activity.deliverables?.length),
  });
  const conclusion = GDPR_CONCLUSION_OPTIONS.find(
    (option) => option.code === (activity.gdprConclusionCode || meta.concluzie)
  );
  const generatedDeliverable = activity.deliverables?.find((deliverable) =>
    deliverable.documentId?.startsWith('doc_gdpr_') || deliverable.declaredTitle === template?.deliverableTitle
  );

  return (
    <div className="rounded-md border bg-background p-3 text-sm">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{activity.gdprTemplateCode}</Badge>
        {template && <span className="font-medium">{template.label}</span>}
        {conclusion && <Badge variant="outline">{conclusion.label}</Badge>}
      </div>
      <div className="grid gap-2 text-muted-foreground md:grid-cols-2">
        <p>
          <span className="font-medium text-foreground">Livrabil GDPR: </span>
          {generatedDeliverable?.declaredTitle || generatedDeliverable?.fileName || template?.deliverableTitle || 'neatasat'}
        </p>
        <p>
          <span className="font-medium text-foreground">Status completare: </span>
          {validation.ok ? 'complet' : `lipsesc ${validation.missingFields.length} campuri`}
        </p>
      </div>
      {!validation.ok && (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-destructive">
          {validation.missingFields.map((field) => (
            <li key={field}>Camp lipsa: {field}</li>
          ))}
          {validation.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
