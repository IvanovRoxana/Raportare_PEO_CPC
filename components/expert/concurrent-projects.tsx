'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Trash2, AlertTriangle, Check, Building2 } from 'lucide-react';

export interface ConcurrentProject {
  id: string;
  projectCode: string;
  projectTitle: string;
  fundingSource: string;
  role: string;
  monthlyHours: number;
  startDate: string;
  endDate: string;
}

interface ConcurrentProjectsProps {
  expertId: string;
  month: number;
  year: number;
  projects: ConcurrentProject[];
  currentProjectHours: number;
  onSave: (projects: ConcurrentProject[]) => void;
}

const MAX_MONTHLY_HOURS = 168; // Maximum legal hours per month

export function ConcurrentProjects({
  expertId,
  month,
  year,
  projects,
  currentProjectHours,
  onSave,
}: ConcurrentProjectsProps) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Partial<ConcurrentProject>>({
    projectCode: '',
    projectTitle: '',
    fundingSource: '',
    role: '',
    monthlyHours: 0,
    startDate: '',
    endDate: '',
  });

  const MONTHS = ['Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie', 
                  'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie'];
  const monthName = MONTHS[month];

  const totalOtherHours = projects.reduce((sum, p) => sum + (p.monthlyHours || 0), 0);
  const totalAllHours = currentProjectHours + totalOtherHours;
  const isOverLimit = totalAllHours > MAX_MONTHLY_HOURS;

  const addProject = () => {
    if (!form.projectCode || !form.projectTitle) return;
    const newProject: ConcurrentProject = {
      id: `proj_${Date.now()}`,
      projectCode: form.projectCode || '',
      projectTitle: form.projectTitle || '',
      fundingSource: form.fundingSource || '',
      role: form.role || '',
      monthlyHours: Number(form.monthlyHours) || 0,
      startDate: form.startDate || '',
      endDate: form.endDate || '',
    };
    onSave([...projects, newProject]);
    setForm({
      projectCode: '',
      projectTitle: '',
      fundingSource: '',
      role: '',
      monthlyHours: 0,
      startDate: '',
      endDate: '',
    });
    setShowForm(false);
  };

  const removeProject = (id: string) => {
    onSave(projects.filter(p => p.id !== id));
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Proiecte Concurente — {monthName} {year}
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              Verificare dublă finanțare: declară alte proiecte în care ești implicat
            </CardDescription>
          </div>
          {!showForm && (
            <Button onClick={() => setShowForm(true)} size="sm" variant="outline" className="text-xs">
              <Plus className="h-3 w-3 mr-1" />
              Adaugă proiect
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Hours Summary */}
        <div className={`p-3 rounded-lg border ${isOverLimit ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-600">Ore proiect curent:</span>
            <span className="font-medium">{currentProjectHours}h</span>
          </div>
          <div className="flex justify-between items-center text-xs mt-1">
            <span className="text-slate-600">Ore alte proiecte:</span>
            <span className="font-medium">{totalOtherHours}h</span>
          </div>
          <div className={`flex justify-between items-center text-xs mt-2 pt-2 border-t ${isOverLimit ? 'border-red-200' : 'border-slate-200'}`}>
            <span className={`font-medium ${isOverLimit ? 'text-red-700' : 'text-slate-700'}`}>
              TOTAL ORE LUNA:
            </span>
            <span className={`font-bold ${isOverLimit ? 'text-red-700' : 'text-slate-900'}`}>
              {totalAllHours}h / {MAX_MONTHLY_HOURS}h
            </span>
          </div>
          {isOverLimit && (
            <div className="flex items-center gap-2 mt-2 text-xs text-red-700">
              <AlertTriangle className="h-3 w-3" />
              Depășire limită legală de ore lunare!
            </div>
          )}
          {!isOverLimit && totalAllHours > 0 && (
            <div className="flex items-center gap-2 mt-2 text-xs text-green-700">
              <Check className="h-3 w-3" />
              Încadrare în limita legală
            </div>
          )}
        </div>

        {/* Add Form */}
        {showForm && (
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200 space-y-3">
            <div className="font-medium text-xs text-blue-800">Adaugă proiect concurent</div>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[10px] text-slate-600">Cod proiect *</Label>
                <Input
                  value={form.projectCode}
                  onChange={(e) => setForm(f => ({ ...f, projectCode: e.target.value }))}
                  placeholder="Ex: POCU/123/..."
                  className="text-xs mt-1"
                />
              </div>
              <div>
                <Label className="text-[10px] text-slate-600">Sursă finanțare</Label>
                <Input
                  value={form.fundingSource}
                  onChange={(e) => setForm(f => ({ ...f, fundingSource: e.target.value }))}
                  placeholder="Ex: POCU, PNRR, etc."
                  className="text-xs mt-1"
                />
              </div>
            </div>

            <div>
              <Label className="text-[10px] text-slate-600">Titlu proiect *</Label>
              <Input
                value={form.projectTitle}
                onChange={(e) => setForm(f => ({ ...f, projectTitle: e.target.value }))}
                placeholder="Denumirea completă a proiectului"
                className="text-xs mt-1"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-[10px] text-slate-600">Rol în proiect</Label>
                <Input
                  value={form.role}
                  onChange={(e) => setForm(f => ({ ...f, role: e.target.value }))}
                  placeholder="Ex: Expert"
                  className="text-xs mt-1"
                />
              </div>
              <div>
                <Label className="text-[10px] text-slate-600">Ore/lună</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.monthlyHours || ''}
                  onChange={(e) => setForm(f => ({ ...f, monthlyHours: Number(e.target.value) || 0 }))}
                  placeholder="0"
                  className="text-xs mt-1"
                />
              </div>
              <div>
                <Label className="text-[10px] text-slate-600">Perioadă</Label>
                <div className="flex gap-1 mt-1">
                  <Input
                    type="date"
                    value={form.startDate}
                    onChange={(e) => setForm(f => ({ ...f, startDate: e.target.value }))}
                    className="text-xs"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button onClick={() => setShowForm(false)} variant="ghost" size="sm" className="text-xs">
                Anulează
              </Button>
              <Button
                onClick={addProject}
                disabled={!form.projectCode || !form.projectTitle}
                size="sm"
                className="text-xs bg-blue-600 hover:bg-blue-700"
              >
                Salvează
              </Button>
            </div>
          </div>
        )}

        {/* Projects List */}
        {projects.length === 0 ? (
          <div className="text-center py-6 text-xs text-slate-400">
            Niciun proiect concurent declarat pentru {monthName} {year}
          </div>
        ) : (
          <div className="space-y-2">
            {projects.map((project) => (
              <div
                key={project.id}
                className="flex items-start justify-between p-3 bg-white border border-slate-200 rounded-lg"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">
                      {project.projectCode}
                    </Badge>
                    {project.fundingSource && (
                      <Badge variant="secondary" className="text-[10px]">
                        {project.fundingSource}
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs font-medium text-slate-900 mt-1 truncate">
                    {project.projectTitle}
                  </div>
                  <div className="flex gap-3 text-[10px] text-slate-500 mt-1">
                    {project.role && <span>Rol: {project.role}</span>}
                    <span className="font-medium text-slate-700">{project.monthlyHours}h/lună</span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeProject(project.id)}
                  className="text-slate-400 hover:text-red-600"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
