'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { fetchAuthSession } from 'aws-amplify/auth';
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  KeyRound,
  Loader2,
  Mail,
  Save,
  Settings,
  Trash2,
  Upload,
  User,
} from 'lucide-react';
import { AdminViewAsBanner } from '@/components/admin/admin-view-as-banner';
import { ExpertAvatar } from '@/components/expert/expert-avatar';
import { DashboardShell, expertNavItems } from '@/components/layout/dashboard-shell';
import { RightInfoCard } from '@/components/layout/dashboard-primitives';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusBadge } from '@/components/ui/status-badge';
import { Switch } from '@/components/ui/switch';
import { UserMenu } from '@/components/user-menu';
import { useExperts } from '@/hooks/use-backend-data';
import { uploadAuthenticatedData } from '@/lib/authenticated-storage';
import { getSignedInUser } from '@/lib/aws/auth';
import type { AppRole } from '@/lib/aws/auth';
import type { Expert } from '@/lib/types';

type ProfileForm = {
  name: string;
  beneficiary: string;
  positionInProject: string;
  email: string;
  phone: string;
  avatarUrl: string;
};

type NotificationPreferences = {
  emailNotifications: boolean;
  reportingReminder: boolean;
  language: string;
  timezone: string;
};

const DEFAULT_ORGANIZATION = 'CONFEDERATIA PATRONALA CONCORDIA';
const DEFAULT_PREFERENCES: NotificationPreferences = {
  emailNotifications: true,
  reportingReminder: true,
  language: 'ro',
  timezone: 'bucharest',
};

function getProfileForm(expert: Expert | null, fallbackName: string, fallbackEmail?: string | null): ProfileForm {
  return {
    name: expert?.name ?? fallbackName,
    beneficiary: expert?.beneficiary ?? DEFAULT_ORGANIZATION,
    positionInProject: expert?.positionInProject ?? expert?.role ?? 'Expert PEO',
    email: expert?.email ?? fallbackEmail ?? '',
    phone: expert?.phone ?? '',
    avatarUrl: expert?.avatarUrl ?? '',
  };
}

function getPreferencesKey(expertId?: string | null) {
  return expertId ? `peo_profile_preferences_${expertId}` : null;
}

function safeFileName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'avatar.jpg';
}

export default function ExpertProfilePage() {
  const router = useRouter();
  const { experts, isLoading: expertsLoading, mutate: refreshExperts } = useExperts();
  const [signedInUserId, setSignedInUserId] = useState<string | null>(null);
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);
  const [signedInName, setSignedInName] = useState('Expert');
  const [signedInRoles, setSignedInRoles] = useState<AppRole[]>([]);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [form, setForm] = useState<ProfileForm>(() => getProfileForm(null, 'Expert'));
  const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_PREFERENCES);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let isMounted = true;

    getSignedInUser()
      .then((user) => {
        if (!isMounted) return;

        if (!user) {
          setIsAuthLoading(false);
          router.replace('/auth/login?redirectTo=/expert/profil');
          return;
        }

        setSignedInUserId(user.id ?? null);
        setSignedInEmail(user.email ?? null);
        setSignedInName(user.displayName ?? user.email ?? 'Expert');
        setSignedInRoles(user.roles ?? []);
        setIsAuthLoading(false);
      })
      .catch(() => {
        if (!isMounted) return;
        setIsAuthLoading(false);
        router.replace('/auth/login?redirectTo=/expert/profil');
      });

    return () => {
      isMounted = false;
    };
  }, [router]);

  const currentExpert = useMemo(() => {
    const normalizedEmail = signedInEmail?.toLowerCase();
    const normalizedName = signedInName?.toLowerCase();

    return experts.find((expert) => {
      if (signedInUserId && expert.id === signedInUserId) return true;
      if (normalizedEmail && expert.email?.toLowerCase() === normalizedEmail) return true;
      if (normalizedName && expert.name?.toLowerCase() === normalizedName) return true;
      return false;
    }) ?? null;
  }, [experts, signedInEmail, signedInName, signedInUserId]);

  useEffect(() => {
    setForm(getProfileForm(currentExpert, signedInName, signedInEmail));
    setPendingAvatarFile(null);
    setAvatarPreviewUrl(null);
    setSaveMessage(null);
    setSaveError(null);
  }, [currentExpert, signedInEmail, signedInName]);

  useEffect(() => {
    const key = getPreferencesKey(currentExpert?.id ?? signedInUserId);
    if (!key || typeof window === 'undefined') return;

    try {
      const stored = window.localStorage.getItem(key);
      setPreferences(stored ? { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) } : DEFAULT_PREFERENCES);
    } catch {
      setPreferences(DEFAULT_PREFERENCES);
    }
  }, [currentExpert?.id, signedInUserId]);

  const platformRoles = useMemo(() => {
    const expertRoles = currentExpert?.cognitoGroups?.length ? currentExpert.cognitoGroups : signedInRoles;
    const uniqueRoles = Array.from(new Set(expertRoles.map((role) => role.toLowerCase())));
    return uniqueRoles.length > 0 ? uniqueRoles : ['expert'];
  }, [currentExpert, signedInRoles]);

  const roleLabel = currentExpert?.role || 'Expert PEO';
  const organizationLabel = form.beneficiary || DEFAULT_ORGANIZATION;
  const isLoading = isAuthLoading || expertsLoading;
  const canSaveProfile = Boolean(currentExpert?.id) && !isSaving;

  const updateForm = (field: keyof ProfileForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setSaveMessage(null);
    setSaveError(null);
  };

  const handleAvatarFileChange = (file?: File | null) => {
    setSaveMessage(null);
    setSaveError(null);

    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setSaveError('Alege un fisier imagine pentru poza de profil.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setSaveError('Poza de profil trebuie sa aiba maximum 5 MB.');
      return;
    }

    setPendingAvatarFile(file);
    const reader = new FileReader();
    reader.onload = () => setAvatarPreviewUrl(String(reader.result || ''));
    reader.readAsDataURL(file);
  };

  const clearAvatar = () => {
    setPendingAvatarFile(null);
    setAvatarPreviewUrl(null);
    updateForm('avatarUrl', '');
    if (avatarInputRef.current) avatarInputRef.current.value = '';
  };

  const updatePreference = (field: keyof NotificationPreferences, value: boolean | string) => {
    const next = { ...preferences, [field]: value };
    setPreferences(next);
    const key = getPreferencesKey(currentExpert?.id ?? signedInUserId);
    if (key && typeof window !== 'undefined') {
      window.localStorage.setItem(key, JSON.stringify(next));
    }
  };

  const handleSave = async () => {
    if (!currentExpert?.id) {
      setSaveError('Profilul nu poate fi salvat pentru ca expertul curent nu a fost gasit in lista de experti.');
      return;
    }

    setIsSaving(true);
    setSaveMessage(null);
    setSaveError(null);

    try {
      let avatarUrl = form.avatarUrl.trim();
      if (pendingAvatarFile) {
        const extension = pendingAvatarFile.name.split('.').pop()?.toLowerCase() || 'jpg';
        const avatarPath = `profile-photos/${currentExpert.id}/${Date.now()}-${safeFileName(form.name || currentExpert.name)}.${extension}`;
        const uploaded = await uploadAuthenticatedData({
          path: avatarPath,
          data: pendingAvatarFile,
          options: { contentType: pendingAvatarFile.type || 'image/jpeg' },
        }).result;
        avatarUrl = uploaded.path;
      }

      const token = (await fetchAuthSession({ forceRefresh: true })).tokens?.accessToken?.toString();
      if (!token) {
        throw new Error('Sesiunea de autentificare a expirat. Autentifica-te din nou inainte de salvare.');
      }

      const response = await fetch('/api/expert/profile', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          id: currentExpert.id,
          input: {
            name: form.name.trim(),
            email: form.email.trim(),
            phone: form.phone.trim(),
            beneficiary: form.beneficiary.trim(),
            positionInProject: form.positionInProject.trim(),
            avatarUrl,
          },
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.error || 'Profilul nu a putut fi salvat.');
      }
      setForm((current) => ({ ...current, avatarUrl }));
      setPendingAvatarFile(null);
      setAvatarPreviewUrl(null);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
      await refreshExperts();
      setSaveMessage('Profilul a fost actualizat.');
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Profilul nu a putut fi salvat.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <AdminViewAsBanner />
      <DashboardShell
        activeHref="/expert/profil"
        navItems={expertNavItems}
        eyebrow="Modul Expert"
        title="Profil"
        description="Actualizeaza informatiile personale si preferintele contului."
        actions={
          <div className="flex items-center gap-2">
            <Button asChild variant="outline">
              <Link href="/auth/forgot-password">
                <KeyRound className="h-4 w-4" />
                Schimba parola
              </Link>
            </Button>
            <UserMenu />
          </div>
        }
        aside={
          <>
            <RightInfoCard title="Roluri active" icon={User}>
              <div className="space-y-6">
                {platformRoles.map((role) => (
                  <div key={role} className="flex items-start justify-between gap-4">
                    <div className="flex gap-3">
                      <CheckCircle2 className="mt-1 h-5 w-5 text-[#36c2a0]" />
                      <div>
                        <p className="font-bold text-slate-950">
                          {role === 'pm' ? 'PM' : role === 'admin' ? 'Administrator' : 'Expert PEO'}
                        </p>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">
                          {role === 'pm'
                            ? 'Acces la verificari si rapoarte PM.'
                            : role === 'admin'
                              ? 'Acces la administrarea platformei.'
                              : 'Acces la activitati, livrabile si rapoarte.'}
                        </p>
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
              <p className="font-semibold text-slate-950">Sesiune activa</p>
              <p className="mt-4 text-sm text-muted-foreground">
                Datele de autentificare sunt gestionate prin contul Concordia.
              </p>
              <Link href="/auth/select-dashboard" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary">
                Alege zona de lucru
                <ArrowRight className="h-4 w-4" />
              </Link>
            </RightInfoCard>

            <RightInfoCard title="Asistenta cont" icon={Mail}>
              <p className="text-sm leading-6 text-muted-foreground">
                Ai nevoie de ajutor cu contul? Contacteaza echipa de suport Concordia.
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
        {isLoading ? (
          <Card className="rounded-[1.5rem] py-0">
            <CardContent className="flex items-center justify-center gap-3 p-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Se incarca profilul...
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="rounded-[1.5rem] py-0">
              <CardContent className="grid gap-6 p-7 lg:grid-cols-[1fr_320px] lg:items-center">
                <div className="flex flex-col gap-6 md:flex-row md:items-center">
                  <div className="relative">
                    <ExpertAvatar
                      expert={{
                        id: currentExpert?.id || signedInUserId || 'expert',
                        name: form.name || signedInName,
                        avatarUrl: avatarPreviewUrl || form.avatarUrl,
                      }}
                      className="h-32 w-32 text-3xl"
                    />
                    <span className="absolute bottom-2 right-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary text-white shadow-sm">
                      <Upload className="h-5 w-5" />
                    </span>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Poza profil</p>
                    <h2 className="mt-2 text-2xl font-bold text-slate-950">{form.name || 'Expert'}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{form.positionInProject || roleLabel}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <input
                        ref={avatarInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={(event) => handleAvatarFileChange(event.target.files?.[0])}
                      />
                      <Button type="button" variant="outline" size="sm" onClick={() => avatarInputRef.current?.click()}>
                        <Upload className="h-4 w-4" />
                        Incarca poza
                      </Button>
                      {(form.avatarUrl || avatarPreviewUrl) && (
                        <Button type="button" variant="ghost" size="sm" onClick={clearAvatar}>
                          <Trash2 className="h-4 w-4" />
                          Elimina
                        </Button>
                      )}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <StatusBadge status="verificat">Expert</StatusBadge>
                      <StatusBadge status="conform">{organizationLabel}</StatusBadge>
                    </div>
                  </div>
                </div>
                <div className="rounded-[1.25rem] border border-amber-200 bg-[#fff7e6] p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#b7791f]">Badge recunoastere</p>
                  <div className="mt-3 flex items-center gap-3">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-[#b7791f] shadow-sm">
                      <CheckCircle2 className="h-6 w-6" />
                    </span>
                    <div>
                      <p className="text-lg font-bold text-slate-950">Hero of the month</p>
                      <p className="mt-1 text-sm text-muted-foreground">Spatiu pentru badge lunar acordat de echipa PM/Admin.</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-[1.5rem] py-0">
              <CardContent className="space-y-8 p-7">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-slate-950">Informatii profil</h2>
                    <p className="text-sm text-muted-foreground">
                      Datele se incarca pentru expertul curent, inclusiv in modul admin view-as.
                    </p>
                  </div>
                  <Button onClick={handleSave} disabled={!canSaveProfile}>
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Salveaza
                  </Button>
                </div>

                {saveMessage && (
                  <div className="rounded-lg border border-emerald-200 bg-[#e9faf5] px-4 py-3 text-sm font-medium text-[#087a63]">
                    {saveMessage}
                  </div>
                )}
                {saveError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                    {saveError}
                  </div>
                )}

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
                      <Input id="name" value={form.name} onChange={(event) => updateForm('name', event.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="role">Rol in platforma *</Label>
                      <div
                        id="role"
                        className="flex h-10 items-center rounded-xl border border-input bg-slate-50 px-3 text-sm font-medium text-slate-700"
                        aria-label="Rol in platforma"
                      >
                        {roleLabel}
                      </div>
                      <p className="text-xs text-muted-foreground">Rolul este gestionat de administrator.</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="org">Organizatie / beneficiar *</Label>
                      <Input id="org" value={form.beneficiary} onChange={(event) => updateForm('beneficiary', event.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="position">Pozitie in proiect</Label>
                      <Input id="position" value={form.positionInProject} onChange={(event) => updateForm('positionInProject', event.target.value)} />
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
                      <Input id="email" type="email" value={form.email} onChange={(event) => updateForm('email', event.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Telefon</Label>
                      <Input id="phone" value={form.phone} onChange={(event) => updateForm('phone', event.target.value)} />
                    </div>
                  </div>
                </section>

                <section className="border-t border-slate-100 pt-6">
                  <h2 className="mb-4 flex items-center gap-3 font-bold text-slate-950">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#eaf3fb] text-primary">
                      <Settings className="h-4 w-4" />
                    </span>
                    3. Preferinte notificari
                  </h2>
                  <div className="divide-y divide-slate-100">
                    {[
                      {
                        key: 'emailNotifications' as const,
                        title: 'Notificari prin email',
                        description: 'Primeste notificari pentru activitati, aprobari si rapoarte.',
                      },
                      {
                        key: 'reportingReminder' as const,
                        title: 'Reminder raportare',
                        description: 'Primeste remindere pentru activitatile si rapoartele lunare.',
                      },
                    ].map((item) => (
                      <div key={item.key} className="flex items-center justify-between gap-4 py-4">
                        <div className="flex items-center gap-4">
                          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#eaf3fb] text-primary">
                            <Mail className="h-5 w-5" />
                          </span>
                          <div>
                            <p className="font-semibold text-slate-950">{item.title}</p>
                            <p className="text-sm text-muted-foreground">{item.description}</p>
                          </div>
                        </div>
                        <Switch
                          checked={preferences[item.key]}
                          onCheckedChange={(checked) => updatePreference(item.key, checked)}
                        />
                      </div>
                    ))}
                  </div>
                </section>

                <section className="border-t border-slate-100 pt-6">
                  <h2 className="mb-4 flex items-center gap-3 font-bold text-slate-950">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#eaf3fb] text-primary">
                      <Settings className="h-4 w-4" />
                    </span>
                    4. Acces in platforma
                  </h2>
                  <div className="grid gap-5 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="language">Limba interfata</Label>
                      <Select value={preferences.language} onValueChange={(value) => updatePreference('language', value)}>
                        <SelectTrigger id="language">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ro">Romana</SelectItem>
                          <SelectItem value="en">English</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="timezone">Fus orar</Label>
                      <Select value={preferences.timezone} onValueChange={(value) => updatePreference('timezone', value)}>
                        <SelectTrigger id="timezone">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="bucharest">(UTC+02:00) Bucuresti</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </section>
              </CardContent>
            </Card>
          </>
        )}
      </DashboardShell>
    </>
  );
}
