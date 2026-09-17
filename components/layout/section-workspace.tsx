'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';

export type WorkspaceSection = { id: string; title: string; description: string; content: ReactNode };

/** One module tab, with searchable sections and bookmarkable locations. */
export function SectionWorkspace({ title, description, tab, initialSection, sections }: {
  title: string;
  description: string;
  tab: string;
  initialSection: string;
  sections: WorkspaceSection[];
}) {
  const [section, setSection] = useState(initialSection);
  const [query, setQuery] = useState('');
  useEffect(() => {
    const restore = () => {
      const value = new URLSearchParams(window.location.search).get('section');
      if (value && sections.some((item) => item.id === value)) setSection(value);
    };
    restore();
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, [sections]);
  const selectSection = (value: string) => {
    setSection(value);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    url.searchParams.set('section', value);
    window.history.replaceState(null, '', url);
  };
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const visible = sections.filter((item) => normalize(`${item.title} ${item.description}`).includes(normalize(query)));
  const active = sections.find((item) => item.id === section) || sections[0];

  return <section className="space-y-5" aria-label={title}>
    <div>
      <h2 className="text-xl font-bold text-slate-950">{title}</h2>
      <p className="mt-1 max-w-4xl text-sm text-muted-foreground">{description}</p>
    </div>
    <Tabs value={active.id} onValueChange={selectSection} orientation="vertical" className="grid items-start gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
      <label className="space-y-2 text-sm font-medium lg:hidden">
        <span>Secțiune</span>
        <select className="w-full rounded-lg border bg-white p-3" value={active.id} onChange={(event) => selectSection(event.target.value)}>
          {sections.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select>
      </label>
      <div className="hidden space-y-3 rounded-xl border bg-slate-50 p-3 lg:sticky lg:top-32 lg:block lg:max-h-[calc(100vh-9rem)] lg:overflow-y-auto">
        <Input aria-label={`Caută în ${title}`} placeholder="Caută o secțiune…" value={query} onChange={(event) => setQuery(event.target.value)} />
        <TabsList aria-label={`Secțiuni ${title}`} className="flex h-auto w-full flex-col gap-1 bg-transparent p-0">
          {sections.map((item) => <TabsTrigger key={item.id} value={item.id}
            className={`h-auto w-full flex-col items-start whitespace-normal px-3 py-3 text-left data-[state=active]:bg-white data-[state=active]:text-primary ${!visible.includes(item) && item.id !== active.id ? 'hidden' : ''}`}>
            <span className="font-semibold">{item.title}</span>
            <span className="mt-1 text-xs font-normal text-muted-foreground">{item.description}</span>
          </TabsTrigger>)}
        </TabsList>
        {!visible.length && <p className="px-3 text-xs text-muted-foreground">Nicio secțiune găsită. Secțiunea deschisă rămâne vizibilă.</p>}
      </div>
      <div className="min-w-0">
        {sections.map((item) => <TabsContent key={item.id} value={item.id} className="m-0 space-y-4">{item.content}</TabsContent>)}
      </div>
    </Tabs>
  </section>;
}
