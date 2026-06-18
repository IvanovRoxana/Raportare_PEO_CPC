'use client';

import { useEffect, useMemo, useState } from 'react';
import { auditLogsService, expertsService } from '@/lib/backend-store';
import type { Expert } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { requestPasswordReset, getSignedInUser, signUpWithEmail } from '@/lib/aws/auth';
import { expertIdentityKey } from '@/lib/expert-merge';

type RoleOption = 'Expert' | 'PM' | 'Expert/PM' | 'Admin';

function buildExpertCreateInput(expert: Expert, updates: Partial<Expert>): Omit<Expert, 'id'> {
  return {
    userId: expert.userId,
    name: updates.name || expert.name,
    role: updates.role || expert.role || 'Expert',
    email: updates.email ?? expert.email,
    phone: updates.phone ?? expert.phone,
    category: updates.category ?? expert.category,
    norma: updates.norma ?? expert.norma ?? 8,
    normType: updates.normType ?? expert.normType,
    oreZi: updates.oreZi ?? expert.oreZi,
    dailyHours: updates.dailyHours ?? expert.dailyHours,
    manualMonthlyNorm: updates.manualMonthlyNorm ?? expert.manualMonthlyNorm,
    projectMonthlyNorm: updates.projectMonthlyNorm ?? expert.projectMonthlyNorm,
    positionInProject: updates.positionInProject ?? expert.positionInProject,
    projectCode: updates.projectCode ?? expert.projectCode,
    projectTitle: updates.projectTitle ?? expert.projectTitle,
    beneficiary: updates.beneficiary ?? expert.beneficiary,
    saCodes: updates.saCodes ?? expert.saCodes ?? [],
    hasPmAccess: updates.hasPmAccess ?? expert.hasPmAccess ?? false,
    cognitoGroups: updates.cognitoGroups ?? expert.cognitoGroups,
    isActive: updates.isActive ?? expert.isActive ?? true,
  };
}

export function UsersRolesManagementPanel() {
  const [experts, setExperts] = useState<Expert[]>([]);
  const [persistedExpertsByKey, setPersistedExpertsByKey] = useState<Map<string, Expert>>(() => new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<RoleOption>('Expert');

  const admins = useMemo(() => experts.filter((e) => e.role.toLowerCase().includes('admin')), [experts]);


  function generateTemporaryPassword() {
    return `Tmp!${Math.random().toString(36).slice(2, 8)}9Aa`;
  }

  async function loadExperts() {
    setLoading(true);
    setError(null);
    try {
      const [mergedExperts, backendExperts] = await Promise.all([
        expertsService.getAll({ includeInactive: true }),
        expertsService.getAll({ includeInactive: true, includeFallback: false }),
      ]);
      setExperts(mergedExperts);
      setPersistedExpertsByKey(new Map(backendExperts.map((expert) => [expertIdentityKey(expert), expert])));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nu am putut încărca utilizatorii.');
    } finally {
      setLoading(false);
    }
  }

  function isPersistedExpert(expert: Expert) {
    return persistedExpertsByKey.has(expertIdentityKey(expert));
  }

  function getPersistedExpertId(expert: Expert) {
    return persistedExpertsByKey.get(expertIdentityKey(expert))?.id ?? expert.id;
  }

  useEffect(() => {
    loadExperts();
  }, []);

  async function handleInvite() {
    if (!name.trim() || !email.trim()) {
      setError('Numele și email-ul sunt obligatorii pentru invitare.');
      return;
    }

    setSaving(true);
    setError(null);
    setOk(null);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const tempPassword = generateTemporaryPassword();
      try {
        await signUpWithEmail(normalizedEmail, tempPassword, name.trim());
      } catch (signupError) {
        const message = signupError instanceof Error ? signupError.message : String(signupError || '');
        if (!/exists|already|UsernameExistsException/i.test(message)) {
          throw signupError;
        }
      }

      try {
        await requestPasswordReset(normalizedEmail);
      } catch {
        // If reset flow is not yet available for unconfirmed users, we still continue with profile provisioning.
      }

      await expertsService.create({
        name: name.trim(),
        email: normalizedEmail,
        role,
        norma: 8,
        isActive: true,
        hasPmAccess: role.includes('PM'),
        saCodes: [],
      });
      const actor = await getSignedInUser({ ignoreViewAs: true });
      await auditLogsService.create({
        actionType: 'user_invited',
        actorId: actor?.id || 'admin-ui',
        actorName: actor?.displayName || actor?.email || 'Admin',
        actorRole: (actor?.roles || ['admin']).join(','),
        affectedExpertName: name.trim(),
        fieldName: 'cognito_onboarding',
        oldValue: 'none',
        newValue: 'created_and_invited',
        justification: 'Invitare utilizator cu onboarding Cognito și profil Expert.',
        source: 'manual',
      });
      setOk('Utilizator invitat: profilul a fost creat, iar fluxul Cognito (signup/reset) a fost inițiat pe email.');
      setName('');
      setEmail('');
      setRole('Expert');
      await loadExperts();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invitarea a eșuat.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSetRole(expert: Expert, nextRole: RoleOption) {
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      const updates = {
        role: nextRole,
        hasPmAccess: nextRole.includes('PM'),
      };
      if (isPersistedExpert(expert)) {
        await expertsService.update(getPersistedExpertId(expert), updates);
      } else {
        await expertsService.create(buildExpertCreateInput(expert, updates));
      }
      setOk(`Rol actualizat pentru ${expert.name}.`);
      await loadExperts();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Atribuirea rolului a eșuat.');
    } finally {
      setSaving(false);
    }
  }



  async function handlePasswordReset(expert: Expert) {
    if (!expert.email) {
      setError(`Utilizatorul ${expert.name} nu are email configurat.`);
      return;
    }

    setSaving(true);
    setError(null);
    setOk(null);

    try {
      await requestPasswordReset(expert.email);
      const actor = await getSignedInUser({ ignoreViewAs: true });
      await auditLogsService.create({
        actionType: 'password_reset_requested',
        actorId: actor?.id || 'admin-ui',
        actorName: actor?.displayName || actor?.email || 'Admin',
        actorRole: (actor?.roles || ['admin']).join(','),
        affectedExpertId: expert.id,
        affectedExpertName: expert.name,
        fieldName: 'password_reset',
        oldValue: 'none',
        newValue: 'reset_code_sent',
        justification: 'Resetare parolă solicitată din modulul admin.',
        source: 'manual',
      });
      setOk(`Codul de resetare a fost trimis pe email către ${expert.email}. Acțiunea a fost auditată.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Resetarea parolei a eșuat.');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(expert: Expert) {
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      const updates = { isActive: !(expert.isActive ?? true) };
      if (isPersistedExpert(expert)) {
        await expertsService.update(getPersistedExpertId(expert), updates);
      } else {
        await expertsService.create(buildExpertCreateInput(expert, updates));
      }
      setOk(`${expert.name} a fost ${(expert.isActive ?? true) ? 'dezactivat' : 'reactivat'}.`);
      await loadExperts();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Actualizarea statusului a eșuat.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="rounded-lg border-primary/25">
      <CardHeader>
        <CardTitle className="text-lg">Utilizatori și roluri · AWS</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">Administrare utilizatori, roluri și permisiuni pe module (expert, PM, financiar, audit).</p>

        <div className="grid gap-3 md:grid-cols-4">
          <Input placeholder="Nume utilizator" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <select className="h-10 rounded-md border bg-background px-3 text-sm" value={role} onChange={(e) => setRole(e.target.value as RoleOption)}>
            <option>Expert</option><option>PM</option><option>Expert/PM</option><option>Admin</option>
          </select>
          <Button onClick={handleInvite} disabled={saving}>Invitare utilizator</Button>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {ok ? <p className="text-sm text-emerald-700">{ok}</p> : null}

        <div className="rounded-md border p-3 text-sm">
          <p className="font-medium">Atribuire rol / Dezactivare cont</p>
          {loading ? <p className="mt-2 text-muted-foreground">Se încarcă utilizatorii...</p> : null}
          <div className="mt-3 space-y-2">
            {experts.map((expert) => (
              <div key={expert.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2">
                <div>
                  <p className="font-medium">{expert.name}</p>
                  <p className="text-xs text-muted-foreground">{expert.email || 'fără email'} · {expert.role}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {(expert.isActive ?? true) ? <Badge>Activ</Badge> : <Badge variant="outline">Dezactivat</Badge>}
                  <select className="h-9 rounded-md border bg-background px-2 text-sm" value={expert.role} onChange={(e) => handleSetRole(expert, e.target.value as RoleOption)} disabled={saving}>
                    <option>Expert</option><option>PM</option><option>Expert/PM</option><option>Admin</option>
                  </select>
                  <Button variant="outline" onClick={() => handlePasswordReset(expert)} disabled={saving}>
                    Resetare parolă
                  </Button>
                  <Button variant="outline" onClick={() => handleToggleActive(expert)} disabled={saving}>
                    {(expert.isActive ?? true) ? 'Dezactivare cont' : 'Reactivare cont'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Utilizatori listați: {experts.length}. Admini detectați: {admins.length}. Schimbările sunt persistate în AWS Data (model Expert).
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
