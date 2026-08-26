'use client';

import { useMemo, useState } from 'react';
import { Building2, SearchIcon, UsersRound } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { WorkingGroup } from '@/lib/types';
import fallbackWorkingGroups from '@/data/import/working-groups.json';

type WorkingGroupsTabProps = {
  groups: WorkingGroup[];
  isLoading?: boolean;
  error?: unknown;
};

const TYPE_ORDER: WorkingGroup['type'][] = ['Task Force', 'Club', 'Structura'];

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function mergeWorkingGroups(backendGroups: WorkingGroup[]) {
  const merged = new Map<string, WorkingGroup>();

  [...(fallbackWorkingGroups as WorkingGroup[]), ...backendGroups].forEach((group) => {
    if (group.isActive === false) return;
    const key = `${normalizeText(group.type)}::${normalizeText(group.name)}`;
    merged.set(key, group);
  });

  return [...merged.values()].sort((a, b) => {
    const typeOrder = TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type);
    return typeOrder || a.name.localeCompare(b.name, 'ro');
  });
}

export function WorkingGroupsTab({ groups, isLoading = false, error }: WorkingGroupsTabProps) {
  const [query, setQuery] = useState('');
  const workingGroups = useMemo(() => mergeWorkingGroups(groups), [groups]);
  const normalizedQuery = normalizeText(query.trim());
  const filteredGroups = useMemo(() => {
    if (!normalizedQuery) return workingGroups;
    return workingGroups.filter((group) => (
      normalizeText(`${group.name} ${group.type} ${group.saCode || ''}`).includes(normalizedQuery)
    ));
  }, [normalizedQuery, workingGroups]);
  const countsByType = useMemo(() => (
    TYPE_ORDER.map((type) => ({
      type,
      count: workingGroups.filter((group) => group.type === type).length,
    }))
  ), [workingGroups]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h3 className="text-sm font-medium text-slate-900">Grupuri de lucru</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            {isLoading ? 'Se incarca denumirile...' : `${workingGroups.length} grupuri active`}
            {error ? ' · date backend indisponibile temporar' : ''}
          </p>
        </div>
        <div className="relative w-full lg:w-80">
          <SearchIcon className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="pl-9"
            placeholder="Cauta grup"
          />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {countsByType.map(({ type, count }) => (
          <Card key={type}>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-lg bg-slate-100 p-2 text-slate-700">
                {type === 'Club' ? <Building2 className="h-4 w-4" /> : <UsersRound className="h-4 w-4" />}
              </div>
              <div>
                <div className="text-xl font-bold text-slate-900">{count}</div>
                <div className="text-xs text-slate-500">{type}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Denumiri grupuri</CardTitle>
          <CardDescription>Lista operationala pentru raportarea SA3.4.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Denumire</th>
                  <th className="px-4 py-3 font-medium">Tip</th>
                  <th className="px-4 py-3 font-medium">SA</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredGroups.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500">
                      Nu exista grupuri pentru filtrul selectat.
                    </td>
                  </tr>
                ) : (
                  filteredGroups.map((group) => (
                    <tr key={group.id} className="align-top">
                      <td className="px-4 py-3 font-medium text-slate-900">{group.name}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline">{group.type}</Badge>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{group.saCode || '-'}</td>
                      <td className="px-4 py-3">
                        <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Activ</Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
