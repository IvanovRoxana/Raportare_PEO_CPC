'use client';

import { useEffect, useMemo, useState } from 'react';
import type React from 'react';
import { BarChart3, Building2, CheckCircle2, ClipboardList, FileText, Plus, SearchIcon, Users, UsersRound } from 'lucide-react';
import { DashboardShell, expertNavItems, pmNavItems } from '@/components/layout/dashboard-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatusBadge, type OperationalStatus } from '@/components/ui/status-badge';
import {
  useGTDocumentMutations,
  useGTDocuments,
  useGTEntities,
  useGTEntityMutations,
  useGTMonitoringRecordMutations,
  useGTMonitoringRecords,
  useGTOrganizations,
  useGTOrganizationMutations,
  useGTPersonMutations,
  useGTPersons,
  useExperts,
} from '@/hooks/use-backend-data';
import { getSignedInUser, type AppUser } from '@/lib/aws/auth';
import { GT_DOCUMENT_LABELS } from '@/lib/grup-tinta/document-requirements';
import { buildGTIndicatorSummary } from '@/lib/grup-tinta/indicators';
import type { GTDocument, GTEntity, GTPerson, GTStatus } from '@/lib/grup-tinta/types';

const GT_STATUS_LABELS: Record<GTStatus, string> = {
  draft: 'Draft',
  invitat: 'Invitat',
  dosar_depus: 'Dosar depus',
  in_verificare: 'In verificare',
  completari_solicitate: 'Completari solicitate',
  eligibil_validat: 'Eligibil validat',
  inscris_mysmis: 'Inscris MySMIS',
  in_operatiune: 'In operatiune',
  lista_asteptare: 'Lista asteptare',
  respins: 'Respins',
  iesit_din_operatiune: 'Iesit din operatiune',
};

const GT_STATUS_BADGE: Record<GTStatus, OperationalStatus> = {
  draft: 'draft',
  invitat: 'in_lucru',
  dosar_depus: 'in_analiza',
  in_verificare: 'in_analiza',
  completari_solicitate: 'cu_observatii',
  eligibil_validat: 'verificat',
  inscris_mysmis: 'aprobat',
  in_operatiune: 'conform',
  lista_asteptare: 'partial',
  respins: 'respins',
  iesit_din_operatiune: 'inchisa',
};

const GT_STATUSES = Object.keys(GT_STATUS_LABELS) as GTStatus[];

function normalizeName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function formatDate(value?: string) {
  if (!value) return '-';
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('ro-RO');
}

export default function GrupTintaPage() {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const { experts } = useExperts();
  const { records: organizations, isLoading: organizationsLoading } = useGTOrganizations();
  const { records: entities } = useGTEntities();
  const { records: persons } = useGTPersons();
  const { records: documents } = useGTDocuments();
  const { records: monitoringRecords } = useGTMonitoringRecords();
  const organizationMutations = useGTOrganizationMutations();
  const entityMutations = useGTEntityMutations();
  const personMutations = useGTPersonMutations();
  const documentMutations = useGTDocumentMutations();
  const monitoringMutations = useGTMonitoringRecordMutations();

  const [query, setQuery] = useState('');
  const [organizationDraft, setOrganizationDraft] = useState({ name: '', cui: '', kind: 'companie' });
  const [entityDraft, setEntityDraft] = useState({ organizationId: '', status: 'dosar_depus' as GTStatus });
  const [personDraft, setPersonDraft] = useState({ gtEntityId: '', nume: '', prenume: '', email: '' });
  const [monitoringDraft, setMonitoringDraft] = useState({ gtEntityId: '', date: '', rezultat: '' });

  const organizationById = useMemo(
    () => new Map(organizations.map((organization) => [organization.id, organization])),
    [organizations],
  );
  const entityById = useMemo(
    () => new Map(entities.map((entity) => [entity.id, entity])),
    [entities],
  );
  const summary = useMemo(() => buildGTIndicatorSummary(entities, persons), [entities, persons]);
  const normalizedQuery = normalizeName(query);
  const filteredOrganizations = useMemo(
    () =>
      organizations.filter((organization) =>
        !normalizedQuery ||
        organization.normalizedName.includes(normalizedQuery) ||
        String(organization.cui ?? '').includes(normalizedQuery),
      ),
    [organizations, normalizedQuery],
  );
  const validationQueue = useMemo(
    () => [
      ...entities.filter((entity) => ['dosar_depus', 'in_verificare', 'completari_solicitate'].includes(entity.status)),
      ...persons.filter((person) => ['dosar_depus', 'in_verificare', 'completari_solicitate'].includes(person.status)),
    ],
    [entities, persons],
  );
  const currentExpert = useMemo(
    () => experts.find((expert) => expert.email?.toLowerCase() === currentUser?.email?.toLowerCase()),
    [currentUser?.email, experts],
  );
  const isPmLike = Boolean(currentUser?.roles.includes('pm') || currentUser?.roles.includes('admin'));
  const canManageRegistry = isPmLike;
  const navItems = isPmLike ? pmNavItems : expertNavItems;

  useEffect(() => {
    getSignedInUser().then(setCurrentUser).catch(() => setCurrentUser(null));
  }, []);

  const createOrganization = async () => {
    const name = organizationDraft.name.trim();
    if (!name) return;
    await organizationMutations.create({
      name,
      normalizedName: normalizeName(name),
      kind: organizationDraft.kind,
      cui: organizationDraft.cui.trim() || undefined,
      status: 'active',
      sourceSheet: 'manual_v1',
    });
    setOrganizationDraft({ name: '', cui: '', kind: 'companie' });
  };

  const createEntity = async () => {
    const organization = organizationById.get(entityDraft.organizationId);
    if (!organization) return;
    await entityMutations.create({
      organizationId: organization.id,
      organizationName: organization.name,
      status: entityDraft.status,
      indicator5SO04: Boolean(entityDraft.status === 'in_operatiune'),
      indicator5SR04: false,
    });
    setEntityDraft({ organizationId: '', status: 'dosar_depus' });
  };

  const createPerson = async () => {
    if (!personDraft.gtEntityId || !personDraft.nume.trim() || !personDraft.prenume.trim()) return;
    await personMutations.create({
      gtEntityId: personDraft.gtEntityId,
      nume: personDraft.nume.trim(),
      prenume: personDraft.prenume.trim(),
      email: personDraft.email.trim() || undefined,
      status: 'dosar_depus',
      indicator5SO01: false,
      indicator5SR01: false,
    });
    setPersonDraft({ gtEntityId: '', nume: '', prenume: '', email: '' });
  };

  const createMonitoringRecord = async () => {
    if (!monitoringDraft.gtEntityId || !monitoringDraft.date) return;
    const date = new Date(`${monitoringDraft.date}T00:00:00`);
    await monitoringMutations.create({
      subjectType: 'entity',
      gtEntityId: monitoringDraft.gtEntityId,
      date: monitoringDraft.date,
      year: date.getFullYear(),
      month: date.getMonth(),
      rezultat: monitoringDraft.rezultat.trim() || undefined,
    });
    setMonitoringDraft({ gtEntityId: '', date: '', rezultat: '' });
  };

  return (
    <DashboardShell
      activeHref="/gt"
      navItems={navItems}
      eyebrow="Modul Grup Tinta"
      title="Registru intern Grup Tinta"
      description={currentExpert?.category === 'gt' || currentUser?.category === 'gt'
        ? 'Spatiul de lucru pentru expertii Grup Tinta: director, dosare, persoane, documente si monitorizare.'
        : 'Director, dosare, persoane, documente si monitorizare pentru indicatorii 5SO01/5SO04/5SR01/5SR04.'}
      quickTabs={[
        { label: 'Dashboard', href: '#gt-dashboard', icon: BarChart3, active: true },
        { label: 'Director', href: '#gt-tabs', icon: Building2 },
        { label: 'Entitati', href: '#gt-tabs', icon: UsersRound },
        { label: 'Persoane', href: '#gt-tabs', icon: Users },
        { label: 'Documente', href: '#gt-tabs', icon: FileText },
      ]}
    >
      <section id="gt-dashboard" className="grid gap-3 md:grid-cols-4">
        {Object.values(summary.indicators).map((indicator) => (
          <Card key={indicator.code} className="py-0">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground">{indicator.code}</p>
                  <p className="mt-2 text-3xl font-bold text-slate-950">{indicator.value}</p>
                  <p className="text-xs text-muted-foreground">Tinta: {indicator.target}</p>
                </div>
                <StatusBadge status={indicator.valid ? 'conform' : 'neconform'}>
                  {indicator.valid ? 'valid' : 'verifica'}
                </StatusBadge>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <div className="grid gap-3 md:grid-cols-3">
        <Card className="py-0">
          <CardContent className="p-4">
            <p className="text-xs font-semibold text-muted-foreground">Entitati active</p>
            <p className="mt-2 text-2xl font-bold">{summary.activeEntities}</p>
            <p className="text-xs text-muted-foreground">din {summary.totalEntities} entitati GT</p>
          </CardContent>
        </Card>
        <Card className="py-0">
          <CardContent className="p-4">
            <p className="text-xs font-semibold text-muted-foreground">Persoane active</p>
            <p className="mt-2 text-2xl font-bold">{summary.activePersons}</p>
            <p className="text-xs text-muted-foreground">din {summary.totalPersons} persoane GT</p>
          </CardContent>
        </Card>
        <Card className="py-0">
          <CardContent className="p-4">
            <p className="text-xs font-semibold text-muted-foreground">Coadă validare</p>
            <p className="mt-2 text-2xl font-bold">{validationQueue.length}</p>
            <p className="text-xs text-muted-foreground">dosare în lucru sau cu completări</p>
          </CardContent>
        </Card>
      </div>

      <Tabs id="gt-tabs" defaultValue="director" className="space-y-4 scroll-mt-24">
        <TabsList className="flex h-auto flex-wrap">
          <TabsTrigger value="director">Director</TabsTrigger>
          <TabsTrigger value="entitati">Entitati GT</TabsTrigger>
          <TabsTrigger value="persoane">Persoane</TabsTrigger>
          <TabsTrigger value="documente">Documente</TabsTrigger>
          <TabsTrigger value="monitorizare">Monitorizare</TabsTrigger>
        </TabsList>

        <TabsContent value="director">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Director organizatii si companii</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {canManageRegistry && (
                <div className="grid gap-3 lg:grid-cols-[1fr_160px_150px_auto]">
                  <Input value={organizationDraft.name} onChange={(event) => setOrganizationDraft((draft) => ({ ...draft, name: event.target.value }))} placeholder="Denumire organizatie / companie" />
                  <Input value={organizationDraft.cui} onChange={(event) => setOrganizationDraft((draft) => ({ ...draft, cui: event.target.value }))} placeholder="CUI" />
                  <Select value={organizationDraft.kind} onValueChange={(value) => setOrganizationDraft((draft) => ({ ...draft, kind: value }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="federatie">Federatie</SelectItem>
                      <SelectItem value="organizatie_patronala">Organizatie</SelectItem>
                      <SelectItem value="companie">Companie</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button onClick={createOrganization}><Plus className="h-4 w-4" /> Adauga</Button>
                </div>
              )}
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cauta dupa denumire sau CUI" />
              </div>
              <DataTable
                columns={['Denumire', 'Tip', 'CUI', 'Parinte', 'Sursa']}
                rows={filteredOrganizations.slice(0, 250).map((organization) => [
                  organization.name,
                  organization.kind,
                  organization.cui ?? '-',
                  organization.parentOrganizationId ? organizationById.get(organization.parentOrganizationId)?.name ?? organization.federationName ?? '-' : '-',
                  organization.sourceSheet ?? '-',
                ])}
                emptyLabel={organizationsLoading ? 'Se incarca directorul...' : 'Nu exista organizatii in director.'}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="entitati">
          <Card>
            <CardHeader><CardTitle className="text-base">Registru entitati GT</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {canManageRegistry && (
                <div className="grid gap-3 lg:grid-cols-[1fr_220px_auto]">
                  <Select value={entityDraft.organizationId} onValueChange={(value) => setEntityDraft((draft) => ({ ...draft, organizationId: value }))}>
                    <SelectTrigger><SelectValue placeholder="Alege organizatia" /></SelectTrigger>
                    <SelectContent>
                      {organizations.slice(0, 300).map((organization) => (
                        <SelectItem key={organization.id} value={organization.id}>{organization.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={entityDraft.status} onValueChange={(value) => setEntityDraft((draft) => ({ ...draft, status: value as GTStatus }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {GT_STATUSES.map((status) => <SelectItem key={status} value={status}>{GT_STATUS_LABELS[status]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button onClick={createEntity} disabled={!entityDraft.organizationId}><Plus className="h-4 w-4" /> Inscrie entitate</Button>
                </div>
              )}
              <EntityTable entities={entities} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="persoane">
          <Card>
            <CardHeader><CardTitle className="text-base">Registru persoane GT</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {canManageRegistry && (
                <div className="grid gap-3 lg:grid-cols-[1fr_150px_150px_220px_auto]">
                  <Select value={personDraft.gtEntityId} onValueChange={(value) => setPersonDraft((draft) => ({ ...draft, gtEntityId: value }))}>
                    <SelectTrigger><SelectValue placeholder="Entitate GT" /></SelectTrigger>
                    <SelectContent>
                      {entities.map((entity) => (
                        <SelectItem key={entity.id} value={entity.id}>{entity.organizationName ?? entity.organizationId}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input value={personDraft.nume} onChange={(event) => setPersonDraft((draft) => ({ ...draft, nume: event.target.value }))} placeholder="Nume" />
                  <Input value={personDraft.prenume} onChange={(event) => setPersonDraft((draft) => ({ ...draft, prenume: event.target.value }))} placeholder="Prenume" />
                  <Input value={personDraft.email} onChange={(event) => setPersonDraft((draft) => ({ ...draft, email: event.target.value }))} placeholder="Email" />
                  <Button onClick={createPerson} disabled={!personDraft.gtEntityId || !personDraft.nume || !personDraft.prenume}><Plus className="h-4 w-4" /> Adauga</Button>
                </div>
              )}
              <DataTable
                columns={['Persoana', 'Entitate', 'Status', 'GDPR', 'Intrare']}
                rows={persons.map((person) => [
                  `${person.nume} ${person.prenume}`,
                  entityById.get(person.gtEntityId)?.organizationName ?? person.gtEntityId,
                  <StatusBadge key={person.id} status={GT_STATUS_BADGE[person.status]}>{GT_STATUS_LABELS[person.status]}</StatusBadge>,
                  person.consimtamantGDPRAt ? 'Da' : 'Nu',
                  formatDate(person.dataIntrareOperatiune),
                ])}
                emptyLabel="Nu exista persoane GT."
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documente">
          <Card>
            <CardHeader><CardTitle className="text-base">Documente si coada de validare</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <DataTable
                columns={['Subiect', 'Document', 'Fisier', 'Status', 'Actiune']}
                rows={documents.map((document) => [
                  documentSubjectLabel(document, entityById, persons),
                  GT_DOCUMENT_LABELS[document.documentType] ?? document.documentType,
                  document.fileName ?? '-',
                  <StatusBadge key={`${document.id}-status`} status={documentStatusBadge(document.status)}>{document.status}</StatusBadge>,
                  <Button key={document.id} variant="outline" size="sm" onClick={() => documentMutations.update(document.id, { status: 'validat', validatedAt: new Date().toISOString() })} disabled={!canManageRegistry || document.status === 'validat'}>
                    <CheckCircle2 className="h-4 w-4" /> Valideaza
                  </Button>,
                ])}
                emptyLabel="Nu exista documente incarcate in registru."
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="monitorizare">
          <Card>
            <CardHeader><CardTitle className="text-base">Jurnal monitorizare GT</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {canManageRegistry && (
                <div className="grid gap-3 lg:grid-cols-[1fr_180px_1fr_auto]">
                  <Select value={monitoringDraft.gtEntityId} onValueChange={(value) => setMonitoringDraft((draft) => ({ ...draft, gtEntityId: value }))}>
                    <SelectTrigger><SelectValue placeholder="Entitate monitorizata" /></SelectTrigger>
                    <SelectContent>
                      {entities.map((entity) => (
                        <SelectItem key={entity.id} value={entity.id}>{entity.organizationName ?? entity.organizationId}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input type="date" value={monitoringDraft.date} onChange={(event) => setMonitoringDraft((draft) => ({ ...draft, date: event.target.value }))} />
                  <Input value={monitoringDraft.rezultat} onChange={(event) => setMonitoringDraft((draft) => ({ ...draft, rezultat: event.target.value }))} placeholder="Rezultat / observatie" />
                  <Button onClick={createMonitoringRecord} disabled={!monitoringDraft.gtEntityId || !monitoringDraft.date}><ClipboardList className="h-4 w-4" /> Salveaza</Button>
                </div>
              )}
              <DataTable
                columns={['Data', 'Subiect', 'SA', 'Indicator', 'Rezultat']}
                rows={monitoringRecords.map((record) => [
                  formatDate(record.date),
                  record.gtEntityId ? entityById.get(record.gtEntityId)?.organizationName ?? record.gtEntityId : record.gtPersonId ?? '-',
                  record.saCode ?? '-',
                  record.indicatorCode ?? '-',
                  record.rezultat ?? record.descriere ?? '-',
                ])}
                emptyLabel="Nu exista inregistrari de monitorizare."
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </DashboardShell>
  );
}

function EntityTable({ entities }: { entities: GTEntity[] }) {
  return (
    <DataTable
      columns={['Organizatie', 'Status', '5SO04', '5SR04', 'Intrare', 'Observatii']}
      rows={entities.map((entity) => [
        entity.organizationName ?? entity.organizationId,
        <StatusBadge key={entity.id} status={GT_STATUS_BADGE[entity.status]}>{GT_STATUS_LABELS[entity.status]}</StatusBadge>,
        entity.indicator5SO04 || entity.dataIntrareOperatiune ? 'Da' : 'Nu',
        entity.indicator5SR04 ? 'Da' : 'Nu',
        formatDate(entity.dataIntrareOperatiune),
        entity.notes ?? entity.sourceStatusText ?? '-',
      ])}
      emptyLabel="Nu exista entitati GT."
    />
  );
}

function DataTable({ columns, rows, emptyLabel }: { columns: string[]; rows: Array<Array<React.ReactNode>>; emptyLabel: string }) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold uppercase text-muted-foreground">
            <tr>
              {columns.map((column) => <th key={column} className="px-3 py-2">{column}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 ? (
              <tr><td colSpan={columns.length} className="px-3 py-8 text-center text-muted-foreground">{emptyLabel}</td></tr>
            ) : rows.map((row, index) => (
              <tr key={index} className="bg-white">
                {row.map((cell, cellIndex) => <td key={cellIndex} className="px-3 py-2 align-middle">{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function documentStatusBadge(status: GTDocument['status']): OperationalStatus {
  if (status === 'validat') return 'verificat';
  if (status === 'respins') return 'respins';
  if (status === 'lipsa') return 'lipsa';
  if (status === 'in_verificare') return 'in_analiza';
  return 'in_lucru';
}

function documentSubjectLabel(document: GTDocument, entities: Map<string, GTEntity>, persons: GTPerson[]) {
  if (document.gtEntityId) return entities.get(document.gtEntityId)?.organizationName ?? document.gtEntityId;
  if (document.gtPersonId) {
    const person = persons.find((item) => item.id === document.gtPersonId);
    return person ? `${person.nume} ${person.prenume}` : document.gtPersonId;
  }
  return document.subjectType;
}
