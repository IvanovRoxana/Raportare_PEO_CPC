'use client';

import { Edit2, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { ExpertDeliverableRow } from '@/lib/expert-deliverables';
import { formatDateRo } from '@/lib/app-utils';

interface ExpertDeliverablesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: ExpertDeliverableRow[];
  expertName: string;
  monthLabel: string;
  onEditActivity: (activityId: string) => void;
}

function getTitleStatusLabel(status?: string, confirmed?: boolean) {
  if (confirmed) return 'Titlu confirmat';
  if (status === 'matched') return 'Titlu potrivit';
  if (status === 'mismatch') return 'Titlu nepotrivit';
  if (status === 'extraction_failed') return 'Extragere esuata';
  if (status === 'admin_overridden') return 'Titlu corectat';
  return status || 'Titlu neverificat';
}

function getEligibilityLabel(row: ExpertDeliverableRow) {
  if (row.deliverable.eligibilityCheck?.status) return row.deliverable.eligibilityCheck.status;
  if (row.deliverable.aiStatus) return row.deliverable.aiStatus;
  return 'Eligibilitate neverificata';
}

export function ExpertDeliverablesDialog({
  open,
  onOpenChange,
  rows,
  expertName,
  monthLabel,
  onEditActivity,
}: ExpertDeliverablesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(82vh,760px)] max-w-[calc(100vw-2rem)] flex-col overflow-hidden p-0 sm:max-w-5xl">
        <DialogHeader className="border-b px-6 pb-4 pt-6">
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Livrabile incarcate
          </DialogTitle>
          <DialogDescription>
            {expertName} - {monthLabel}. Sunt afisate livrabilele incarcate pe activitatile lunii selectate.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-auto px-6 pb-6">
          {rows.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center rounded-lg border border-dashed bg-muted/30 p-8 text-center">
              <FileText className="h-10 w-10 text-muted-foreground" />
              <p className="mt-4 text-sm font-medium text-foreground">
                Nu exista livrabile incarcate pentru luna selectata.
              </p>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                Dupa atasarea documentelor la activitati, acestea vor aparea aici impreuna cu activitatea asociata.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Livrabil</TableHead>
                    <TableHead className="w-28">Data</TableHead>
                    <TableHead>Activitate</TableHead>
                    <TableHead className="w-44">Tip / stadiu</TableHead>
                    <TableHead className="w-48">Status</TableHead>
                    <TableHead className="w-24 text-right">Actiune</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="align-top">
                        <div className="max-w-[320px] space-y-1">
                          <p className="font-medium text-foreground">{row.title}</p>
                          <p className="truncate text-xs text-muted-foreground" title={row.fileName}>
                            Fisier: {row.fileName}
                          </p>
                          <p className="truncate text-xs text-muted-foreground" title={row.auditReference}>
                            Ref: {row.auditReference}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="align-top text-sm">{formatDateRo(row.activityDate)}</TableCell>
                      <TableCell className="align-top">
                        <div className="max-w-[260px] space-y-1">
                          <p className="font-medium text-foreground">{row.activityTitle}</p>
                          <p className="text-xs text-muted-foreground">
                            {[row.activityType, row.saCode].filter(Boolean).join(' / ') || 'Activitate'}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="flex flex-wrap gap-1.5">
                          {row.deliverable.deliverableType || row.deliverable.category ? (
                            <Badge variant="outline">{row.deliverable.deliverableType || row.deliverable.category}</Badge>
                          ) : null}
                          {row.deliverable.stadiu ? (
                            <Badge variant="secondary">{row.deliverable.stadiu}</Badge>
                          ) : null}
                          {!row.deliverable.deliverableType && !row.deliverable.category && !row.deliverable.stadiu ? (
                            <span className="text-sm text-muted-foreground">Neprecizat</span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="space-y-1 text-xs text-muted-foreground">
                          <p>{getTitleStatusLabel(row.deliverable.titleCheckStatus, row.deliverable.titleConfirmed)}</p>
                          <p>{getEligibilityLabel(row)}</p>
                        </div>
                      </TableCell>
                      <TableCell className="align-top text-right">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => onEditActivity(row.activityId)}
                        >
                          <Edit2 className="h-4 w-4" />
                          Editeaza
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
