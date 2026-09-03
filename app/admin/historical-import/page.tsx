import Link from 'next/link';
import { DatabaseBackup, FileArchive, History, ShieldCheck } from 'lucide-react';
import { DashboardShell } from '@/components/layout/dashboard-shell';
import { HistoricalImportPanel } from '@/components/admin/historical-import-panel';
import { AdminAccessGuard } from '@/components/admin/admin-access-guard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const guardrails = [
  'Sursa este marcata historical_import, nu raportare curenta introdusa de expert.',
  'Fisierul original ramane atasat in Storage, iar metadatele sunt salvate in DynamoDB.',
  'PM poate verifica ulterior dosarele importate fara sa modifice fluxul lunii active.',
];

export default function AdminHistoricalImportPage() {
  return (
    <AdminAccessGuard>
    <DashboardShell
      activeHref="/admin"
      eyebrow="Import istoric raportare"
      title="Baza istorica ianuarie-aprilie 2026"
      description="Incarca dosarele lunare expert cu expert: PDF raport / Anexa 10, Excel pontaj si metadate minime pentru cautare, verificare PM si audit."
      actions={
        <Button asChild variant="outline">
          <Link href="/admin">Dashboard admin</Link>
        </Button>
      }
      quickTabs={[
        { label: 'Import', href: '#import-istoric', icon: History, active: true },
        { label: 'Guardrails', href: '#guardrails', icon: ShieldCheck },
        { label: 'AWS', href: '#aws-created', icon: DatabaseBackup },
      ]}
    >
      <section id="guardrails" className="grid gap-4 md:grid-cols-3 scroll-mt-24">
        {guardrails.map((item) => (
          <Card key={item}>
            <CardContent className="flex gap-3 pt-6 text-sm leading-6 text-muted-foreground">
              <ShieldCheck className="mt-1 h-4 w-4 shrink-0 text-primary" />
              <span>{item}</span>
            </CardContent>
          </Card>
        ))}
      </section>

      <section id="import-istoric" className="scroll-mt-24">
        <HistoricalImportPanel />
      </section>

      <Card id="aws-created" className="scroll-mt-24">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <DatabaseBackup className="h-5 w-5 text-primary" />
            Ce se creeaza in AWS
          </CardTitle>
          <CardDescription>
            Formularul foloseste modelele deploy-uite deja in Amplify.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {['HistoricalImportBatch', 'MonthlyExpertReport', 'UploadedReportingFile', 'PM review status'].map((item) => (
            <div key={item} className="flex items-center gap-2 rounded-2xl border bg-secondary/35 p-3 text-sm">
              <FileArchive className="h-4 w-4 text-primary" />
              {item}
            </div>
          ))}
        </CardContent>
      </Card>
    </DashboardShell>
    </AdminAccessGuard>
  );
}
