'use client';

import { useState } from 'react';
import { Plus, AlertTriangle, Check, X, Edit2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { generateId, formatDateRo } from '@/lib/app-utils';
import type { Neconformitate } from '@/lib/types';

interface NeconformitatiTabProps {
  data: Neconformitate[];
  onDataChange: (data: Neconformitate[]) => void;
  onCreate?: (item: Omit<Neconformitate, 'id' | 'createdAt'>) => Promise<Neconformitate | null | void>;
  onUpdate?: (id: string, updates: Partial<Omit<Neconformitate, 'id' | 'createdAt'>>) => Promise<Neconformitate | null | void>;
  onResolve?: (id: string, resolution: string) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}

const TYPES = [
  { value: 'pontaj', label: 'Pontaj' },
  { value: 'raport', label: 'Raport Activitate' },
  { value: 'livrabil', label: 'Livrabil' },
  { value: 'cross-expert', label: 'Cross-Expert' },
  { value: 'other', label: 'Altele' },
];

const SEVERITIES = [
  { value: 'low', label: 'Scăzută', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'medium', label: 'Medie', color: 'bg-orange-100 text-orange-800' },
  { value: 'high', label: 'Ridicată', color: 'bg-red-100 text-red-800' },
];

export function NeconformitatiTab({ data, onDataChange, onCreate, onUpdate, onResolve, onDelete }: NeconformitatiTabProps) {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<Neconformitate>>({
    type: 'pontaj',
    severity: 'medium',
    description: '',
    affectedDate: '',
    affectedExpert: '',
    resolved: false,
    resolution: '',
  });

  const resetForm = () => {
    setFormData({
      type: 'pontaj',
      severity: 'medium',
      description: '',
      affectedDate: '',
      affectedExpert: '',
      resolved: false,
      resolution: '',
    });
    setEditingId(null);
  };

  const handleSave = async () => {
    if (!formData.description) return;
    setSavingId(editingId || 'new');

    try {
      if (editingId) {
        const updates = {
          type: formData.type as Neconformitate['type'],
          severity: formData.severity as Neconformitate['severity'],
          description: formData.description || '',
          affectedDate: formData.affectedDate,
          affectedExpertId: formData.affectedExpertId,
          affectedExpert: formData.affectedExpert,
          resolved: formData.resolved ?? false,
          resolution: formData.resolution,
        };
        const persisted = await onUpdate?.(editingId, updates);
        const updated = data.map((item) =>
          item.id === editingId ? { ...item, ...updates, ...(persisted || {}) } : item
        );
        onDataChange(updated);
      } else {
        const newItem: Neconformitate = {
          id: generateId(),
          type: formData.type as Neconformitate['type'],
          severity: formData.severity as Neconformitate['severity'],
          description: formData.description || '',
          affectedDate: formData.affectedDate,
          affectedExpertId: formData.affectedExpertId,
          affectedExpert: formData.affectedExpert,
          resolved: false,
          createdAt: new Date().toISOString(),
        };
        const persisted = await onCreate?.(newItem);
        onDataChange([...(persisted ? [persisted] : [newItem]), ...data]);
      }

      resetForm();
      setIsAddOpen(false);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Neconformitatea nu a putut fi salvată.');
    } finally {
      setSavingId(null);
    }
  };

  const handleEdit = (item: Neconformitate) => {
    setFormData(item);
    setEditingId(item.id);
    setIsAddOpen(true);
  };

  const handleResolve = async (id: string, resolution: string) => {
    setSavingId(id);
    try {
      await onResolve?.(id, resolution);
      const updated = data.map((item) =>
        item.id === id ? { ...item, resolved: true, resolution, resolvedAt: new Date().toISOString() } : item
      );
      onDataChange(updated);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Neconformitatea nu a putut fi rezolvată.');
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setSavingId(id);
    try {
      await onDelete?.(id);
      onDataChange(data.filter((item) => item.id !== id));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Neconformitatea nu a putut fi ștearsă.');
    } finally {
      setSavingId(null);
    }
  };

  const unresolvedCount = data.filter((item) => !item.resolved).length;
  const highSeverityCount = data.filter((item) => item.severity === 'high' && !item.resolved).length;

  const getSeverityBadge = (severity: string) => {
    const sev = SEVERITIES.find((s) => s.value === severity);
    return sev ? sev.color : 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="space-y-6">
      {/* Summary Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Neconformități
              </CardTitle>
              <CardDescription>
                Total: {data.length} | Nerezolvate: {unresolvedCount} | Severitate ridicată: {highSeverityCount}
              </CardDescription>
            </div>
            <Dialog open={isAddOpen} onOpenChange={(open) => {
              setIsAddOpen(open);
              if (!open) resetForm();
            }}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Adaugă neconformitate
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {editingId ? 'Editare neconformitate' : 'Adăugare neconformitate'}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Tip</Label>
                      <Select
                        value={formData.type}
                        onValueChange={(v) => setFormData({ ...formData, type: v as Neconformitate['type'] })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TYPES.map((type) => (
                            <SelectItem key={type.value} value={type.value}>
                              {type.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Severitate</Label>
                      <Select
                        value={formData.severity}
                        onValueChange={(v) => setFormData({ ...formData, severity: v as Neconformitate['severity'] })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SEVERITIES.map((sev) => (
                            <SelectItem key={sev.value} value={sev.value}>
                              {sev.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Data afectată</Label>
                      <Input
                        type="date"
                        value={formData.affectedDate || ''}
                        onChange={(e) => setFormData({ ...formData, affectedDate: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Expert afectat</Label>
                      <Input
                        value={formData.affectedExpert || ''}
                        onChange={(e) => setFormData({ ...formData, affectedExpert: e.target.value })}
                        placeholder="Numele expertului"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Descriere</Label>
                    <Textarea
                      value={formData.description || ''}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Descrierea detaliată a neconformității..."
                      rows={4}
                    />
                  </div>

                  <Button onClick={handleSave} className="w-full" disabled={!formData.description || savingId !== null}>
                    {editingId ? 'Salvează modificările' : 'Adaugă'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
      </Card>

      {/* List */}
      {data.length > 0 ? (
        <div className="space-y-3">
          {data.map((item) => (
            <Card key={item.id} className={item.resolved ? 'opacity-60' : ''}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline">{TYPES.find((t) => t.value === item.type)?.label}</Badge>
                      <Badge className={getSeverityBadge(item.severity)}>
                        {SEVERITIES.find((s) => s.value === item.severity)?.label}
                      </Badge>
                      {item.resolved && (
                        <Badge className="bg-green-100 text-green-800">
                          <Check className="h-3 w-3 mr-1" />
                          Rezolvat
                        </Badge>
                      )}
                      {item.affectedDate && (
                        <span className="text-xs text-muted-foreground">
                          Data: {formatDateRo(item.affectedDate)}
                        </span>
                      )}
                      {item.affectedExpert && (
                        <span className="text-xs text-muted-foreground">
                          Expert: {item.affectedExpert}
                        </span>
                      )}
                    </div>
                    <p className="text-sm">{item.description}</p>
                    {item.resolution && (
                      <p className="text-sm text-muted-foreground">
                        <span className="font-medium">Rezoluție:</span> {item.resolution}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {!item.resolved && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(item)}
                          disabled={savingId !== null}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-green-600"
                          disabled={savingId !== null}
                          onClick={() => {
                            const resolution = prompt('Introduceți rezoluția:');
                            if (resolution) handleResolve(item.id, resolution);
                          }}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive"
                      disabled={savingId !== null}
                      onClick={() => handleDelete(item.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-20" />
            <p>Nu există neconformități înregistrate.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
