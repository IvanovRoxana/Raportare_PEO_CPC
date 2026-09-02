'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { MessageSquare, Send } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useSupportTicketMutations } from '@/hooks/use-backend-data';
import type {
  SupportTicketModule,
  SupportTicketSeverity,
  SupportTicketType,
} from '@/lib/types';
import type { AppUser } from '@/lib/aws/auth';

const ticketTypes: Array<{ value: SupportTicketType; label: string }> = [
  { value: 'bug', label: 'Bug' },
  { value: 'question', label: 'Intrebare' },
  { value: 'suggestion', label: 'Sugestie' },
  { value: 'blocker', label: 'Blocaj' },
  { value: 'export_issue', label: 'Problema export' },
  { value: 'ai_issue', label: 'Problema AI' },
  { value: 'access_issue', label: 'Acces / date' },
  { value: 'ux_issue', label: 'UX / neclaritate' },
];

const ticketModules: Array<{ value: SupportTicketModule; label: string }> = [
  { value: 'expert', label: 'Expert' },
  { value: 'pm', label: 'PM' },
  { value: 'financial', label: 'Financiar' },
  { value: 'deliverables', label: 'Livrabile' },
  { value: 'gt', label: 'GT' },
  { value: 'business_hub', label: 'Business Hub' },
  { value: 'achizitii', label: 'Achizitii' },
  { value: 'ai', label: 'AI' },
  { value: 'export', label: 'Export' },
  { value: 'admin', label: 'Admin' },
  { value: 'other', label: 'Alt modul' },
];

const severityOptions: Array<{ value: SupportTicketSeverity; label: string }> = [
  { value: 'blocking', label: 'Blocheaza raportarea' },
  { value: 'important', label: 'Important' },
  { value: 'minor', label: 'Minor' },
];

function inferModuleFromPath(pathname: string): SupportTicketModule {
  if (pathname.startsWith('/pm')) return 'pm';
  if (pathname.startsWith('/financiar')) return 'financial';
  if (pathname.startsWith('/gt')) return 'gt';
  if (pathname.startsWith('/achizitii')) return 'achizitii';
  if (pathname.startsWith('/admin')) return 'admin';
  if (pathname.includes('livrabile')) return 'deliverables';
  if (pathname.startsWith('/api/ai')) return 'ai';
  return 'expert';
}

function buildLinearLabels(input: {
  module: SupportTicketModule;
  type: SupportTicketType;
  severity: SupportTicketSeverity;
  affectsMonthlyReporting: boolean;
}) {
  const labels = ['PL uat', 'PL needs-retest', `PL ${input.module}`];
  if (input.type === 'ai_issue') labels.push('PL ai-validation');
  if (input.type === 'export_issue') labels.push('PL export-validation');
  if (input.type === 'access_issue') labels.push('PL security-gdpr');
  if (input.severity === 'blocking' || input.affectsMonthlyReporting) labels.push('PL blocker-live');
  return Array.from(new Set(labels));
}

function buildLinearPriority(severity: SupportTicketSeverity, type: SupportTicketType) {
  if (severity === 'blocking' || type === 'access_issue') return 'urgent';
  if (type === 'export_issue') return 'high';
  if (severity === 'important') return 'medium';
  return 'low';
}

function getClientEnvironment() {
  return process.env.NEXT_PUBLIC_APP_ENV || process.env.NODE_ENV || 'unknown';
}

function getAppVersion() {
  return process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_APP_VERSION || 'local';
}

export function SupportTicketDialog({ user }: { user: AppUser | null }) {
  const pathname = usePathname() || '/';
  const { toast } = useToast();
  const { create } = useSupportTicketMutations();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastClientError, setLastClientError] = useState<string | undefined>();
  const [type, setType] = useState<SupportTicketType>('bug');
  const [module, setModule] = useState<SupportTicketModule>(() => inferModuleFromPath(pathname));
  const [severity, setSeverity] = useState<SupportTicketSeverity>('important');
  const [canReproduce, setCanReproduce] = useState('unknown');
  const [affectsMonthlyReporting, setAffectsMonthlyReporting] = useState(false);
  const [description, setDescription] = useState('');
  const [actualResult, setActualResult] = useState('');
  const [expectedResult, setExpectedResult] = useState('');
  const [reproductionSteps, setReproductionSteps] = useState('');
  const [screenshotFileName, setScreenshotFileName] = useState<string | undefined>();

  useEffect(() => {
    setModule(inferModuleFromPath(pathname));
  }, [pathname]);

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      setLastClientError(event.message || event.error?.message);
    };
    const handleRejection = (event: PromiseRejectionEvent) => {
      setLastClientError(event.reason instanceof Error ? event.reason.message : String(event.reason || 'Promise rejected'));
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);
    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  const title = useMemo(() => {
    const moduleLabel = ticketModules.find((item) => item.value === module)?.label || module;
    const typeLabel = ticketTypes.find((item) => item.value === type)?.label || type;
    return `[UAT][${moduleLabel}] ${typeLabel}`;
  }, [module, type]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!description.trim() && !actualResult.trim()) {
      toast({
        title: 'Completeaza problema',
        description: 'Scrie pe scurt ce incercai sa faci sau ce s-a intamplat.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const linearLabels = buildLinearLabels({ module, type, severity, affectsMonthlyReporting });
      const ticket = await create({
        title,
        description: description.trim() || actualResult.trim(),
        type,
        module,
        severity,
        status: 'new',
        expectedResult: expectedResult.trim() || undefined,
        actualResult: actualResult.trim() || undefined,
        reproductionSteps: reproductionSteps.trim() || undefined,
        affectsMonthlyReporting,
        canReproduce,
        userId: user?.id,
        userEmail: user?.email,
        userName: user?.displayName,
        userRole: user?.roles.join(',') || undefined,
        currentPath: pathname,
        browserInfo: navigator.userAgent,
        appVersion: getAppVersion(),
        environment: getClientEnvironment(),
        screenshotFileName,
        lastClientError,
        networkStatus: navigator.onLine ? 'online' : 'offline',
        linearLabels,
        linearPriority: buildLinearPriority(severity, type),
        createdBy: user?.email || user?.id,
      });

      toast({
        title: 'Sesizarea a fost inregistrata',
        description: `Ticket ${ticket.id} este in status Nou.`,
      });
      setOpen(false);
      setDescription('');
      setActualResult('');
      setExpectedResult('');
      setReproductionSteps('');
      setScreenshotFileName(undefined);
      setCanReproduce('unknown');
      setAffectsMonthlyReporting(false);
    } catch (error) {
      toast({
        title: 'Nu am putut salva sesizarea',
        description: error instanceof Error ? error.message : 'Incearca din nou peste cateva momente.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="rounded-md">
          <MessageSquare className="h-4 w-4" />
          <span className="hidden sm:inline">Raporteaza problema</span>
          <span className="sm:hidden">Suport</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Raporteaza problema in testare</DialogTitle>
            <DialogDescription>
              Include doar informatii necesare depanarii. Evita CNP-uri, date personale sensibile sau continut integral din documente.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Tip</Label>
              <Select value={type} onValueChange={(value) => setType(value as SupportTicketType)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ticketTypes.map((item) => (
                    <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Modul</Label>
              <Select value={module} onValueChange={(value) => setModule(value as SupportTicketModule)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ticketModules.map((item) => (
                    <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Severitate</Label>
              <Select value={severity} onValueChange={(value) => setSeverity(value as SupportTicketSeverity)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {severityOptions.map((item) => (
                    <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="support-description">Ce incercai sa faci?</Label>
            <Textarea
              id="support-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Ex: incercam sa salvez livrabilul pentru luna curenta..."
              className="min-h-20"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="support-actual">Ce s-a intamplat?</Label>
              <Textarea
                id="support-actual"
                value={actualResult}
                onChange={(event) => setActualResult(event.target.value)}
                className="min-h-24"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="support-expected">Ce te asteptai sa se intample?</Label>
              <Textarea
                id="support-expected"
                value={expectedResult}
                onChange={(event) => setExpectedResult(event.target.value)}
                className="min-h-24"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
            <div className="space-y-2">
              <Label htmlFor="support-steps">Pasi de reproducere</Label>
              <Input
                id="support-steps"
                value={reproductionSteps}
                onChange={(event) => setReproductionSteps(event.target.value)}
                placeholder="Ex: pagina PM > Livrabile > Incarca"
              />
            </div>
            <div className="space-y-2">
              <Label>Poate fi reprodus?</Label>
              <Select value={canReproduce} onValueChange={setCanReproduce}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Da</SelectItem>
                  <SelectItem value="no">Nu</SelectItem>
                  <SelectItem value="unknown">Nu stiu</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-[1fr_14rem]">
            <label className="flex items-start gap-3 rounded-md border border-border bg-slate-50 p-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={affectsMonthlyReporting}
                onChange={(event) => setAffectsMonthlyReporting(event.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-300"
              />
              <span>Afecteaza raportarea lunara sau exportul final.</span>
            </label>
            <div className="space-y-2">
              <Label htmlFor="support-screenshot">Screenshot</Label>
              <Input
                id="support-screenshot"
                type="file"
                accept="image/*"
                onChange={(event) => setScreenshotFileName(event.target.files?.[0]?.name)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isSubmitting}>
              Anuleaza
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              <Send className="h-4 w-4" />
              {isSubmitting ? 'Se trimite...' : 'Trimite'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
