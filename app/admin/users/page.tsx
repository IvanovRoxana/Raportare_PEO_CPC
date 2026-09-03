import Link from 'next/link';
import { CheckCircle2, Database, Lock, ShieldCheck, UsersRound } from 'lucide-react';
import { DashboardShell } from '@/components/layout/dashboard-shell';
import { ViewAsExpertPanel } from '@/components/admin/view-as-expert-panel';
import { UsersRolesManagementPanel } from '@/components/admin/users-roles-management-panel';
import { AdminAccessGuard } from '@/components/admin/admin-access-guard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { adminRoles } from '@/lib/admin-module';

const awsDataPoints = [
  'Cognito User Pool pentru conturi, autentificare si resetare acces.',
  'Expert in AppSync/DynamoDB pentru profil, SA-uri, activare si acces PM.',
  'AuditLog in AWS pentru invitatii, resetari, roluri si dezactivari.',
  'Fallback local doar ca protectie de rulare, nu ca sursa primara pentru audit.',
];

export default function AdminUsersPage() {
  return (
    <AdminAccessGuard>
    <DashboardShell
      activeHref="/admin"
      eyebrow="Utilizatori si roluri · AWS"
      title="Conturi, roluri si permisiuni"
      description="Administrarea utilizatorilor, rolurilor si permisiunilor este separata de dashboard-ul admin principal si lucreaza cu AWS Data, Cognito si AuditLog."
      actions={
        <Button asChild variant="outline">
          <Link href="/admin">Dashboard admin</Link>
        </Button>
      }
      quickTabs={[
        { label: 'Utilizatori', href: '#utilizatori', icon: UsersRound, active: true },
        { label: 'Sursa AWS', href: '#sursa-aws', icon: Database },
        { label: 'Roluri minime', href: '#roluri-minime', icon: ShieldCheck },
      ]}
    >
      <section id="utilizatori" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] scroll-mt-24">
        <div className="space-y-6">
          <UsersRolesManagementPanel />

          <Card id="sursa-aws" className="scroll-mt-24">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Database className="h-5 w-5 text-primary" />
                Sursa operationala
              </CardTitle>
              <CardDescription>Ce poate afecta fluxul aplicatiei daca se schimba necontrolat.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {awsDataPoints.map((point) => (
                <div key={point} className="flex gap-2 rounded-2xl border bg-secondary/35 p-3 text-sm leading-6 text-muted-foreground">
                  <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-primary" />
                  <span>{point}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-6">
          <ViewAsExpertPanel />

          <Card id="roluri-minime" className="scroll-mt-24">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ShieldCheck className="h-5 w-5 text-primary" />
                Roluri minime
              </CardTitle>
              <CardDescription>Arhitectura permite mai mult decat expert / PM / admin.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {adminRoles.map((role) => (
                <div key={role.role} className="rounded-2xl border bg-background p-3">
                  <p className="font-medium text-foreground">{role.label}</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{role.description}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-destructive/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Lock className="h-5 w-5 text-destructive" />
                Atentie la flux
              </CardTitle>
              <CardDescription>
                Schimbarile de roluri, conturi inactive si acces PM pot modifica vizibilitatea datelor in Expert, PM si Audit.
              </CardDescription>
            </CardHeader>
          </Card>
        </aside>
      </section>
    </DashboardShell>
    </AdminAccessGuard>
  );
}
