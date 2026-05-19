import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Database, Lock, ShieldCheck } from 'lucide-react';
import { ViewAsExpertPanel } from '@/components/admin/view-as-expert-panel';
import { UsersRolesManagementPanel } from '@/components/admin/users-roles-management-panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { adminRoles } from '@/lib/admin-module';
import experts from '@/data/import/experts.json';
import type { Expert } from '@/lib/types';

const awsDataPoints = [
  'Cognito User Pool pentru conturi, autentificare și resetare acces.',
  'Expert în AppSync/DynamoDB pentru profil, SA-uri, activare și acces PM.',
  'AuditLog în AWS pentru invitații, resetări, roluri și dezactivări.',
  'Fallback local doar ca protecție de rulare, nu ca sursă primară pentru audit.',
];

export default function AdminUsersPage() {
  return (
    <main className="min-h-screen bg-muted/30">
      <section className="border-b bg-card">
        <div className="mx-auto flex max-w-screen-2xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <Badge className="mb-4 w-fit rounded-md bg-primary/10 text-primary hover:bg-primary/10">
                Utilizatori și roluri · AWS
              </Badge>
              <h1 className="max-w-4xl text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                Conturi, roluri și permisiuni
              </h1>
              <p className="mt-4 max-w-4xl text-base leading-7 text-muted-foreground">
                Administrarea utilizatorilor, rolurilor și permisiunilor este separată de dashboard-ul admin principal.
                Lista și acțiunile de mai jos lucrează cu AWS Data, Cognito și AuditLog.
              </p>
            </div>
            <Button asChild variant="outline">
              <Link href="/admin">
                <ArrowLeft className="h-4 w-4" />
                Dashboard admin
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-screen-2xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:px-8">
        <div className="space-y-6">
          <UsersRolesManagementPanel />

          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Database className="h-5 w-5 text-primary" />
                Sursa operațională
              </CardTitle>
              <CardDescription>Ce poate afecta fluxul aplicației dacă se schimbă necontrolat.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {awsDataPoints.map((point) => (
                <div key={point} className="flex gap-2 rounded-md border bg-background p-3 text-sm leading-6 text-muted-foreground">
                  <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-primary" />
                  <span>{point}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-6">
          <ViewAsExpertPanel experts={experts as Expert[]} />

          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ShieldCheck className="h-5 w-5 text-primary" />
                Roluri minime
              </CardTitle>
              <CardDescription>Arhitectura permite mai mult decât expert / PM / admin.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {adminRoles.map((role) => (
                <div key={role.role} className="rounded-md border bg-background p-3">
                  <p className="font-medium text-foreground">{role.label}</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{role.description}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-lg border-destructive/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Lock className="h-5 w-5 text-destructive" />
                Atenție la flux
              </CardTitle>
              <CardDescription>
                Schimbările de roluri, conturi inactive și acces PM pot modifica vizibilitatea datelor în Expert, PM și Audit.
              </CardDescription>
            </CardHeader>
          </Card>
        </aside>
      </section>
    </main>
  );
}