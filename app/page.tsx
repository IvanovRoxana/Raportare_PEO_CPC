import { Suspense } from 'react';
import Link from 'next/link';
import { ArrowRight, Building2, CalendarDays, CheckCircle2, CircleDollarSign, FileText, LayoutPanelTop, Settings } from 'lucide-react';
import { LoginCard, LoginCardFallback } from '@/components/auth/login-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const projectDetails = [
  ['Cod MySMIS', '302141'],
  ['Beneficiar', 'Confederația Patronală Concordia'],
  ['Valoarea totală a proiectului', '37.101.208,87 Lei'],
  ['Valoarea cofinanțării UE', '28.346.990,99 Lei'],
  ['Valoare din bugetul național', '8.754.217,88 Lei'],
  ['Perioada de implementare', '60 de luni'],
];

const objectives = [
  'Creșterea reprezentativității Confederației Patronale Concordia la nivel local, sectorial și național.',
  'Creșterea capacității Concordia și a membrilor săi de reprezentare și intervenție în politici publice.',
  'Recunoașterea Concordia la nivel național ca organizație importantă pentru mediul de afaceri și creșterea prezenței internaționale.',
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-background">
      <section className="border-b bg-card">
        <div className="mx-auto grid max-w-screen-2xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:px-8 lg:py-10">
          <div className="flex flex-col justify-center">
            <Badge className="mb-5 w-fit rounded-md bg-primary/10 text-primary hover:bg-primary/10">
              Proiect PEO 302141
            </Badge>
            <h1 className="max-w-4xl text-3xl font-bold tracking-normal text-foreground sm:text-4xl lg:text-5xl">
              Consolidarea capacității Concordia pentru dialog social
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
              Obiectivul general al proiectului vizează dezvoltarea și consolidarea
              capacității Confederației Patronale Concordia și a membrilor săi pentru a
              fundamenta, elabora și susține politici publice și pentru a reprezenta
              unitar mișcarea patronală din România.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button asChild>
                <a href="#autentificare">
                  Autentificare
                  <ArrowRight className="h-4 w-4" />
                </a>
              </Button>
              <Button asChild variant="outline">
                <Link href="/auth/sign-up">Creează cont</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/financiar">
                  <CircleDollarSign className="h-4 w-4" />
                  Dashboard financiar
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/admin">
                  <Settings className="h-4 w-4" />
                  Modul admin
                </Link>
              </Button>
            </div>
          </div>

          <aside id="autentificare" className="scroll-mt-48">
            <Suspense fallback={<LoginCardFallback />}>
              <LoginCard
                redirectTo="/expert"
                title="Intră în aplicația de raportare"
                description="Autentifică-te pentru pontaj, livrabile, rapoarte și verificări."
              />
            </Suspense>
          </aside>
        </div>
      </section>

      <section className="mx-auto grid max-w-screen-2xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:px-8">
        <div className="space-y-6">
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Building2 className="h-5 w-5 text-primary" />
                Obiectivele proiectului
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              {objectives.map((objective) => (
                <div key={objective} className="flex gap-3 rounded-md border bg-background p-4">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <p className="text-sm leading-6 text-foreground">{objective}</p>
                </div>
              ))}
            </CardContent>
          </Card>


          <Card className="rounded-lg border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <LayoutPanelTop className="h-5 w-5 text-primary" />
                Admin Dashboard · Nucleu
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-6 text-foreground">
              <p>Acces rapid către zona "Nucleu Dashboard Admin" pentru managementul Utilizatori și roluri, Experți, Proiecte, Subactivități și Catalog activități.</p>
              <Button asChild>
                <Link href="/admin#nucleu-dashboard-admin">Deschide Nucleu Dashboard Admin</Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <CalendarDays className="h-5 w-5 text-primary" />
                Activități urmărite în aplicație
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm leading-6 text-muted-foreground">
              <p>
                Aplicația centralizează pontajul experților, livrabilele, rapoartele de
                activitate, verificările PM și documentele justificative aferente proiectului.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border bg-background p-4">
                  Analize, studii și documente de poziție pentru fundamentarea politicilor publice.
                </div>
                <div className="rounded-md border bg-background p-4">
                  Servicii suport, informare, dialog social și activități pentru membri.
                </div>
                <div className="rounded-md border bg-background p-4">
                  Recrutare, selecție și monitorizare grup țintă.
                </div>
                <div className="rounded-md border bg-background p-4">
                  Rapoarte, OPIS, verificare livrabile și flux de conformitate.
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-6">
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <FileText className="h-5 w-5 text-primary" />
                Detaliile proiectului
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {projectDetails.map(([label, value]) => (
                <div key={label} className="rounded-md border bg-background p-3">
                  <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-lg border-primary/20 bg-primary/5">
            <CardContent className="pt-6 text-sm leading-6 text-foreground">
              Pentru informații detaliate despre celelalte programe cofinanțate de
              Uniunea Europeană, vă invităm să vizitați{' '}
              <a className="font-semibold text-primary hover:underline" href="https://www.mfe.gov.ro">
                www.mfe.gov.ro
              </a>
              .
            </CardContent>
          </Card>
        </aside>
      </section>
    </main>
  );
}
