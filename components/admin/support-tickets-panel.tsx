'use client';

import { useMemo, useState } from 'react';
import { getUrl } from 'aws-amplify/storage';
import { ArrowRight, MessageSquare, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { useSupportTicketMutations, useSupportTickets } from '@/hooks/use-backend-data';
import type { SupportTicket, SupportTicketStatus } from '@/lib/types';

const statusLabels: Record<string, string> = {
  new: 'Nou',
  confirmed: 'Confirmat',
  in_progress: 'In lucru',
  testing: 'In testare',
  resolved: 'Rezolvat',
  duplicate: 'Duplicat',
  not_bug: 'Nu este bug',
  deferred: 'Amanat',
};

const severityLabels: Record<string, string> = {
  blocking: 'Blocant',
  important: 'Important',
  minor: 'Minor',
};

const statusOptions = Object.entries(statusLabels).map(([value, label]) => ({ value, label }));

function formatDate(value?: string) {
  if (!value) return '-';
  return new Date(value).toLocaleString('ro-RO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function openTicketCount(tickets: SupportTicket[]) {
  return tickets.filter((ticket) => !['resolved', 'duplicate', 'not_bug', 'deferred'].includes(ticket.status)).length;
}

function blockingTicketCount(tickets: SupportTicket[]) {
  return tickets.filter((ticket) => ticket.severity === 'blocking' || ticket.affectsMonthlyReporting).length;
}

function SupportTicketRow({ ticket }: { ticket: SupportTicket }) {
  const { toast } = useToast();
  const { update } = useSupportTicketMutations();
  const [status, setStatus] = useState(ticket.status);
  const [linearIssueUrl, setLinearIssueUrl] = useState(ticket.linearIssueUrl ?? '');
  const [screenshotUrl, setScreenshotUrl] = useState<string | undefined>();
  const [isSaving, setIsSaving] = useState(false);

  async function openScreenshot() {
    if (!ticket.screenshotS3Key) return;
    try {
      const result = await getUrl({ path: ticket.screenshotS3Key });
      const url = result.url.toString();
      setScreenshotUrl(url);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      toast({
        title: 'Nu am putut deschide screenshotul',
        description: error instanceof Error ? error.message : 'Verifica accesul la Storage.',
        variant: 'destructive',
      });
    }
  }

  async function saveUpdates() {
    setIsSaving(true);
    try {
      await update(ticket, {
        status: status as SupportTicketStatus,
        linearIssueUrl: linearIssueUrl.trim() || undefined,
        updatedBy: 'admin',
        resolvedAt: status === 'resolved' ? new Date().toISOString() : ticket.resolvedAt,
      });
      toast({ title: 'Ticket actualizat', description: `${ticket.id} a fost salvat.` });
    } catch (error) {
      toast({
        title: 'Actualizarea a esuat',
        description: error instanceof Error ? error.message : 'Incearca din nou.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <TableRow>
      <TableCell className="min-w-[18rem] whitespace-normal">
        <div className="font-semibold text-slate-950">{ticket.title}</div>
        <div className="mt-1 text-xs text-muted-foreground">{ticket.id}</div>
        <p className="mt-2 line-clamp-3 text-sm text-slate-700">{ticket.description}</p>
      </TableCell>
      <TableCell>
        <div className="space-y-2">
          <Badge variant={ticket.severity === 'blocking' ? 'destructive' : 'outline'}>
            {severityLabels[ticket.severity] ?? ticket.severity}
          </Badge>
          <div className="text-xs text-muted-foreground">{ticket.module}</div>
          {ticket.affectsMonthlyReporting ? (
            <Badge variant="cu_observatii">Raportare lunara</Badge>
          ) : null}
        </div>
      </TableCell>
      <TableCell className="min-w-[14rem] whitespace-normal text-sm text-slate-700">
        <div>{ticket.userName || ticket.userEmail || 'Utilizator necunoscut'}</div>
        <div className="text-xs text-muted-foreground">{ticket.userRole || '-'}</div>
        <div className="mt-2 text-xs text-muted-foreground">{ticket.currentPath || '-'}</div>
        <div className="mt-1 text-xs text-muted-foreground">{formatDate(ticket.createdAt)}</div>
        {ticket.screenshotFileName ? (
          <div className="mt-2 text-xs text-muted-foreground">
            Screenshot: {ticket.screenshotFileName}
          </div>
        ) : null}
        {ticket.screenshotS3Key ? (
          <Button type="button" variant="outline" size="sm" className="mt-2" onClick={openScreenshot}>
            Deschide screenshot
          </Button>
        ) : screenshotUrl ? (
          <a href={screenshotUrl} target="_blank" rel="noreferrer" className="mt-2 block text-xs font-semibold text-primary">
            Deschide screenshot
          </a>
        ) : null}
      </TableCell>
      <TableCell className="min-w-[16rem] whitespace-normal">
        <div className="space-y-2">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={linearIssueUrl}
            onChange={(event) => setLinearIssueUrl(event.target.value)}
            placeholder="Link Linear"
          />
          <Button size="sm" onClick={saveUpdates} disabled={isSaving}>
            {isSaving ? 'Se salveaza...' : 'Salveaza'}
          </Button>
        </div>
      </TableCell>
      <TableCell className="min-w-[16rem] whitespace-normal">
        <div className="flex flex-wrap gap-1">
          {(ticket.linearLabels ?? []).map((label) => (
            <Badge key={label} variant="secondary">{label}</Badge>
          ))}
        </div>
        {ticket.linearIssueUrl ? (
          <a
            href={ticket.linearIssueUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary"
          >
            Linear
            <ArrowRight className="h-3.5 w-3.5" />
          </a>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

export function SupportTicketsPanel() {
  const { tickets, isLoading, error, mutate } = useSupportTickets();
  const [statusFilter, setStatusFilter] = useState('active');

  const filteredTickets = useMemo(() => {
    if (statusFilter === 'all') return tickets;
    if (statusFilter === 'active') {
      return tickets.filter((ticket) => !['resolved', 'duplicate', 'not_bug', 'deferred'].includes(ticket.status));
    }
    return tickets.filter((ticket) => ticket.status === statusFilter);
  }, [statusFilter, tickets]);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="rounded-lg">
          <CardHeader className="pb-0">
            <CardTitle className="text-sm text-muted-foreground">Tichete active</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-slate-950">{openTicketCount(tickets)}</p>
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader className="pb-0">
            <CardTitle className="text-sm text-muted-foreground">Blocante / raportare</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-slate-950">{blockingTicketCount(tickets)}</p>
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader className="pb-0">
            <CardTitle className="text-sm text-muted-foreground">Total UAT</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-slate-950">{tickets.length}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <Label>Filtru status</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="all">Toate</SelectItem>
              {statusOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" onClick={mutate} disabled={isLoading}>
          <RefreshCw className="h-4 w-4" />
          Reincarca
        </Button>
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          Nu am putut incarca tichetele de suport.
        </div>
      ) : null}

      {isLoading ? (
        <div className="rounded-lg border border-border bg-slate-50 p-6 text-sm text-muted-foreground">
          Se incarca tichetele...
        </div>
      ) : filteredTickets.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sesizare</TableHead>
              <TableHead>Prioritate</TableHead>
              <TableHead>Context</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Linear</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredTickets.map((ticket) => (
              <SupportTicketRow key={ticket.id} ticket={ticket} />
            ))}
          </TableBody>
        </Table>
      ) : (
        <div className="rounded-lg border border-dashed border-border bg-slate-50 p-8 text-center">
          <MessageSquare className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 font-semibold text-slate-950">Nu exista tichete pentru filtrul curent.</p>
          <p className="mt-1 text-sm text-muted-foreground">Sesizarile trimise din butonul global vor aparea aici.</p>
        </div>
      )}
    </div>
  );
}
