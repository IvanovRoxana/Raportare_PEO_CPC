'use client';

import { useEffect, useMemo, useState } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import {
  CheckCircle2,
  Edit2,
  Filter,
  Lock,
  MessageSquare,
  MoreHorizontal,
  RotateCcw,
  SearchIcon,
  Trash2,
} from 'lucide-react';
import { auditLogsService, expertsService } from '@/lib/backend-store';
import { getSignedInUser, requestPasswordReset } from '@/lib/aws/auth';
import type { Expert } from '@/lib/types';
import { DataTable } from '@/components/layout/dashboard-primitives';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusBadge } from '@/components/ui/status-badge';
import { Textarea } from '@/components/ui/textarea';
import { expertIdentityKey } from '@/lib/expert-merge';
import { syncOrInviteCognitoGroupsForUser } from '@/lib/admin-cognito';
import { cognitoGroupsForRole } from '@/lib/cognito-roles';

type RoleOption = 'Expert' | 'PM' | 'Expert/PM' | 'Admin';

type EditFormState = {
  name: string;
  email: string;
  phone: string;
  role: RoleOption;
  norma: string;
  category: string;
  contract: string;
  expertExperienceCategory: string;
  beneficiary: string;
  projectCode: string;
  positionInProject: string;
  aiReportingInstructions: string;
  hasPmAccess: boolean;
  isActive: boolean;
};

const roleOptions: RoleOption[] = ['Expert', 'PM', 'Expert/PM', 'Admin'];

const roleStatus = {
  Admin: 'in_lucru',
  Administrator: 'in_lucru',
  Manager: 'verificat',
  Expert: 'draft',
  PM: 'cu_observatii',
  'Expert/PM': 'cu_observatii',
  Utilizator: 'informativ',
} as const;

function initialsFromName(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function organizationForExpert(expert: Expert) {
  return expert.beneficiary || expert.projectCode || expert.category || 'Nespecificat';
}

function formatDateTime(value?: string) {
  if (!value) return 'Nu este disponibil';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('ro-RO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function normalizeRole(value?: string): RoleOption {
  if (value === 'Admin' || value === 'PM' || value === 'Expert/PM' || value === 'Expert') {
    return value;
  }

  if (value?.toLowerCase().includes('admin')) return 'Admin';
  if (value?.toLowerCase().includes('pm') && value?.toLowerCase().includes('expert')) return 'Expert/PM';
  if (value?.toLowerCase().includes('pm')) return 'PM';
  return 'Expert';
}

function buildEditForm(expert: Expert): EditFormState {
  const role = normalizeRole(expert.role);

  return {
    name: expert.name || '',
    email: expert.email || '',
    phone: expert.phone || '',
    role,
    norma: String(expert.norma ?? 8),
    category: expert.category || '',
    contract: formatContractDisplay(expert),
    expertExperienceCategory: expert.expertExperienceCategory || '',
    beneficiary: expert.beneficiary || '',
    projectCode: expert.projectCode || '',
    positionInProject: expert.positionInProject || '',
    aiReportingInstructions: expert.aiReportingInstructions || '',
    hasPmAccess: expert.hasPmAccess ?? (role.includes('PM') || role === 'Admin'),
    isActive: expert.isActive ?? true,
  };
}

function formatContractDisplay(expert: Pick<Expert, 'contractNumber' | 'contractType'>) {
  return [expert.contractType, expert.contractNumber].filter(Boolean).join(' ').trim();
}

function parseContractDisplay(value: string) {
  const contract = value.trim();
  if (!contract) return { contractNumber: '', contractType: '' };

  const knownTypeMatch = contract.match(/^(CIM|PFA|SRL|CPS|PS|contract(?:ul)?(?: de)? prestari servicii)\b[\s:,-]*(.*)$/i);
  if (!knownTypeMatch) return { contractNumber: contract, contractType: '' };

  return {
    contractType: knownTypeMatch[1].trim(),
    contractNumber: knownTypeMatch[2].trim(),
  };
}

function shouldSyncCognitoGroupsForProfileSave(expert: Expert, form: EditFormState) {
  const currentRole = normalizeRole(expert.role);
  const currentHasPmAccess = expert.hasPmAccess ?? (currentRole.includes('PM') || currentRole === 'Admin');
  const nextHasPmAccess = form.hasPmAccess || form.role === 'Admin';
  const currentEmail = String(expert.email || '').trim().toLowerCase();
  const nextEmail = form.email.trim().toLowerCase();

  return currentRole !== form.role || currentHasPmAccess !== nextHasPmAccess || currentEmail !== nextEmail;
}

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
    contractNumber: updates.contractNumber ?? expert.contractNumber,
    contractType: updates.contractType ?? expert.contractType,
    expertExperienceCategory: updates.expertExperienceCategory ?? expert.expertExperienceCategory,
    aiReportingInstructions: updates.aiReportingInstructions ?? expert.aiReportingInstructions,
    beneficiary: updates.beneficiary ?? expert.beneficiary,
    saCodes: updates.saCodes ?? expert.saCodes ?? [],
    hasPmAccess: updates.hasPmAccess ?? expert.hasPmAccess ?? false,
    cognitoGroups: updates.cognitoGroups ?? expert.cognitoGroups,
    isActive: updates.isActive ?? expert.isActive ?? true,
  };
}

function auditProfileValue(expert: Expert | (Partial<Expert> & { name?: string; role?: string })) {
  return JSON.stringify({
    name: expert.name || '',
    email: expert.email || '',
    phone: expert.phone || '',
    role: expert.role || '',
    norma: expert.norma ?? '',
    category: expert.category || '',
    contractNumber: expert.contractNumber || '',
    contractType: expert.contractType || '',
    expertExperienceCategory: expert.expertExperienceCategory || '',
    beneficiary: expert.beneficiary || '',
    projectCode: expert.projectCode || '',
    positionInProject: expert.positionInProject || '',
    aiReportingInstructions: expert.aiReportingInstructions || '',
    hasPmAccess: expert.hasPmAccess ?? false,
    isActive: expert.isActive ?? true,
  });
}

async function createUserAudit(input: {
  actionType: string;
  expert: Expert;
  fieldName: string;
  oldValue: string;
  newValue: string;
  justification: string;
}) {
  const actor = await getSignedInUser({ ignoreViewAs: true });

  await auditLogsService.create({
    actionType: input.actionType,
    actorId: actor?.id || 'admin-ui',
    actorName: actor?.displayName || actor?.email || 'Admin',
    actorRole: (actor?.roles || ['admin']).join(','),
    affectedExpertId: input.expert.id,
    affectedExpertName: input.expert.name,
    fieldName: input.fieldName,
    oldValue: input.oldValue,
    newValue: input.newValue,
    justification: input.justification,
    source: 'manual',
  });
}

async function tryCreateUserAudit(input: Parameters<typeof createUserAudit>[0]) {
  try {
    await createUserAudit(input);
  } catch (error) {
    console.warn('Auditul actiunii de administrare nu a putut fi salvat.', error);
  }
}

async function refreshAdminAuthSession() {
  await fetchAuthSession({ forceRefresh: true });
}

async function callAdminExpertWrite(
  action: 'create' | 'update',
  input: Partial<Expert> | Omit<Expert, 'id'>,
  id?: string,
) {
  const token = (await fetchAuthSession({ forceRefresh: true })).tokens?.accessToken?.toString();
  if (!token) {
    throw new Error('Nu am gasit sesiunea Cognito a administratorului curent.');
  }

  const response = await fetch('/api/admin/experts', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ action, id, input }),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.error || 'Administrarea expertului a esuat.');
  }

  return body?.data as Expert;
}

function formatAdminWriteError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : String(error || '');
  if (/Doar administratorii pot administra|drept de administrare pentru experti/i.test(message)) {
    return [
      'Scriere refuzata de backend: utilizatorul autentificat nu are drept de administrare pentru experti.',
      'Verifica daca esti logata cu contul de administrator si reincearca.',
    ].join(' ');
  }
  if (/AccessDeniedException|not authorized to perform|access denied/i.test(message)) {
    if (/Cognito|grupuri/i.test(message)) {
      return [
        'Profilul nu a putut sincroniza rolurile Cognito: backendul nu are permisiunile AWS necesare pentru administrarea grupurilor.',
        `Detaliu tehnic: ${message}`,
      ].join(' ');
    }
    return `Operatia AWS a fost refuzata de configurarea serviciului: ${message}`;
  }
  return message || fallback;
}

export function AdminUsersTable() {
  const [experts, setExperts] = useState<Expert[]>([]);
  const [persistedExpertsByKey, setPersistedExpertsByKey] = useState<Map<string, Expert>>(() => new Map());
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [organizationFilter, setOrganizationFilter] = useState('all');
  const [editingExpert, setEditingExpert] = useState<Expert | null>(null);
  const [editingInstructionsExpert, setEditingInstructionsExpert] = useState<Expert | null>(null);
  const [instructionsDraft, setInstructionsDraft] = useState('');
  const [form, setForm] = useState<EditFormState | null>(null);

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
      setError(e instanceof Error ? e.message : 'Nu am putut incarca utilizatorii.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadExperts();
  }, []);

  const liveUsers = useMemo(
    () =>
      experts.map((expert) => ({
        kind: 'expert' as const,
        expert,
        id: expert.id,
        name: expert.name,
        email: expert.email || 'fara email',
        role: normalizeRole(expert.role),
        organization: organizationForExpert(expert),
        status: (expert.isActive ?? true) ? 'Activ' : 'Inactiv',
        lastAccess: formatDateTime(expert.updatedAt || expert.createdAt),
        initials: initialsFromName(expert.name),
      })),
    [experts],
  );

  const users = liveUsers;

  const organizationOptions = useMemo(
    () => Array.from(new Set(users.map((user) => user.organization).filter(Boolean))).sort(),
    [users],
  );

  const filteredUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return users.filter((user) => {
      const matchesQuery =
        !normalizedQuery ||
        [user.name, user.email, user.organization].some((value) => value.toLowerCase().includes(normalizedQuery));
      const matchesRole = roleFilter === 'all' || user.role === roleFilter;
      const matchesOrganization = organizationFilter === 'all' || user.organization === organizationFilter;

      return matchesQuery && matchesRole && matchesOrganization;
    });
  }, [organizationFilter, query, roleFilter, users]);

  function openEditDialog(expert: Expert) {
    setEditingExpert(expert);
    setForm(buildEditForm(expert));
    setError(null);
    setOk(null);
  }

  function openInstructionsDialog(expert: Expert) {
    setEditingInstructionsExpert(expert);
    setInstructionsDraft(expert.aiReportingInstructions || '');
    setError(null);
    setOk(null);
  }

  function isPersistedExpert(expert: Expert) {
    return persistedExpertsByKey.has(expertIdentityKey(expert));
  }

  function getPersistedExpertId(expert: Expert) {
    return persistedExpertsByKey.get(expertIdentityKey(expert))?.id ?? expert.id;
  }

  async function handleSaveProfile() {
    if (!editingExpert || !form) return;

    if (!form.name.trim()) {
      setError('Numele utilizatorului este obligatoriu.');
      return;
    }

    const norma = Number(form.norma);
    if (!Number.isFinite(norma) || norma <= 0) {
      setError('Norma trebuie sa fie un numar pozitiv.');
      return;
    }

    setSavingId(editingExpert.id);
    setError(null);
    setOk(null);

    const contractFields = parseContractDisplay(form.contract);
    const updates: Partial<Expert> = {
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      role: form.role,
      norma,
      category: form.category.trim(),
      contractNumber: contractFields.contractNumber,
      contractType: contractFields.contractType,
      expertExperienceCategory: form.expertExperienceCategory.trim(),
      beneficiary: form.beneficiary.trim(),
      projectCode: form.projectCode.trim(),
      positionInProject: form.positionInProject.trim(),
      hasPmAccess: form.hasPmAccess,
      isActive: form.isActive,
    };
    const cognitoGroups = cognitoGroupsForRole(form.role, form.hasPmAccess || form.role === 'Admin');
    updates.cognitoGroups = cognitoGroups;
    const shouldSyncCognitoGroups = !isPersistedExpert(editingExpert)
      || shouldSyncCognitoGroupsForProfileSave(editingExpert, form);

    try {
      await refreshAdminAuthSession();
      if (shouldSyncCognitoGroups) {
        await syncOrInviteCognitoGroupsForUser(updates.email, cognitoGroups, updates.name);
        await refreshAdminAuthSession();
      }

      const savedExpert = isPersistedExpert(editingExpert)
        ? await callAdminExpertWrite('update', updates, getPersistedExpertId(editingExpert))
        : await callAdminExpertWrite('create', buildExpertCreateInput(editingExpert, updates));

      await tryCreateUserAudit({
        actionType: 'user_profile_updated',
        expert: savedExpert,
        fieldName: 'profile',
        oldValue: auditProfileValue(editingExpert),
        newValue: auditProfileValue({ ...savedExpert, ...updates }),
        justification: 'Profil utilizator actualizat din panoul de administrare.',
      });

      setOk(`Profilul pentru ${updates.name} a fost actualizat.`);
      setEditingExpert(null);
      setForm(null);
      await loadExperts();
    } catch (e) {
      setError(formatAdminWriteError(e, 'Actualizarea profilului a esuat.'));
    } finally {
      setSavingId(null);
    }
  }

  async function handleSaveInstructions() {
    if (!editingInstructionsExpert) return;

    setSavingId(editingInstructionsExpert.id);
    setError(null);
    setOk(null);

    const nextInstructions = instructionsDraft.trim();

    try {
      await refreshAdminAuthSession();
      const expertIsPersisted = isPersistedExpert(editingInstructionsExpert);
      const savedExpert = expertIsPersisted
        ? await callAdminExpertWrite('update', {
            aiReportingInstructions: nextInstructions,
          }, getPersistedExpertId(editingInstructionsExpert))
        : await callAdminExpertWrite('create', buildExpertCreateInput(editingInstructionsExpert, {
            aiReportingInstructions: nextInstructions,
          }));

      await tryCreateUserAudit({
        actionType: 'user_ai_reporting_instructions_updated',
        expert: savedExpert,
        fieldName: 'aiReportingInstructions',
        oldValue: editingInstructionsExpert.aiReportingInstructions || '',
        newValue: nextInstructions,
        justification: 'Instructiuni AI pentru raportare actualizate din panoul de administrare.',
      });

      setOk(`Instructiunile AI pentru ${editingInstructionsExpert.name} au fost actualizate.`);
      setEditingInstructionsExpert(null);
      setInstructionsDraft('');
      await loadExperts();
    } catch (e) {
      setError(formatAdminWriteError(e, 'Actualizarea instructiunilor AI a esuat.'));
    } finally {
      setSavingId(null);
    }
  }

  async function handlePasswordReset(expert: Expert) {
    if (!expert.email) {
      setError(`Utilizatorul ${expert.name} nu are email configurat.`);
      return;
    }

    setSavingId(expert.id);
    setError(null);
    setOk(null);

    try {
      await requestPasswordReset(expert.email);
      await createUserAudit({
        actionType: 'password_reset_requested',
        expert,
        fieldName: 'password_reset',
        oldValue: 'none',
        newValue: 'reset_code_sent',
        justification: 'Resetare parola solicitata din panoul principal de administrare.',
      });
      setOk(`Codul de resetare a fost trimis pe email catre ${expert.email}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Resetarea parolei a esuat.');
    } finally {
      setSavingId(null);
    }
  }

  async function handleToggleActive(expert: Expert) {
    const nextActive = !(expert.isActive ?? true);

    setSavingId(expert.id);
    setError(null);
    setOk(null);

    try {
      const savedExpert = isPersistedExpert(expert)
        ? await callAdminExpertWrite('update', { isActive: nextActive }, getPersistedExpertId(expert))
        : await callAdminExpertWrite('create', buildExpertCreateInput(expert, { isActive: nextActive }));

      await createUserAudit({
        actionType: nextActive ? 'user_profile_reactivated' : 'user_profile_deactivated',
        expert: savedExpert,
        fieldName: 'isActive',
        oldValue: String(expert.isActive ?? true),
        newValue: String(nextActive),
        justification: nextActive
          ? 'Profil utilizator reactivat din panoul de administrare.'
          : 'Profil utilizator dezactivat din panoul de administrare.',
      });
      setOk(`${expert.name} a fost ${nextActive ? 'reactivat' : 'dezactivat'}.`);
      await loadExperts();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Actualizarea statusului a esuat.');
    } finally {
      setSavingId(null);
    }
  }

  async function handleDeleteProfile(expert: Expert) {
    const confirmed = window.confirm(
      `Stergi profilul pentru ${expert.name}? Profilul va fi dezactivat si pastrat in audit pentru istoricul raportarilor.`,
    );
    if (!confirmed) return;

    setSavingId(expert.id);
    setError(null);
    setOk(null);

    try {
      const savedExpert = isPersistedExpert(expert)
        ? await callAdminExpertWrite('update', { isActive: false }, getPersistedExpertId(expert))
        : await callAdminExpertWrite('create', buildExpertCreateInput(expert, { isActive: false }));

      await createUserAudit({
        actionType: 'user_profile_deleted',
        expert: savedExpert,
        fieldName: 'isActive',
        oldValue: String(expert.isActive ?? true),
        newValue: 'false',
        justification: 'Stergere profil utilizator din panoul de administrare; profilul este dezactivat pentru pastrarea istoricului.',
      });
      setOk(`Profilul pentru ${expert.name} a fost dezactivat.`);
      await loadExperts();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Stergerea profilului a esuat.');
    } finally {
      setSavingId(null);
    }
  }

  const rows = filteredUsers.map((user) => [
    <div key={`${user.name}-name`} className="flex items-center gap-3 font-semibold text-primary">
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#eaf3fb] text-xs">
        {user.initials}
      </span>
      <span className="max-w-[220px] leading-5">{user.name}</span>
    </div>,
    user.email,
    <StatusBadge key={`${user.name}-role`} status={roleStatus[user.role as keyof typeof roleStatus] ?? 'informativ'}>
      {user.role}
    </StatusBadge>,
    user.organization,
    <StatusBadge key={`${user.name}-status`} status={user.status === 'Activ' ? 'deschisa' : 'inchisa'}>
      {user.status}
    </StatusBadge>,
    user.lastAccess,
    user.kind === 'expert' ? (
      <DropdownMenu key={`${user.id}-action`}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Actiuni ${user.name}`}
            disabled={savingId === user.id}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Actiuni profil</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => openEditDialog(user.expert)}>
            <Edit2 className="h-4 w-4" />
            Editeaza profil
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => handlePasswordReset(user.expert)}>
            <RotateCcw className="h-4 w-4" />
            Resetare parola
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => handleToggleActive(user.expert)}>
            {(user.expert.isActive ?? true) ? <Lock className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
            {(user.expert.isActive ?? true) ? 'Dezactiveaza cont' : 'Reactiveaza cont'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => handleDeleteProfile(user.expert)}>
            <Trash2 className="h-4 w-4" />
            Sterge profil
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ) : (
      <Button key={`${user.name}-action`} variant="ghost" size="icon" aria-label={`Actiuni ${user.name}`} disabled>
        <MoreHorizontal className="h-4 w-4" />
      </Button>
    ),
  ]);

  return (
    <>
      <div className="grid gap-3 border-b border-slate-100 p-6 lg:grid-cols-[1.4fr_0.85fr_0.85fr_auto]">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Cauta dupa nume, email sau organizatie..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Toate rolurile" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toate rolurile</SelectItem>
            {roleOptions.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={organizationFilter} onValueChange={setOrganizationFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Toate organizatiile" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toate organizatiile</SelectItem>
            {organizationOptions.map((organization) => (
              <SelectItem key={organization} value={organization}>
                {organization}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          onClick={() => {
            setQuery('');
            setRoleFilter('all');
            setOrganizationFilter('all');
          }}
        >
          <Filter className="h-4 w-4" />
          Filtreaza
        </Button>
      </div>

      <div className="space-y-2 px-6 pt-4">
        {loading ? <p className="text-sm text-muted-foreground">Se incarca utilizatorii din AWS...</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {ok ? <p className="text-sm text-emerald-700">{ok}</p> : null}
        {!loading && liveUsers.length === 0 ? (
          <p className="text-sm text-amber-700">
            Nu am gasit utilizatori reali in backend.
          </p>
        ) : null}
      </div>

      <DataTable
        className="rounded-none border-0 shadow-none"
        columns={['Nume', 'Email', 'Rol', 'Organizatie', 'Status', 'Ultima actualizare', 'Actiuni']}
        rows={rows}
        footer={
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>
              Afisare {filteredUsers.length} din {users.length} utilizatori
            </span>
            <Button variant="outline" size="sm" onClick={loadExperts} disabled={loading || savingId !== null}>
              Reincarca
            </Button>
          </div>
        }
      />

      <Dialog open={Boolean(editingExpert && form)} onOpenChange={(open) => {
        if (!open) {
          setEditingExpert(null);
          setForm(null);
        }
      }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editeaza profil utilizator</DialogTitle>
            <DialogDescription>
              Actualizeaza datele profilului folosit in modulele de raportare si administrare.
            </DialogDescription>
          </DialogHeader>

          {form ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2 rounded-md border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-900">Instructiuni AI pentru raportare</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {editingExpert?.aiReportingInstructions?.trim()
                        ? 'Prompt PM/Admin configurat pentru generarea descrierilor.'
                        : 'Nu exista instructiuni AI dedicate pentru acest expert.'}
                    </p>
                  </div>
                  {editingExpert && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => openInstructionsDialog(editingExpert)}
                    >
                      <MessageSquare className="h-4 w-4" />
                      Instructiuni AI pentru raportare
                    </Button>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-user-name">Nume</Label>
                <Input
                  id="admin-user-name"
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-user-email">Email</Label>
                <Input
                  id="admin-user-email"
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-user-phone">Telefon</Label>
                <Input
                  id="admin-user-phone"
                  value={form.phone}
                  onChange={(event) => setForm({ ...form, phone: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Rol</Label>
                <Select
                  value={form.role}
                  onValueChange={(value) =>
                    setForm({
                      ...form,
                      role: value as RoleOption,
                      hasPmAccess: value.includes('PM') || value === 'Admin' || form.hasPmAccess,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Rol utilizator" />
                  </SelectTrigger>
                  <SelectContent>
                    {roleOptions.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-user-norma">Norma zilnica</Label>
                <Input
                  id="admin-user-norma"
                  type="number"
                  min="0"
                  step="0.5"
                  value={form.norma}
                  onChange={(event) => setForm({ ...form, norma: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-user-category">Categorie</Label>
                <Input
                  id="admin-user-category"
                  value={form.category}
                  onChange={(event) => setForm({ ...form, category: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-user-contract">Nr. si tipul contractului</Label>
                <Input
                  id="admin-user-contract"
                  placeholder="Ex: CIM 12/2026"
                  value={form.contract}
                  onChange={(event) => setForm({ ...form, contract: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-user-expert-experience-category">Categorie expert Anexa 10</Label>
                <Input
                  id="admin-user-expert-experience-category"
                  placeholder="Ex: expert senior"
                  value={form.expertExperienceCategory}
                  onChange={(event) => setForm({ ...form, expertExperienceCategory: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-user-beneficiary">Organizatie / beneficiar</Label>
                <Input
                  id="admin-user-beneficiary"
                  value={form.beneficiary}
                  onChange={(event) => setForm({ ...form, beneficiary: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-user-project-code">Cod proiect</Label>
                <Input
                  id="admin-user-project-code"
                  value={form.projectCode}
                  onChange={(event) => setForm({ ...form, projectCode: event.target.value })}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="admin-user-position">Pozitie in proiect</Label>
                <Input
                  id="admin-user-position"
                  value={form.positionInProject}
                  onChange={(event) => setForm({ ...form, positionInProject: event.target.value })}
                />
              </div>
              <label className="flex items-center gap-2 text-sm font-medium">
                <Checkbox
                  checked={form.hasPmAccess}
                  onCheckedChange={(checked) => setForm({ ...form, hasPmAccess: checked === true })}
                />
                Acces PM
              </label>
              <label className="flex items-center gap-2 text-sm font-medium">
                <Checkbox
                  checked={form.isActive}
                  onCheckedChange={(checked) => setForm({ ...form, isActive: checked === true })}
                />
                Cont activ
              </label>
            </div>
          ) : null}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditingExpert(null);
                setForm(null);
              }}
            >
              Anuleaza
            </Button>
            <Button onClick={handleSaveProfile} disabled={!editingExpert || savingId === editingExpert.id}>
              Salveaza modificarile
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingInstructionsExpert)} onOpenChange={(open) => {
        if (!open) {
          setEditingInstructionsExpert(null);
          setInstructionsDraft('');
        }
      }}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Instructiuni AI pentru raportare</DialogTitle>
            <DialogDescription>
              Configureaza promptul PM/Admin folosit la generarea descrierilor pentru expert.
            </DialogDescription>
          </DialogHeader>

          {editingInstructionsExpert ? (
            <div className="space-y-4">
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
                <div className="font-medium text-slate-900">{editingInstructionsExpert.name}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {editingInstructionsExpert.positionInProject || editingInstructionsExpert.role}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-user-ai-reporting-instructions">Prompt PM/Admin</Label>
                <Textarea
                  id="admin-user-ai-reporting-instructions"
                  value={instructionsDraft}
                  onChange={(event) => setInstructionsDraft(event.target.value)}
                  rows={12}
                  placeholder="Ex: Pentru acest expert, descrierile trebuie sa sublinieze analiza de politici publice, sinteza pentru membri si formularea de recomandari. Evita formulari despre organizare evenimente daca livrabilul nu sustine explicit acest lucru."
                />
                <p className="text-xs text-muted-foreground">
                  Aceste instructiuni ajusteaza stilul si accentul descrierii. Nu pot suprascrie scopul SA, catalogul Admin, eligibilitatea sau continutul livrabilelor.
                </p>
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditingInstructionsExpert(null);
                setInstructionsDraft('');
              }}
            >
              Anuleaza
            </Button>
            <Button onClick={handleSaveInstructions} disabled={!editingInstructionsExpert || savingId === editingInstructionsExpert.id}>
              Salveaza instructiunile
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
