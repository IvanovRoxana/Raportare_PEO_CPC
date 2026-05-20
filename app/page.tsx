import { Suspense } from 'react';
import Link from 'next/link';
import { ArrowRight, CalendarDays, ClipboardCheck, FileText, LayoutDashboard, ShieldCheck } from 'lucide-react';
import { LoginCard, LoginCardFallback } from '@/components/auth/login-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const quickAccess = [
  { title: 'Pontaj experți', description: 'Completare pontaj lunar și urmărire ore eligibile.', href: '/expert', icon: CalendarDays, status: 'in_lucru' as const },
  { title: 'Livrabile', description: 'Încărcare, verificare și istoric documente livrabile.', href: '/expert', icon: FileText, status: 'verificat' as const },
  { title: 'Verificări PM', description: 'Flux PM pentru observații, conformitate și aprobare.', href: '/pm', icon: ClipboardCheck, status: 'cu_observatii' as const },
  { title: 'Rapoarte Anexa 10', description: 'Generare și export raport activitate lunar.', href: '/expert/peo', icon: FileText, status: 'gata_export' as const },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-background">
      <section className="mx-auto grid max-w-screen-2xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[280px_minmax(0,1fr)] lg:px-8 lg:py-8">
        <Card className="h-fit bg-sidebar text-sidebar-foreground border-sidebar-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg"><LayoutDashboard className="h-5 w-5" /> Navigare</CardTitle>
            <CardDescription className="text-sidebar-foreground/80">Platforma de raportare PEO · Concordia/CPC</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {['Dashboard', 'Pontaj lunar', 'Livrabile', 'Rapoarte', 'Verificări PM', 'Experți', 'Administrare', 'Setări'].map((item) => (
              <div key={item} className="rounded-lg bg-sidebar-accent/70 px-3 py-2 text-sm">{item}</div>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-primary/15 shadow-sm">
            <CardContent className="grid gap-6 py-6 lg:grid-cols-[minmax(0,1fr)_380px]">
              <div className="space-y-4">
                <Badge variant="secondary" className="rounded-full px-3">Proiect PEO · Cod MySMIS 302141</Badge>
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Dashboard de raportare pentru experți, PM și administratori</h1>
                <p className="max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">Pontaj, livrabile, verificări PM și exporturi lunare într-o interfață clară, compactă și orientată pe conformitate operațională.</p>
                <div className="flex flex-wrap gap-3">
                  <Button asChild><a href="#autentificare">Autentificare <ArrowRight className="h-4 w-4" /></a></Button>
                  <Button asChild variant="outline"><Link href="/financiar">Modul financiar</Link></Button>
                  <Button asChild variant="secondary"><Link href="/super-admin">Administrare tehnică</Link></Button>
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <Badge variant="verificat">Luna de raportare: Mai 2026</Badge>
                  <Badge variant="conform">Rol curent: Expert</Badge>
                  <Badge variant="gata_export">Stare generală: Gata export</Badge>
                </div>
              </div>
              <aside id="autentificare" className="scroll-mt-32">
                <Suspense fallback={<LoginCardFallback />}>
                  <LoginCard title="Autentificare în platformă" description="Acces securizat pentru pontaj, livrabile, verificări și rapoarte." />
                </Suspense>
              </aside>
            </CardContent>
          </Card>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {quickAccess.map((item) => (
              <Card key={item.title} className="group border-border/80 transition-all hover:-translate-y-0.5 hover:shadow-md">
                <CardHeader className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="rounded-xl bg-primary/10 p-2.5 text-primary"><item.icon className="h-5 w-5" /></div>
                    <Badge variant={item.status}>{item.status.replace('_', ' ')}</Badge>
                  </div>
                  <CardTitle className="text-base">{item.title}</CardTitle>
                  <CardDescription>{item.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild variant="ghost" className="h-8 px-0 text-primary">
                    <Link href={item.href}>Deschide modul <ArrowRight className="h-4 w-4" /></Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </section>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg"><ShieldCheck className="h-5 w-5 text-primary" /> Conformitate și utilizare</CardTitle>
              <CardDescription>Platforma păstrează fluxurile existente de autentificare, raportare, verificare PM și export documente.</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </section>
    </main>
  );
}
