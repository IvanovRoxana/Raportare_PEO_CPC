import { Suspense } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, FileText, LockKeyhole, ShieldCheck } from 'lucide-react';
import { LoginCard, LoginCardFallback } from '@/components/auth/login-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const projectDetails = [
  ['Cod MySMIS', '302141'],
  ['Beneficiar', 'Confederatia Patronala Concordia'],
  ['Perioada proiectului', '60 de luni'],
  ['Acces', 'Doar utilizatori autorizati'],
];

const accessSteps = [
  'Deschide pagina principala a platformei.',
  'Autentifica-te cu emailul si parola primite.',
  'Aplicatia te trimite automat in modulul permis rolului tau.',
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_30rem]">
        <div className="flex flex-col px-6 py-8 sm:px-10 lg:px-14">
          <header className="flex items-center justify-between gap-4">
            <Link href="/" className="flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <p className="text-base font-bold tracking-tight text-primary">Raportare PEO</p>
                <p className="text-sm text-muted-foreground">Concordia CPC</p>
              </div>
            </Link>
            <Button asChild variant="outline">
              <a href="#autentificare">
                Autentificare
                <ArrowRight className="h-4 w-4" />
              </a>
            </Button>
          </header>

          <div className="flex flex-1 items-center py-14">
            <div className="max-w-3xl">
              <div className="mb-6 inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-medium text-muted-foreground shadow-sm">
                <LockKeyhole className="h-4 w-4 text-primary" />
                Platforma interna cu acces securizat
              </div>
              <h1 className="max-w-3xl text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">
                Consolidarea capacitatii Concordia pentru dialog social
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                Punctul unic de intrare pentru pontaj, livrabile si raportare PEO. Modulele operationale devin disponibile numai dupa autentificare si in functie de rolul configurat.
              </p>

              <div className="mt-10 grid gap-4 sm:grid-cols-3">
                {accessSteps.map((step, index) => (
                  <div key={step} className="rounded-lg border bg-white p-4 shadow-sm">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
                      {index + 1}
                    </div>
                    <p className="mt-4 text-sm leading-6 text-slate-700">{step}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <aside id="autentificare" className="flex items-center border-t bg-white px-6 py-8 sm:px-10 lg:border-l lg:border-t-0 lg:px-8">
          <div className="w-full space-y-5">
            <Suspense fallback={<LoginCardFallback />}>
              <LoginCard
                title="Autentificare"
                description="Intra in aplicatie cu datele primite de la administrator."
              />
            </Suspense>

            <Card className="rounded-lg shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <FileText className="h-5 w-5 text-primary" />
                  Detalii proiect
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                {projectDetails.map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-4 rounded-lg border bg-secondary/40 px-3 py-2">
                    <span className="text-xs font-medium uppercase text-muted-foreground">{label}</span>
                    <span className="text-right text-sm font-semibold text-foreground">{value}</span>
                  </div>
                ))}
                <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm leading-6 text-emerald-950">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  Dupa logare, expertii vad doar zona proprie de raportare, iar rolurile PM/Admin sunt directionate catre dashboardurile dedicate.
                </div>
              </CardContent>
            </Card>
          </div>
        </aside>
      </section>
    </main>
  );
}
