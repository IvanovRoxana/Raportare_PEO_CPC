'use client';

import { useState } from 'react';
import { Building2, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  useBusinessHubEntityDirectory,
  useBusinessHubEntityDirectoryMutations,
} from '@/hooks/use-backend-data';
import type { BusinessHubEntityDirectoryEntry } from '@/lib/types';

const EMPTY_FORM: Omit<BusinessHubEntityDirectoryEntry, 'id' | 'createdAt' | 'updatedAt'> = {
  directoryType: 'affiliate',
  acronym: '',
  legalName: '',
  displayName: '',
  registeredAddress: '',
  cuiOrCif: '',
  phone: '',
  email: '',
  legalRepresentativeName: '',
  legalRepresentativeRole: '',
  designatedPersonName: '',
  status: 'active',
  source: 'manual',
};

export function BusinessHubEntityDirectoryPanel() {
  const { entries, isLoading, mutate } = useBusinessHubEntityDirectory();
  const { create, remove } = useBusinessHubEntityDirectoryMutations();
  const [form, setForm] = useState(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateField = (field: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleCreate = async () => {
    setError(null);
    if (!form.acronym.trim() || !form.legalName.trim()) {
      setError('Completeaza acronimul si denumirea juridica.');
      return;
    }
    setIsSaving(true);
    try {
      await create({
        ...form,
        acronym: form.acronym.trim(),
        legalName: form.legalName.trim(),
        displayName: optionalText(form.displayName),
        registeredAddress: optionalText(form.registeredAddress),
        cuiOrCif: optionalText(form.cuiOrCif),
        phone: optionalText(form.phone),
        email: optionalText(form.email),
        legalRepresentativeName: optionalText(form.legalRepresentativeName),
        legalRepresentativeRole: optionalText(form.legalRepresentativeRole),
        designatedPersonName: optionalText(form.designatedPersonName),
      });
      setForm(EMPTY_FORM);
      mutate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut salva entitatea.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setError(null);
    try {
      await remove(id);
      mutate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut sterge entitatea.');
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[420px_1fr]">
      <div className="rounded-xl border bg-slate-50/70 p-5">
        <div className="mb-4 flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" />
          <div>
            <p className="font-semibold text-slate-950">Entitate Business Hub</p>
            <p className="text-xs text-muted-foreground">Date folosite la generarea adreselor lunare.</p>
          </div>
        </div>

        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tip director</Label>
              <Select value={form.directoryType} onValueChange={(value) => updateField('directoryType', value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="affiliate">Organizatie afiliata CPC</SelectItem>
                  <SelectItem value="target_group">Entitate grup tinta</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Acronim *</Label>
              <Input value={form.acronym} onChange={(event) => updateField('acronym', event.target.value)} placeholder="ex. CPBR" />
            </div>
          </div>

          <div>
            <Label>Denumire juridica *</Label>
            <Input value={form.legalName} onChange={(event) => updateField('legalName', event.target.value)} />
          </div>
          <div>
            <Label>Denumire afisata</Label>
            <Input value={form.displayName} onChange={(event) => updateField('displayName', event.target.value)} />
          </div>
          <div>
            <Label>Sediu</Label>
            <Input value={form.registeredAddress} onChange={(event) => updateField('registeredAddress', event.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>CUI/CIF</Label>
              <Input value={form.cuiOrCif} onChange={(event) => updateField('cuiOrCif', event.target.value)} />
            </div>
            <div>
              <Label>Telefon</Label>
              <Input value={form.phone} onChange={(event) => updateField('phone', event.target.value)} />
            </div>
          </div>

          <div>
            <Label>Email</Label>
            <Input value={form.email} onChange={(event) => updateField('email', event.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Reprezentant legal</Label>
              <Input value={form.legalRepresentativeName} onChange={(event) => updateField('legalRepresentativeName', event.target.value)} />
            </div>
            <div>
              <Label>Functie reprezentant</Label>
              <Input value={form.legalRepresentativeRole} onChange={(event) => updateField('legalRepresentativeRole', event.target.value)} />
            </div>
          </div>

          <div>
            <Label>Persoana desemnata</Label>
            <Input value={form.designatedPersonName} onChange={(event) => updateField('designatedPersonName', event.target.value)} />
          </div>

          {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

          <Button onClick={handleCreate} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Adauga entitate
          </Button>
        </div>
      </div>

      <div className="rounded-xl border bg-white">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <p className="font-semibold text-slate-950">Director Business Hub</p>
            <p className="text-xs text-muted-foreground">{entries.length} entitati configurate</p>
          </div>
        </div>

        <div className="divide-y">
          {isLoading && <div className="p-5 text-sm text-muted-foreground">Se incarca...</div>}
          {!isLoading && entries.length === 0 && (
            <div className="p-5 text-sm text-muted-foreground">Nu exista entitati in director.</div>
          )}
          {entries.map((entry) => (
            <div key={entry.id} className="grid gap-3 p-5 md:grid-cols-[1fr_auto]">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-slate-950">{entry.acronym}</p>
                  <Badge variant="outline">{entry.directoryType === 'affiliate' ? 'Afiliata CPC' : 'Grup tinta'}</Badge>
                  {entry.designatedPersonName && <Badge variant="secondary">{entry.designatedPersonName}</Badge>}
                </div>
                <p className="mt-1 text-sm text-slate-700">{entry.legalName}</p>
                <p className="mt-1 text-xs text-muted-foreground">{[entry.cuiOrCif, entry.email, entry.phone].filter(Boolean).join(' - ')}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => handleDelete(entry.id)} aria-label="Sterge entitatea">
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function optionalText(value?: string) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}
