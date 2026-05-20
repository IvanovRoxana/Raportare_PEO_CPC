import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  KeyRound,
  Mail,
  Save,
  Settings,
  User,
} from 'lucide-react';
import { DashboardShell, expertNavItems } from '@/components/layout/dashboard-shell';
import { RightInfoCard } from '@/components/layout/dashboard-primitives';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusBadge } from '@/components/ui/status-badge';
import { Switch } from '@/components/ui/switch';

export default function ExpertProfilePage() {
  return (
    <DashboardShell
      activeHref="/expert/profil"
      navItems={expertNavItems}
      eyebrow="Modul Expert"
      title="Profil"
      description="Actualizează informațiile personale și preferințele contului."
      actions={
        <>
          <Button variant="outline">
            <KeyRound className="h-4 w-4" />
            Schimbă parolă
          </Button>
          <Button>
            <Save className="h-4 w-4" />
            Salvează modificări
          </Button>
        </>
      }
      aside={
        <>
          <RightInfoCard title="Roluri active" icon={User}>
            <div className="space-y-6">
              {[
                ['Expert PEO', 'Acces la activități, livrabile și rapoarte.'],
                ['Membru Concordia', 'Acces la resurse și comunicare internă.'],
              ].map(([role, description]) => (
                <div key={role} className="flex items-start justify-between gap-4">
                  <div className="flex gap-3">
                    <CheckCircle2 className="mt-1 h-5 w-5 text-[#36c2a0]" />
                    <div>
                      <p className="font-bold text-slate-950">{role}</p>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
                    </div>
                  </div>
                  <StatusBadge status="deschisa">Activ</StatusBadge>
                </div>
              ))}
            </div>
            <Link href="/admin/users" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary">
              Vezi toate rolurile
              <ArrowRight className="h-4 w-4" />
            </Link>
          </RightInfoCard>

          <RightInfoCard title="Ultima autentificare" icon={Clock3}>
            <p className="font-semibold text-slate-950">Luni, 12 mai 2026, 09:24</p>
            <p className="mt-4 text-sm text-muted-foreground">Din IP 89.42.120.33 · Chrome · Windows</p>
            <Link href="/admin/users" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary">
              Vezi istoric autentificări
              <ArrowRight className="h-4 w-4" />
            </Link>
          </RightInfoCard>

          <RightInfoCard title="Asistență cont" icon={Mail}>
            <p className="text-sm leading-6 text-muted-foreground">
              Ai nevoie de ajutor cu contul? Contactează echipa de suport Concordia.
            </p>
            <Button asChild variant="outline" className="mt-5 w-full">
              <a href="mailto:suport@concordia.ro">
                Deschide tichet de suport
                <ArrowRight className="h-4 w-4" />
              </a>
            </Button>
          </RightInfoCard>
        </>
      }
    >
      <Card className="rounded-[1.5rem] py-0">
        <CardContent className="flex flex-col gap-6 p-7 md:flex-row md:items-center">
          <div className="relative flex h-32 w-32 shrink-0 items-center justify-center rounded-full bg-[#eaf3fb] text-primary">
            <User className="h-16 w-16" />
            <span className="absolute bottom-2 right-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary text-white shadow-sm">
              <Settings className="h-5 w-5" />
            </span>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-950">Andreea Popescu</h2>
            <p className="mt-1 text-sm text-muted-foreground">Expert PEO</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <StatusBadge status="verificat">Expert</StatusBadge>
              <StatusBadge status="conform">Membru Concordia</StatusBadge>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-[1.5rem] py-0">
        <CardContent className="space-y-8 p-7">
          <section>
            <h2 className="mb-4 flex items-center gap-3 font-bold text-slate-950">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#eaf3fb] text-primary">
                <User className="h-4 w-4" />
              </span>
              1. Date personale
            </h2>
            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Nume complet *</Label>
                <Input id="name" defaultValue="Andreea Popescu" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Rol în platformă *</Label>
                <Select defaultValue="expert">
                  <SelectTrigger id="role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="expert">Expert PEO</SelectItem>
                    <SelectItem value="pm">PM</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="org">Organizație *</Label>
                <Input id="org" defaultValue="Concordia" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="county">Județ *</Label>
                <Select defaultValue="bucuresti">
                  <SelectTrigger id="county">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bucuresti">București</SelectItem>
                    <SelectItem value="cluj">Cluj</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          <section className="border-t border-slate-100 pt-6">
            <h2 className="mb-4 flex items-center gap-3 font-bold text-slate-950">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#eaf3fb] text-primary">
                <Mail className="h-4 w-4" />
              </span>
              2. Date contact
            </h2>
            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input id="email" defaultValue="andreea.popescu@concordia.ro" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Telefon *</Label>
                <Input id="phone" defaultValue="+40 721 123 456" />
              </div>
            </div>
          </section>

          <section className="border-t border-slate-100 pt-6">
            <h2 className="mb-4 flex items-center gap-3 font-bold text-slate-950">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#eaf3fb] text-primary">
                <Settings className="h-4 w-4" />
              </span>
              3. Preferințe notificări
            </h2>
            <div className="divide-y divide-slate-100">
              {[
                ['Notificări prin email', 'Primește notificări pentru activități, aprobări și rapoarte.'],
                ['Reminder raportare', 'Primește remindere pentru activitățile și rapoartele lunare.'],
              ].map(([title, description]) => (
                <div key={title} className="flex items-center justify-between gap-4 py-4">
                  <div className="flex items-center gap-4">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#eaf3fb] text-primary">
                      <Mail className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="font-semibold text-slate-950">{title}</p>
                      <p className="text-sm text-muted-foreground">{description}</p>
                    </div>
                  </div>
                  <Switch defaultChecked />
                </div>
              ))}
            </div>
          </section>

          <section className="border-t border-slate-100 pt-6">
            <h2 className="mb-4 flex items-center gap-3 font-bold text-slate-950">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#eaf3fb] text-primary">
                <Settings className="h-4 w-4" />
              </span>
              4. Acces în platformă
            </h2>
            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="language">Limbă interfață</Label>
                <Select defaultValue="ro">
                  <SelectTrigger id="language">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ro">Română</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="timezone">Fus orar</Label>
                <Select defaultValue="bucharest">
                  <SelectTrigger id="timezone">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bucharest">(UTC+02:00) București</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>
        </CardContent>
      </Card>
    </DashboardShell>
  );
}
