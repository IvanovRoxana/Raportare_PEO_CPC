import Link from 'next/link';
import { ArrowLeft, DatabaseBackup, FileArchive, ShieldCheck } from 'lucide-react';
import { HistoricalImportPanel } from '@/components/admin/historical-import-panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const guardrails = [
  'Sursa este marcata historical_import, nu raportare curenta introdusa de expert.',
  'Fisierul original ramane atasat in Storage, iar metadatele sunt salvate in DynamoDB.',
  'PM poate verifica ulterior dosarele importate fara sa modifice fluxul lunii active.',
];

export default function AdminHistoricalImportPage() {
  return (
    <main className="min-h-screen bg-muted/30">
      <section className="border-b bg-card">
        <div className="mx-auto flex max-w-screen-2xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <Badge className="mb-4 w-fit rounded-md bg-primary/10 text-primary hover:bg-primary/10">
                Import istoric raportare
              </Badge>
              <h1 className="max-w-4xl text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                Baza istorica ianuarie-aprilie 2026
              </h1>
              <p className="mt-4 max-w-4xl text-base leading-7 text-muted-foreground">
                Incarca dosarele lunare expert cu expert: PDF raport / Anexa 10, Excel pontaj si metadate minime
                pentru cautare, verificare PM si audit.
              </p>
            </div>
            <Button asChild variant="outline">
              <Link href="/admin">
                <ArrowLeft className="h-4 w-4" />
                Dashboard admin
              </Link>
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {guardrails.map((item) => (
              <Card key={item} className="rounded-lg">
                <CardContent className="flex gap-3 pt-6 text-sm leading-6 text-muted-foreground">
                  <ShieldCheck className="mt-1 h-4 w-4 shrink-0 text-primary" />
                  <span>{item}</span>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-screen-2xl px-4 py-8 sm:px-6 lg:px-8">
        <HistoricalImportPanel />

        <Card className="mt-6 rounded-lg">
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
              <div key={item} className="flex items-center gap-2 rounded-md border bg-background p-3 text-sm">
                <FileArchive className="h-4 w-4 text-primary" />
                {item}
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
