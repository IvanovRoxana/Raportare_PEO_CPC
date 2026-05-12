'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Users } from 'lucide-react';
import { GT_ORGANIZATIONS, GT_ACTIVITY_TYPES } from '@/lib/deliverable-types';
import type { GrupTintaEntry } from '@/lib/types';

interface GrupTintaSectionProps {
  expertId: string;
  month: number;
  year: number;
  items: GrupTintaEntry[];
  onSave: (items: GrupTintaEntry[]) => void;
  readOnly?: boolean;
}

export function GrupTintaSection({
  expertId,
  month,
  year,
  items,
  onSave,
  readOnly = false,
}: GrupTintaSectionProps) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Partial<GrupTintaEntry>>({
    date: '',
    type: '',
    organizations: [],
    participants: 0,
    notes: '',
  });

  const MONTHS = ['Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie', 
                  'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie'];
  const monthName = MONTHS[month];

  const addItem = () => {
    if (!form.date || !form.organizations?.length) return;
    const newItem: GrupTintaEntry = {
      id: `gt_${Date.now()}`,
      expertId,
      date: form.date,
      type: form.type || '',
      organizations: form.organizations,
      participants: Number(form.participants) || 0,
      notes: form.notes || '',
      month,
      year,
    };
    const updated = [...items, newItem].sort((a, b) => a.date.localeCompare(b.date));
    onSave(updated);
    setForm({ date: '', type: '', organizations: [], participants: 0, notes: '' });
    setShowForm(false);
  };

  const removeItem = (id: string) => {
    onSave(items.filter(i => i.id !== id));
  };

  const toggleOrg = (orgId: string) => {
    setForm(f => ({
      ...f,
      organizations: f.organizations?.includes(orgId)
        ? f.organizations.filter(x => x !== orgId)
        : [...(f.organizations || []), orgId],
    }));
  };

  const totalParticipants = items.reduce((s, i) => s + (i.participants || 0), 0);
  const orgCounts: Record<string, number> = {};
  items.forEach(i => (i.organizations || []).forEach(o => {
    orgCounts[o] = (orgCounts[o] || 0) + (i.participants || 0);
  }));

  return (
    <div className="p-5">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <div>
          <div className="text-sm font-medium text-slate-900">
            Implicare Grup Țintă — {monthName} {year}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            Activități cu participare din organizațiile membre GT · opțional
          </div>
        </div>
        <div className="flex gap-2 items-center">
          {totalParticipants > 0 && (
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
              <Users className="h-3 w-3 mr-1" />
              Total: {totalParticipants} participanți
            </Badge>
          )}
          {!readOnly && (
            <Button
              onClick={() => setShowForm(s => !s)}
              variant={showForm ? 'secondary' : 'default'}
              size="sm"
              className="text-xs"
            >
              {showForm ? 'Anulează' : <><Plus className="h-3 w-3 mr-1" /> Adaugă interacțiune GT</>}
            </Button>
          )}
        </div>
      </div>

      {/* Add Form */}
      {showForm && (
        <div className="bg-blue-50 rounded-lg p-4 border border-blue-200 mb-4 flex flex-col gap-3">
          <div className="font-medium text-xs text-blue-800">Înregistrare interacțiune GT</div>
          
          {/* Data + Tip */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[10px] font-medium text-slate-600">Data *</Label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm(f => ({ ...f, date: e.target.value }))}
                className="text-xs mt-1"
              />
            </div>
            <div>
              <Label className="text-[10px] font-medium text-slate-600">Tip activitate</Label>
              <Select
                value={form.type}
                onValueChange={(v) => setForm(f => ({ ...f, type: v }))}
              >
                <SelectTrigger className="text-xs mt-1">
                  <SelectValue placeholder="— Selectează —" />
                </SelectTrigger>
                <SelectContent>
                  {GT_ACTIVITY_TYPES.map(t => (
                    <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Organizations */}
          <div>
            <Label className="text-[10px] font-medium text-slate-600 mb-2 block">
              Organizații GT implicate *
            </Label>
            <div className="flex flex-wrap gap-2">
              {GT_ORGANIZATIONS.map(org => (
                <label
                  key={org.id}
                  className={`flex items-center gap-2 cursor-pointer px-3 py-1.5 rounded-lg text-xs border ${
                    form.organizations?.includes(org.id)
                      ? 'border-blue-500 bg-blue-100 text-blue-800'
                      : 'border-blue-200 bg-white/70 text-slate-600'
                  }`}
                >
                  <Checkbox
                    checked={form.organizations?.includes(org.id)}
                    onCheckedChange={() => toggleOrg(org.id)}
                    className="h-3 w-3"
                  />
                  <span className="font-medium">{org.name}</span>
                  <span className="text-[10px] text-slate-500">{org.full.split(' ')[0]}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Participants + Notes */}
          <div className="grid grid-cols-[140px_1fr] gap-3">
            <div>
              <Label className="text-[10px] font-medium text-slate-600">Nr. participanți GT</Label>
              <Input
                type="number"
                min={0}
                value={form.participants || ''}
                onChange={(e) => setForm(f => ({ ...f, participants: Number(e.target.value) || 0 }))}
                placeholder="0"
                className="text-xs mt-1"
              />
            </div>
            <div>
              <Label className="text-[10px] font-medium text-slate-600">Notițe (opțional)</Label>
              <Input
                value={form.notes}
                onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="ex: Masă rotundă legislație muncă, 3 reprezentanți ANIS..."
                className="text-xs mt-1"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={addItem}
              disabled={!form.date || !form.organizations?.length}
              size="sm"
              className="text-xs bg-blue-600 hover:bg-blue-700"
            >
              Salvează interacțiune
            </Button>
          </div>
        </div>
      )}

      {/* Organizations Summary */}
      {items.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {GT_ORGANIZATIONS.filter(o => orgCounts[o.id]).map(o => (
            <Badge
              key={o.id}
              variant="outline"
              className="bg-blue-50 text-blue-800 border-blue-200"
            >
              <span className="font-bold mr-1">{o.name}</span>
              {orgCounts[o.id]} part.
            </Badge>
          ))}
        </div>
      )}

      {/* Items List */}
      {items.length === 0 ? (
        <div className="bg-slate-50 rounded-lg p-7 text-center text-slate-400 text-sm">
          Nicio activitate cu Grup Țintă înregistrată în {monthName} {year}. 
          Experții pot marca implicarea GT folosind butonul de mai sus.
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="bg-slate-800 px-4 py-2 text-xs font-medium text-white">
            Jurnal activități cu GT — {monthName} {year}
          </div>
          <div className="divide-y divide-slate-100">
            {items.map((item) => {
              const dt = new Date(item.date);
              const ds = isNaN(dt.getTime()) ? '' : dt.toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit' });
              
              return (
                <div key={item.id} className="px-4 py-2 flex gap-3 items-start">
                  <div className="text-[10px] font-semibold text-slate-500 min-w-[36px] flex-shrink-0">
                    {ds}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-slate-900 overflow-hidden text-ellipsis whitespace-nowrap">
                      {item.type || 'Activitate GT'}
                    </div>
                    {item.notes && (
                      <div className="text-[10px] text-slate-500">{item.notes}</div>
                    )}
                  </div>
                  <div className="flex gap-1 flex-wrap justify-end flex-shrink-0">
                    {item.organizations.map(id => (
                      <Badge key={id} className="text-[9px] px-1.5 py-0 bg-blue-100 text-blue-800">
                        {id.toUpperCase()}
                      </Badge>
                    ))}
                    {item.participants > 0 && (
                      <Badge className="text-[9px] px-1.5 py-0 bg-purple-100 text-purple-800">
                        {item.participants}p
                      </Badge>
                    )}
                  </div>
                  {!readOnly && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeItem(item.id)}
                      className="h-6 w-6 p-0 text-slate-400 hover:text-red-600"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
