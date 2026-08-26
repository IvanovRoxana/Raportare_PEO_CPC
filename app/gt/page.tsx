'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import {
  BarChart3,
  Building2,
  CheckCircle2,
  ClipboardList,
  FileText,
  Plus,
  Save,
  SearchIcon,
  Upload,
  Users,
  UsersRound,
} from 'lucide-react';
import { DashboardShell, expertNavItems, pmNavItems } from '@/components/layout/dashboard-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
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
import { GT_DOCUMENT_LABELS, GT_ENTITY_REQUIRED_DOCS } from '@/lib/grup-tinta/document-requirements';
import {
  getChildOrganizations,
  getCpcAffiliatedOrganizations,
  getGTEntityForOrganization,
} from '@/lib/grup-tinta/directory';
import { buildGTIndicatorSummary } from '@/lib/grup-tinta/indicators';
import { uploadAuthenticatedData } from '@/lib/authenticated-storage';
import type { GTDocument, GTEntity, GTMonitoringRecord, GTPerson, GTStatus, Organization } from '@/lib/grup-tinta/types';

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
const DOCUMENT_TYPES = [...GT_ENTITY_REQUIRED_DOCS, 'fisa_monitorizare', 'alt_document'] as const;

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

function safeStorageName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '_');
}

export default function GrupTintaPage() {
  const documentInputRef = useRef<HTMLInputElement>(null);
  const monitoringInputRef = useRef<HTMLInputElement>(null);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const { experts } = useExperts();
  const { records: organizations, isLoading: organizationsLoading, mutate: refreshOrganizations } = useGTOrganizations();
  const { records: entities, mutate: refreshEntities } = useGTEntities();
  const { records: persons, mutate: refreshPersons } = useGTPersons();
  const { records: documents, mutate: refreshDocuments } = useGTDocuments();
  const { records: monitoringRecords, mutate: refreshMonitoring } = useGTMonitoringRecords();
  const organizationMutations = useGTOrganizationMutations();
  const entityMutations = useGTEntityMutations();
  const personMutations = useGTPersonMutations();
  const documentMutations = useGTDocumentMutations();
  const monitoringMutations = useGTMonitoringRecordMutations();

  const [affiliateQuery, setAffiliateQuery] = useState('');
  const [companyQuery, setCompanyQuery] = useState('');
  const [selectedAffiliateId, setSelectedAffiliateId] = useState('');
  const [organizationDraft, setOrganizationDraft] = useState({ name: '', cui: '', status: 'active', gtNotes: '' });
  const [newAffiliateDraft, setNewAffiliateDraft] = useState({ name: '', kind: 'federatie' });
  const [entityDraft, setEntityDraft] = useState({ organizationId: '', status: 'dosar_depus' as GTStatus });
  const [personDraft, setPersonDraft] = useState({ gtEntityId: '', nume: '', prenume: '', email: '', functie: '' });
  const [documentDraft, setDocumentDraft] = useState({ documentType: 'extras_registru_organizatii_patronale', notes: '' });
  const [monitoringDraft, setMonitoringDraft] = useState({ gtEntityId: '', date: '', rezultat: '', descriere: '' });
  const [isUploadingDocument, setIsUploadingDocument] = useState(false);
  const [isUploadingMonitoring, setIsUploadingMonitoring] = useState(false);

  const organizationById = useMemo(
    () => new Map(organizations.map((organization) => [organization.id, organization])),
    [organizations],
  );
  const entityById = useMemo(
    () => new Map(entities.map((entity) => [entity.id, entity])),
    [entities],
  );
  const summary = useMemo(() => buildGTIndicatorSummary(entities, persons), [entities, persons]);
  const affiliates = useMemo(() => getCpcAffiliatedOrganizations(organizations), [organizations]);
  const filteredAffiliates = useMemo(() => {
    const query = normalizeName(affiliateQuery);
    return affiliates.filter((affiliate) => !query || affiliate.normalizedName.includes(query));
  }, [affiliateQuery, affiliates]);
  const selectedAffiliate = useMemo(
    () => affiliates.find((affiliate) => affiliate.id === selectedAffiliateId) ?? affiliates[0],
    [affiliates, selectedAffiliateId],
  );
  const selectedEntity = useMemo(
    () => getGTEntityForOrganization(selectedAffiliate?.id, entities),
    [entities, selectedAffiliate?.id],
  );
  const childOrganizations = useMemo(
    () => getChildOrganizations(selectedAffiliate, organizations),
    [organizations, selectedAffiliate],
  );
  const filteredChildren = useMemo(() => {
    const query = normalizeName(companyQuery);
    return childOrganizations.filter((organization) =>
      !query ||
      organization.normalizedName.includes(query) ||
      String(organization.cui ?? '').includes(query),
    );
  }, [childOrganizations, companyQuery]);
  const selectedDocuments = useMemo(
    () => documents.filter((document) => selectedEntity && document.gtEntityId === selectedEntity.id),
    [documents, selectedEntity],
  );
  const selectedPersons = useMemo(
    () => persons.filter((person) => selectedEntity && person.gtEntityId === selectedEntity.id),
    [persons, selectedEntity],
  );
  const selectedMonitoringRecords = useMemo(
    () => monitoringRecords.filter((record) => selectedEntity && record.gtEntityId === selectedEntity.id),
    [monitoringRecords, selectedEntity],
  );
  const availableAffiliatesForGT = useMemo(
    () => affiliates.filter((affiliate) => !getGTEntityForOrganization(affiliate.id, entities)),
    [affiliates, entities],
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
  const isGtExpert = currentUser?.category === 'gt' || currentExpert?.category === 'gt';
  const canManageRegistry = Boolean(isPmLike || isGtExpert);
  const navItems = isPmLike ? pmNavItems : expertNavItems;

  useEffect(() => {
    getSignedInUser().then(setCurrentUser).catch(() => setCurrentUser(null));
  }, []);

  useEffect(() => {
    if (!selectedAffiliateId && affiliates[0]) {
      setSelectedAffiliateId(affiliates[0].id);
    }
  }, [affiliates, selectedAffiliateId]);

  useEffect(() => {
    if (!selectedAffiliate) return;
    setOrganizationDraft({
      name: selectedAffiliate.name,
      cui: selectedAffiliate.cui ?? '',
      status: selectedAffiliate.status ?? 'active',
      gtNotes: selectedAffiliate.gtNotes ?? '',
    });
    setCompanyQuery('');
  }, [selectedAffiliate]);

  useEffect(() => {
    if (availableAffiliatesForGT[0] && !entityDraft.organizationId) {
      setEntityDraft((draft) => ({ ...draft, organizationId: availableAffiliatesForGT[0].id }));
    }
  }, [availableAffiliatesForGT, entityDraft.organizationId]);

  const createAffiliate = async () => {
    const name = newAffiliateDraft.name.trim();
    if (!name) return;
    const created = await organizationMutations.create({
      name,
      normalizedName: normalizeName(name),
      kind: newAffiliateDraft.kind,
      status: 'active',
      sourceSheet: 'CPC ALL',
    });
    setNewAffiliateDraft({ name: '', kind: 'federatie' });
    setSelectedAffiliateId(created.id);
    refreshOrganizations();
  };

  const saveSelectedOrganization = async () => {
    if (!selectedAffiliate) return;
    const name = organizationDraft.name.trim();
    if (!name) return;
    await organizationMutations.update(selectedAffiliate.id, {
      name,
      normalizedName: normalizeName(name),
      cui: organizationDraft.cui.trim() || undefined,
      status: organizationDraft.status.trim() || 'active',
      gtNotes: organizationDraft.gtNotes.trim() || undefined,
    });
    refreshOrganizations();
  };

  const createEntity = async (organizationId = entityDraft.organizationId, status = entityDraft.status) => {
    const organization = organizationById.get(organizationId);
    if (!organization || getGTEntityForOrganization(organization.id, entities)) return;
    const created = await entityMutations.create({
      organizationId: organization.id,
      organizationName: organization.name,
      status,
      indicator5SO04: status === 'in_operatiune',
      indicator5SR04: false,
      sourceStatusText: organization.gtNotes,
    });
    setEntityDraft({ organizationId: '', status: 'dosar_depus' });
    refreshEntities();
    return created;
  };

  const updateEntityStatus = async (entity: GTEntity, status: GTStatus) => {
    await entityMutations.update(entity.id, {
      status,
      indicator5SO04: status === 'in_operatiune' || Boolean(entity.dataIntrareOperatiune),
    });
    refreshEntities();
  };

  const createPerson = async () => {
    const gtEntityId = personDraft.gtEntityId || selectedEntity?.id;
    if (!gtEntityId || !personDraft.nume.trim() || !personDraft.prenume.trim()) return;
    await personMutations.create({
      gtEntityId,
      nume: personDraft.nume.trim(),
      prenume: personDraft.prenume.trim(),
      email: personDraft.email.trim() || undefined,
      functie: personDraft.functie.trim() || undefined,
      status: 'dosar_depus',
      indicator5SO01: false,
      indicator5SR01: false,
    });
    setPersonDraft({ gtEntityId: '', nume: '', prenume: '', email: '', functie: '' });
    refreshPersons();
  };

  const uploadDocumentForEntity = async (args: {
    entity: GTEntity;
    file: File;
    documentType: string;
    notes?: string;
  }) => {
    const documentId = `gt_doc_${args.entity.id}_${Date.now()}`;
    const fileName = args.file.name;
    const s3Key = `projects/gt/${args.entity.id}/${documentId}_${safeStorageName(fileName)}`;
    const uploaded = await uploadAuthenticatedData({
      path: s3Key,
      data: args.file,
      options: { contentType: args.file.type || 'application/octet-stream' },
    }).result;
    await documentMutations.create({
      subjectType: 'entity',
      gtEntityId: args.entity.id,
      documentType: args.documentType,
      s3Key: uploaded.path,
      fileName,
      status: 'incarcat',
      notes: args.notes?.trim() || undefined,
    });
    refreshDocuments();
  };

  const handleDocumentUpload = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file || !selectedEntity) return;
    setIsUploadingDocument(true);
    try {
      await uploadDocumentForEntity({
        entity: selectedEntity,
        file,
        documentType: documentDraft.documentType,
        notes: documentDraft.notes,
      });
      setDocumentDraft({ documentType: 'extras_registru_organizatii_patronale', notes: '' });
    } finally {
      setIsUploadingDocument(false);
      if (documentInputRef.current) documentInputRef.current.value = '';
    }
  };

  const createMonitoringRecord = async (files?: FileList | null) => {
    const gtEntityId = monitoringDraft.gtEntityId || selectedEntity?.id;
    const entity = gtEntityId ? entityById.get(gtEntityId) : undefined;
    if (!entity || !monitoringDraft.date) return;
    setIsUploadingMonitoring(true);
    try {
      const date = new Date(`${monitoringDraft.date}T00:00:00`);
      await monitoringMutations.create({
        subjectType: 'entity',
        gtEntityId: entity.id,
        date: monitoringDraft.date,
        year: date.getFullYear(),
        month: date.getMonth(),
        descriere: monitoringDraft.descriere.trim() || undefined,
        rezultat: monitoringDraft.rezultat.trim() || undefined,
      });
      const file = files?.[0];
      if (file) {
        await uploadDocumentForEntity({
          entity,
          file,
          documentType: 'fisa_monitorizare',
          notes: monitoringDraft.rezultat || monitoringDraft.descriere,
        });
      }
      setMonitoringDraft({ gtEntityId: '', date: '', rezultat: '', descriere: '' });
      refreshMonitoring();
    } finally {
      setIsUploadingMonitoring(false);
      if (monitoringInputRef.current) monitoringInputRef.current.value = '';
    }
  };

  return (
    <DashboardShell
      activeHref="/gt"
      navItems={navItems}
      eyebrow="Modul Grup Tinta"
      title="Registru intern Grup Tinta"
      description="Registru operational pentru organizatii afiliate CPC, entitati GT, persoane, documente si monitorizare."
      quickTabs={[
        { label: 'Dashboard', href: '#gt-dashboard', icon: BarChart3, active: true },
        { label: 'Organizatii afiliate', href: '#gt-tabs', icon: Building2 },
        { label: 'Entitati GT', href: '#gt-tabs', icon: UsersRound },
        { label: 'Persoane', href: '#gt-tabs', icon: Users },
        { label: 'Monitorizare', href: '#gt-tabs', icon: ClipboardList },
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

      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard title="Organizatii afiliate" value={affiliates.length} hint={`din ${organizations.length} in director`} />
        <MetricCard title="Entitati GT" value={summary.totalEntities} hint={`${summary.activeEntities} in operatiune`} />
        <MetricCard title="Persoane GT" value={summary.totalPersons} hint={`${summary.activePersons} in operatiune`} />
        <MetricCard title="Coada validare" value={validationQueue.length} hint="dosare in lucru sau cu completari" />
      </div>

      <Tabs id="gt-tabs" defaultValue="afiliate" className="space-y-4 scroll-mt-24">
        <TabsList className="flex h-auto flex-wrap">
          <TabsTrigger value="afiliate">Organizatii afiliate</TabsTrigger>
          <TabsTrigger value="entitati">Entitati GT</TabsTrigger>
          <TabsTrigger value="persoane">Persoane</TabsTrigger>
          <TabsTrigger value="monitorizare">Monitorizare</TabsTrigger>
        </TabsList>

        <TabsContent value="afiliate">
          <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Organizatii afiliate CPC</CardTitle>
                <CardDescription>{organizationsLoading ? 'Se incarca directorul...' : `${affiliates.length} organizatii afiliate`}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {canManageRegistry && (
                  <div className="grid gap-2">
                    <Input
                      value={newAffiliateDraft.name}
                      onChange={(event) => setNewAffiliateDraft((draft) => ({ ...draft, name: event.target.value }))}
                      placeholder="Adauga organizatie afiliata"
                    />
                    <div className="grid grid-cols-[1fr_auto] gap-2">
                      <Select value={newAffiliateDraft.kind} onValueChange={(value) => setNewAffiliateDraft((draft) => ({ ...draft, kind: value }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="federatie">Federatie</SelectItem>
                          <SelectItem value="organizatie_patronala">Organizatie patronala</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button onClick={createAffiliate} disabled={!newAffiliateDraft.name.trim()}>
                        <Plus className="h-4 w-4" /> Adauga
                      </Button>
                    </div>
                  </div>
                )}
                <div className="relative">
                  <SearchIcon className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input className="pl-9" value={affiliateQuery} onChange={(event) => setAffiliateQuery(event.target.value)} placeholder="Cauta afiliata" />
                </div>
                <div className="max-h-[620px] space-y-2 overflow-auto pr-1">
                  {filteredAffiliates.length === 0 ? (
                    <p className="rounded-lg border px-3 py-8 text-center text-sm text-muted-foreground">
                      {organizationsLoading ? 'Se incarca organizatiile afiliate...' : 'Nu exista organizatii afiliate CPC.'}
                    </p>
                  ) : filteredAffiliates.map((affiliate) => {
                    const entity = getGTEntityForOrganization(affiliate.id, entities);
                    const selected = selectedAffiliate?.id === affiliate.id;
                    return (
                      <button
                        key={affiliate.id}
                        type="button"
                        onClick={() => setSelectedAffiliateId(affiliate.id)}
                        className={`w-full rounded-lg border p-3 text-left transition hover:border-slate-400 ${selected ? 'border-slate-950 bg-slate-50' : 'bg-white'}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-950">{affiliate.name}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{affiliate.kind}</p>
                          </div>
                          {entity ? (
                            <StatusBadge status={GT_STATUS_BADGE[entity.status]}>{GT_STATUS_LABELS[entity.status]}</StatusBadge>
                          ) : (
                            <StatusBadge status="draft">neinscris</StatusBadge>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <AffiliateDetails
              affiliate={selectedAffiliate}
              entity={selectedEntity}
              childOrganizations={filteredChildren}
              childCount={childOrganizations.length}
              companyQuery={companyQuery}
              onCompanyQueryChange={setCompanyQuery}
              canManage={canManageRegistry}
              organizationDraft={organizationDraft}
              setOrganizationDraft={setOrganizationDraft}
              onSaveOrganization={saveSelectedOrganization}
              onCreateEntity={() => selectedAffiliate && createEntity(selectedAffiliate.id)}
              onUpdateEntityStatus={updateEntityStatus}
              documents={selectedDocuments}
              documentDraft={documentDraft}
              setDocumentDraft={setDocumentDraft}
              onDocumentUpload={handleDocumentUpload}
              documentInputRef={documentInputRef}
              isUploadingDocument={isUploadingDocument}
              onValidateDocument={async (document) => {
                await documentMutations.update(document.id, { status: 'validat', validatedAt: new Date().toISOString() });
                refreshDocuments();
              }}
              persons={selectedPersons}
              personDraft={personDraft}
              setPersonDraft={setPersonDraft}
              onCreatePerson={createPerson}
              monitoringDraft={monitoringDraft}
              setMonitoringDraft={setMonitoringDraft}
              monitoringInputRef={monitoringInputRef}
              isUploadingMonitoring={isUploadingMonitoring}
              onCreateMonitoring={createMonitoringRecord}
              monitoringRecords={selectedMonitoringRecords}
            />
          </div>
        </TabsContent>

        <TabsContent value="entitati">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Entitati inscrise in GT</CardTitle>
              <CardDescription>Doar organizatiile afiliate selectate pentru grupul tinta.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {canManageRegistry && (
                <div className="grid gap-3 lg:grid-cols-[1fr_220px_auto]">
                  <Select value={entityDraft.organizationId} onValueChange={(value) => setEntityDraft((draft) => ({ ...draft, organizationId: value }))}>
                    <SelectTrigger><SelectValue placeholder="Alege organizatia afiliata" /></SelectTrigger>
                    <SelectContent>
                      {availableAffiliatesForGT.map((organization) => (
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
                  <Button onClick={() => createEntity()} disabled={!entityDraft.organizationId}>
                    <Plus className="h-4 w-4" /> Inscrie entitate
                  </Button>
                </div>
              )}
              <EntityTable entities={entities} onSelect={(entity) => setSelectedAffiliateId(entity.organizationId)} onUpdateStatus={canManageRegistry ? updateEntityStatus : undefined} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="persoane">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Persoane GT</CardTitle>
              <CardDescription>Persoane legate de entitatile inscrise in GT.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {canManageRegistry && (
                <PersonForm
                  entities={entities}
                  draft={personDraft}
                  setDraft={setPersonDraft}
                  onCreate={createPerson}
                />
              )}
              <DataTable
                columns={['Persoana', 'Entitate', 'Functie', 'Status', 'GDPR', 'Intrare']}
                rows={persons.map((person) => [
                  `${person.nume} ${person.prenume}`,
                  entityById.get(person.gtEntityId)?.organizationName ?? person.gtEntityId,
                  person.functie ?? '-',
                  <StatusBadge key={person.id} status={GT_STATUS_BADGE[person.status]}>{GT_STATUS_LABELS[person.status]}</StatusBadge>,
                  person.consimtamantGDPRAt ? 'Da' : 'Nu',
                  formatDate(person.dataIntrareOperatiune),
                ])}
                emptyLabel="Nu exista persoane GT."
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="monitorizare">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Monitorizare GT</CardTitle>
              <CardDescription>Registru central; incarcarea se poate face si din detaliul entitatii.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {canManageRegistry && (
                <MonitoringForm
                  entities={entities}
                  draft={monitoringDraft}
                  setDraft={setMonitoringDraft}
                  inputRef={monitoringInputRef}
                  isUploading={isUploadingMonitoring}
                  onCreate={createMonitoringRecord}
                />
              )}
              <MonitoringTable records={monitoringRecords} entityById={entityById} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </DashboardShell>
  );
}

function MetricCard({ title, value, hint }: { title: string; value: number; hint: string }) {
  return (
    <Card className="py-0">
      <CardContent className="p-4">
        <p className="text-xs font-semibold text-muted-foreground">{title}</p>
        <p className="mt-2 text-2xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function AffiliateDetails(props: {
  affiliate?: Organization;
  entity?: GTEntity;
  childOrganizations: Organization[];
  childCount: number;
  companyQuery: string;
  onCompanyQueryChange: (value: string) => void;
  canManage: boolean;
  organizationDraft: { name: string; cui: string; status: string; gtNotes: string };
  setOrganizationDraft: React.Dispatch<React.SetStateAction<{ name: string; cui: string; status: string; gtNotes: string }>>;
  onSaveOrganization: () => Promise<void>;
  onCreateEntity: () => Promise<GTEntity | undefined>;
  onUpdateEntityStatus: (entity: GTEntity, status: GTStatus) => Promise<void>;
  documents: GTDocument[];
  documentDraft: { documentType: string; notes: string };
  setDocumentDraft: React.Dispatch<React.SetStateAction<{ documentType: string; notes: string }>>;
  onDocumentUpload: (files: FileList | null) => Promise<void>;
  documentInputRef: React.RefObject<HTMLInputElement | null>;
  isUploadingDocument: boolean;
  onValidateDocument: (document: GTDocument) => Promise<void>;
  persons: GTPerson[];
  personDraft: { gtEntityId: string; nume: string; prenume: string; email: string; functie: string };
  setPersonDraft: React.Dispatch<React.SetStateAction<{ gtEntityId: string; nume: string; prenume: string; email: string; functie: string }>>;
  onCreatePerson: () => Promise<void>;
  monitoringDraft: { gtEntityId: string; date: string; rezultat: string; descriere: string };
  setMonitoringDraft: React.Dispatch<React.SetStateAction<{ gtEntityId: string; date: string; rezultat: string; descriere: string }>>;
  monitoringInputRef: React.RefObject<HTMLInputElement | null>;
  isUploadingMonitoring: boolean;
  onCreateMonitoring: (files?: FileList | null) => Promise<void>;
  monitoringRecords: GTMonitoringRecord[];
}) {
  if (!props.affiliate) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          Selecteaza o organizatie afiliata CPC.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{props.affiliate.name}</CardTitle>
            <CardDescription>
              {props.childCount} companii/organizatii membre {props.entity ? '• inscrisa in GT' : '• neinscrisa in GT'}
            </CardDescription>
          </div>
          {props.entity ? (
            <StatusBadge status={GT_STATUS_BADGE[props.entity.status]}>{GT_STATUS_LABELS[props.entity.status]}</StatusBadge>
          ) : (
            <StatusBadge status="draft">neinscrisa</StatusBadge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <section className="grid gap-3 lg:grid-cols-[1fr_150px_160px_auto]">
          <Input
            value={props.organizationDraft.name}
            onChange={(event) => props.setOrganizationDraft((draft) => ({ ...draft, name: event.target.value }))}
            disabled={!props.canManage}
            placeholder="Denumire"
          />
          <Input
            value={props.organizationDraft.cui}
            onChange={(event) => props.setOrganizationDraft((draft) => ({ ...draft, cui: event.target.value }))}
            disabled={!props.canManage}
            placeholder="CUI"
          />
          <Input
            value={props.organizationDraft.status}
            onChange={(event) => props.setOrganizationDraft((draft) => ({ ...draft, status: event.target.value }))}
            disabled={!props.canManage}
            placeholder="Status"
          />
          <Button onClick={props.onSaveOrganization} disabled={!props.canManage}>
            <Save className="h-4 w-4" /> Salveaza
          </Button>
        </section>
        <Textarea
          value={props.organizationDraft.gtNotes}
          onChange={(event) => props.setOrganizationDraft((draft) => ({ ...draft, gtNotes: event.target.value }))}
          disabled={!props.canManage}
          placeholder="Note GT / observatii import"
        />

        <div className="flex flex-wrap gap-2">
          {!props.entity && (
            <Button onClick={props.onCreateEntity} disabled={!props.canManage}>
              <Plus className="h-4 w-4" /> Inscrie in Entitati GT
            </Button>
          )}
          {props.entity && props.canManage && (
            <Select value={props.entity.status} onValueChange={(value) => props.onUpdateEntityStatus(props.entity!, value as GTStatus)}>
              <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {GT_STATUSES.map((status) => <SelectItem key={status} value={status}>{GT_STATUS_LABELS[status]}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">Companii membre</h3>
            <div className="relative w-full max-w-sm">
              <SearchIcon className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" value={props.companyQuery} onChange={(event) => props.onCompanyQueryChange(event.target.value)} placeholder="Cauta companie sau CUI" />
            </div>
          </div>
          <DataTable
            columns={['Denumire', 'Tip', 'CUI', 'Organizatie/Federatie', 'Sursa']}
            rows={props.childOrganizations.slice(0, 300).map((organization) => [
              organization.name,
              organization.kind,
              organization.cui ?? '-',
              organization.patronalOrganizationName ?? organization.federationName ?? '-',
              organization.sourceSheet ?? '-',
            ])}
            emptyLabel="Nu exista companii asociate acestei organizatii."
          />
        </section>

        {props.entity && (
          <Tabs defaultValue="documente" className="space-y-3">
            <TabsList className="flex h-auto flex-wrap">
              <TabsTrigger value="documente">Documente</TabsTrigger>
              <TabsTrigger value="persoane">Persoane</TabsTrigger>
              <TabsTrigger value="monitorizare">Monitorizare</TabsTrigger>
            </TabsList>
            <TabsContent value="documente" className="space-y-3">
              {props.canManage && (
                <div className="grid gap-3 lg:grid-cols-[240px_1fr_auto]">
                  <Select value={props.documentDraft.documentType} onValueChange={(value) => props.setDocumentDraft((draft) => ({ ...draft, documentType: value }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DOCUMENT_TYPES.map((documentType) => (
                        <SelectItem key={documentType} value={documentType}>{GT_DOCUMENT_LABELS[documentType] ?? documentType}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={props.documentDraft.notes}
                    onChange={(event) => props.setDocumentDraft((draft) => ({ ...draft, notes: event.target.value }))}
                    placeholder="Observatii document"
                  />
                  <div>
                    <input
                      ref={props.documentInputRef}
                      type="file"
                      className="hidden"
                      onChange={(event) => props.onDocumentUpload(event.target.files)}
                    />
                    <Button onClick={() => props.documentInputRef.current?.click()} disabled={props.isUploadingDocument}>
                      <Upload className="h-4 w-4" /> {props.isUploadingDocument ? 'Se incarca...' : 'Incarca'}
                    </Button>
                  </div>
                </div>
              )}
              <DocumentsTable documents={props.documents} canManage={props.canManage} onValidate={props.onValidateDocument} />
            </TabsContent>
            <TabsContent value="persoane" className="space-y-3">
              {props.canManage && (
                <PersonForm
                  entities={[props.entity]}
                  draft={{ ...props.personDraft, gtEntityId: props.entity.id }}
                  setDraft={props.setPersonDraft}
                  onCreate={props.onCreatePerson}
                  hideEntityPicker
                />
              )}
              <DataTable
                columns={['Persoana', 'Functie', 'Email', 'Status']}
                rows={props.persons.map((person) => [
                  `${person.nume} ${person.prenume}`,
                  person.functie ?? '-',
                  person.email ?? '-',
                  <StatusBadge key={person.id} status={GT_STATUS_BADGE[person.status]}>{GT_STATUS_LABELS[person.status]}</StatusBadge>,
                ])}
                emptyLabel="Nu exista persoane pentru aceasta entitate."
              />
            </TabsContent>
            <TabsContent value="monitorizare" className="space-y-3">
              {props.canManage && (
                <MonitoringForm
                  entities={[props.entity]}
                  draft={{ ...props.monitoringDraft, gtEntityId: props.entity.id }}
                  setDraft={props.setMonitoringDraft}
                  inputRef={props.monitoringInputRef}
                  isUploading={props.isUploadingMonitoring}
                  onCreate={props.onCreateMonitoring}
                  hideEntityPicker
                />
              )}
              <MonitoringTable records={props.monitoringRecords} entityById={new Map([[props.entity.id, props.entity]])} />
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}

function PersonForm(props: {
  entities: GTEntity[];
  draft: { gtEntityId: string; nume: string; prenume: string; email: string; functie: string };
  setDraft: React.Dispatch<React.SetStateAction<{ gtEntityId: string; nume: string; prenume: string; email: string; functie: string }>>;
  onCreate: () => Promise<void>;
  hideEntityPicker?: boolean;
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_150px_150px_180px_220px_auto]">
      {!props.hideEntityPicker && (
        <Select value={props.draft.gtEntityId} onValueChange={(value) => props.setDraft((draft) => ({ ...draft, gtEntityId: value }))}>
          <SelectTrigger><SelectValue placeholder="Entitate GT" /></SelectTrigger>
          <SelectContent>
            {props.entities.map((entity) => (
              <SelectItem key={entity.id} value={entity.id}>{entity.organizationName ?? entity.organizationId}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <Input value={props.draft.nume} onChange={(event) => props.setDraft((draft) => ({ ...draft, nume: event.target.value }))} placeholder="Nume" />
      <Input value={props.draft.prenume} onChange={(event) => props.setDraft((draft) => ({ ...draft, prenume: event.target.value }))} placeholder="Prenume" />
      <Input value={props.draft.functie} onChange={(event) => props.setDraft((draft) => ({ ...draft, functie: event.target.value }))} placeholder="Functie" />
      <Input value={props.draft.email} onChange={(event) => props.setDraft((draft) => ({ ...draft, email: event.target.value }))} placeholder="Email" />
      <Button onClick={props.onCreate} disabled={!props.draft.gtEntityId || !props.draft.nume.trim() || !props.draft.prenume.trim()}>
        <Plus className="h-4 w-4" /> Adauga
      </Button>
    </div>
  );
}

function MonitoringForm(props: {
  entities: GTEntity[];
  draft: { gtEntityId: string; date: string; rezultat: string; descriere: string };
  setDraft: React.Dispatch<React.SetStateAction<{ gtEntityId: string; date: string; rezultat: string; descriere: string }>>;
  inputRef: React.RefObject<HTMLInputElement | null>;
  isUploading: boolean;
  onCreate: (files?: FileList | null) => Promise<void>;
  hideEntityPicker?: boolean;
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_170px_1fr_1fr_auto]">
      {!props.hideEntityPicker && (
        <Select value={props.draft.gtEntityId} onValueChange={(value) => props.setDraft((draft) => ({ ...draft, gtEntityId: value }))}>
          <SelectTrigger><SelectValue placeholder="Entitate monitorizata" /></SelectTrigger>
          <SelectContent>
            {props.entities.map((entity) => (
              <SelectItem key={entity.id} value={entity.id}>{entity.organizationName ?? entity.organizationId}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <Input type="date" value={props.draft.date} onChange={(event) => props.setDraft((draft) => ({ ...draft, date: event.target.value }))} />
      <Input value={props.draft.descriere} onChange={(event) => props.setDraft((draft) => ({ ...draft, descriere: event.target.value }))} placeholder="Descriere" />
      <Input value={props.draft.rezultat} onChange={(event) => props.setDraft((draft) => ({ ...draft, rezultat: event.target.value }))} placeholder="Rezultat / observatie" />
      <div className="flex gap-2">
        <input ref={props.inputRef} type="file" className="hidden" onChange={(event) => props.onCreate(event.target.files)} />
        <Button onClick={() => props.inputRef.current?.click()} disabled={props.isUploading || !props.draft.gtEntityId || !props.draft.date}>
          <Upload className="h-4 w-4" /> Fisa
        </Button>
        <Button variant="outline" onClick={() => props.onCreate()} disabled={props.isUploading || !props.draft.gtEntityId || !props.draft.date}>
          <ClipboardList className="h-4 w-4" /> Salveaza
        </Button>
      </div>
    </div>
  );
}

function EntityTable({ entities, onSelect, onUpdateStatus }: {
  entities: GTEntity[];
  onSelect?: (entity: GTEntity) => void;
  onUpdateStatus?: (entity: GTEntity, status: GTStatus) => Promise<void>;
}) {
  return (
    <DataTable
      columns={['Organizatie', 'Status', '5SO04', '5SR04', 'Intrare', 'Actiuni']}
      rows={entities.map((entity) => [
        entity.organizationName ?? entity.organizationId,
        onUpdateStatus ? (
          <Select key={`${entity.id}-status`} value={entity.status} onValueChange={(value) => onUpdateStatus(entity, value as GTStatus)}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {GT_STATUSES.map((status) => <SelectItem key={status} value={status}>{GT_STATUS_LABELS[status]}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : (
          <StatusBadge key={entity.id} status={GT_STATUS_BADGE[entity.status]}>{GT_STATUS_LABELS[entity.status]}</StatusBadge>
        ),
        entity.indicator5SO04 || entity.dataIntrareOperatiune ? 'Da' : 'Nu',
        entity.indicator5SR04 ? 'Da' : 'Nu',
        formatDate(entity.dataIntrareOperatiune),
        <Button key={`${entity.id}-open`} variant="outline" size="sm" onClick={() => onSelect?.(entity)}>
          <FileText className="h-4 w-4" /> Deschide
        </Button>,
      ])}
      emptyLabel="Nu exista entitati GT."
    />
  );
}

function DocumentsTable({ documents, canManage, onValidate }: {
  documents: GTDocument[];
  canManage: boolean;
  onValidate: (document: GTDocument) => Promise<void>;
}) {
  return (
    <DataTable
      columns={['Document', 'Fisier', 'Status', 'Observatii', 'Actiune']}
      rows={documents.map((document) => [
        GT_DOCUMENT_LABELS[document.documentType] ?? document.documentType,
        document.fileName ?? '-',
        <StatusBadge key={`${document.id}-status`} status={documentStatusBadge(document.status)}>{document.status}</StatusBadge>,
        document.notes ?? '-',
        <Button key={document.id} variant="outline" size="sm" onClick={() => onValidate(document)} disabled={!canManage || document.status === 'validat'}>
          <CheckCircle2 className="h-4 w-4" /> Valideaza
        </Button>,
      ])}
      emptyLabel="Nu exista documente incarcate pentru aceasta entitate."
    />
  );
}

function MonitoringTable({ records, entityById }: { records: GTMonitoringRecord[]; entityById: Map<string, GTEntity> }) {
  return (
    <DataTable
      columns={['Data', 'Entitate', 'Descriere', 'Indicator', 'Rezultat']}
      rows={records.map((record) => [
        formatDate(record.date),
        record.gtEntityId ? entityById.get(record.gtEntityId)?.organizationName ?? record.gtEntityId : record.gtPersonId ?? '-',
        record.descriere ?? '-',
        record.indicatorCode ?? '-',
        record.rezultat ?? '-',
      ])}
      emptyLabel="Nu exista inregistrari de monitorizare."
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
