'use client';

import { useState } from 'react';
import { Database, MessageSquare } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SupportTicketsPanel } from './support-tickets-panel';
import { SectionWorkspace } from '@/components/layout/section-workspace';
import { AdminUsersTable } from './admin-users-table';
import { UsersRolesManagementPanel } from './users-roles-management-panel';
import { AdminProjectsPanel } from './admin-projects-panel';
import { ActivityDescriptionEditor } from './activity-description-editor';
import { PeoExpertCategoriesPanel } from './peo-expert-categories-panel';
import { ReportingPeriodsPanel } from './reporting-periods-panel';
import { PontajSignaturesPanel } from './pontaj-signatures-panel';
import { BusinessHubEntityDirectoryPanel } from './business-hub-entity-directory-panel';
import { HistoricalImportPanel } from './historical-import-panel';
import { DataInfrastructurePanel } from './data-infrastructure-panel';
import { DataRecordsPanel } from './data-records-panel';
import activityCatalog from '@/data/import/activity-catalog.json';
import type { ActivityCatalog } from '@/lib/types';

export function AdminWorkspace({ initialTab, initialSection }: { initialTab: string; initialSection: string }) {
  const [tab, setTab] = useState(initialTab);
  const [section, setSection] = useState(initialSection);
  return <Tabs value={tab} onValueChange={(value) => {
    const url = new URL(window.location.href);
    const currentSection = url.searchParams.get('section') || section;
    setSection(currentSection);
    setTab(value);
    url.searchParams.set('tab', value);
    url.searchParams.set('section', currentSection);
    window.history.replaceState(null, '', url);
  }} className="space-y-5">
    <TabsList className="h-auto flex-wrap">
      <TabsTrigger value="surse-date"><Database className="h-4 w-4" />Surse de date</TabsTrigger>
      <TabsTrigger value="suport"><MessageSquare className="h-4 w-4" />Suport UAT</TabsTrigger>
    </TabsList>
    <TabsContent value="surse-date" className="rounded-2xl border bg-white p-4 sm:p-6"><DataSourcesWorkspace initialSection={section} /></TabsContent>
    <TabsContent value="suport"><SupportTicketsPanel /></TabsContent>
  </Tabs>;
}

export function DataSourcesWorkspace({ initialSection }: { initialSection: string }) {
  return <SectionWorkspace title="Surse de date" tab="surse-date" initialSection={initialSection}
    description="Registrele aplicației, utilizatorii, proiectele, documentele și întreținerea datelor, centralizate în Admin."
    sections={[
      { id: 'experti', title: 'Experți și profiluri', description: 'Date contractuale, alocări și acces PM', content: <AdminUsersTable /> },
      { id: 'roluri', title: 'Conturi și roluri', description: 'Utilizatori, permisiuni și acces', content: <UsersRolesManagementPanel /> },
      { id: 'proiecte', title: 'Proiecte', description: 'Coduri, beneficiari și perioade', content: <AdminProjectsPanel /> },
      { id: 'subactivitati', title: 'Subactivități și catalog', description: 'Date de bază, descrieri oficiale și import', content: <ActivityDescriptionEditor fallbackCatalog={activityCatalog as ActivityCatalog[]} /> },
      { id: 'categorii-experti', title: 'Categorii experți', description: 'Nomenclatorul categoriilor PEO', content: <PeoExpertCategoriesPanel /> },
      { id: 'perioade-raportare', title: 'Perioade de raportare', description: 'Luni, termene și configurare', content: <ReportingPeriodsPanel /> },
      { id: 'semnaturi-pontaj', title: 'Semnături pontaj', description: 'Responsabili și reprezentanți', content: <PontajSignaturesPanel /> },
      { id: 'business-hub', title: 'Business Hub', description: 'Registrul organizațiilor', content: <BusinessHubEntityDirectoryPanel /> },
      { id: 'import', title: 'Import istoric', description: 'Dosare, pontaje și fișiere originale', content: <HistoricalImportPanel /> },
      { id: 'documente', title: 'Documente și rezultate', description: 'Stocare, verificări, versiuni reguli și jurnal', content: <DataRecordsPanel /> },
      { id: 'infrastructura', title: 'Servicii și index RAG', description: 'Status API, index și reparare metadate', content: <DataInfrastructurePanel /> },
    ]} />;
}
