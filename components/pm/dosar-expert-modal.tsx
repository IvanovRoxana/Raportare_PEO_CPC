'use client';

import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Download, FileText, Calendar, Clock, Users, CheckCircle, AlertTriangle, Building2 } from 'lucide-react';
import type { Activity, Expert, VerificationData, Neconformitate } from '@/lib/types';
import { generateOpisDocument, downloadOpis } from '@/lib/opis-generator';

interface DosarExpertModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expert: Expert | null;
  activities: Activity[];
  verification: VerificationData | null;
  neconformitati: Neconformitate[];
  month: number;
  year: number;
  projectCode?: string;
  projectTitle?: string;
}

export function DosarExpertModal({
  open,
  onOpenChange,
  expert,
  activities,
  verification,
  neconformitati,
  month,
  year,
  projectCode = 'PEO',
  projectTitle = 'Program de Educatie si Ocupare',
}: DosarExpertModalProps) {
  const [activeTab, setActiveTab] = useState('sectiunea-a');
  const [isGeneratingOpis, setIsGeneratingOpis] = useState(false);

  const MONTHS = ['Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie', 
                  'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie'];
  const monthName = MONTHS[month];

  // Calculate stats
  const stats = useMemo(() => {
    const totalHours = activities.reduce((sum, a) => sum + (a.hours || 0), 0);
    const totalActivities = activities.length;
    const totalDeliverables = activities.reduce((sum, a) => sum + (a.deliverables?.length || 0), 0);
    const workDays = new Set(activities.map(a => a.date)).size;
    const openIssues = neconformitati.filter(n => !n.resolved).length;
    
    return { totalHours, totalActivities, totalDeliverables, workDays, openIssues };
  }, [activities, neconformitati]);

  // Group activities by type
  const activitiesByType = useMemo(() => {
    const byType: Record<string, Activity[]> = {};
    activities.forEach(act => {
      const type = act.activityType || 'Nespecificat';
      if (!byType[type]) byType[type] = [];
      byType[type].push(act);
    });
    return Object.entries(byType).sort((a, b) => b[1].length - a[1].length);
  }, [activities]);

  // All deliverables
  const allDeliverables = useMemo(() => {
    return activities.flatMap(act => 
      (act.deliverables || []).map(d => ({
        ...d,
        activityDate: act.date,
        activityTitle: act.title,
        activityType: act.activityType,
      }))
    ).sort((a, b) => (a.activityDate || '').localeCompare(b.activityDate || ''));
  }, [activities]);

  const handleDownloadOpis = async () => {
    if (!expert) return;
    setIsGeneratingOpis(true);
    try {
      const blob = await generateOpisDocument(expert, activities, month, year, projectCode, projectTitle);
      downloadOpis(blob, expert, month, year);
    } catch (error) {
      console.error('Error generating OPIS:', error);
    } finally {
      setIsGeneratingOpis(false);
    }
  };

  if (!expert) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="p-2 bg-slate-100 rounded-lg">
              <Users className="h-5 w-5 text-slate-700" />
            </div>
            <div>
              <span>Dosar Expert: {expert.name}</span>
              <Badge variant="secondary" className="ml-2 text-xs">{expert.role}</Badge>
            </div>
          </DialogTitle>
          <DialogDescription>
            {monthName} {year} — {projectCode}
          </DialogDescription>
        </DialogHeader>

        {/* Quick Stats */}
        <div className="grid grid-cols-5 gap-2 py-3 border-y border-slate-200">
          <div className="text-center">
            <div className="text-lg font-bold text-slate-900">{stats.totalHours}h</div>
            <div className="text-[10px] text-slate-500">Ore totale</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-slate-900">{stats.workDays}</div>
            <div className="text-[10px] text-slate-500">Zile lucrate</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-slate-900">{stats.totalActivities}</div>
            <div className="text-[10px] text-slate-500">Activitati</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-slate-900">{stats.totalDeliverables}</div>
            <div className="text-[10px] text-slate-500">Livrabile</div>
          </div>
          <div className="text-center">
            <div className={`text-lg font-bold ${stats.openIssues > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {stats.openIssues}
            </div>
            <div className="text-[10px] text-slate-500">Neconformitati</div>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="sectiunea-a" className="text-xs">
              <FileText className="h-3 w-3 mr-1" />
              Sectiunea A - Activitati
            </TabsTrigger>
            <TabsTrigger value="sectiunea-b" className="text-xs">
              <Building2 className="h-3 w-3 mr-1" />
              Sectiunea B - Documente
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1 mt-3">
            {/* Section A - Activities */}
            <TabsContent value="sectiunea-a" className="mt-0 space-y-4">
              {/* Activities by Type */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Activitati per Sub-Activitate</CardTitle>
                </CardHeader>
                <CardContent>
                  {activitiesByType.length === 0 ? (
                    <div className="text-center py-6 text-xs text-slate-400">
                      Nicio activitate inregistrata
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {activitiesByType.map(([type, acts]) => (
                        <div key={type}>
                          <div className="flex justify-between items-center mb-2">
                            <Badge variant="outline" className="text-xs">{type}</Badge>
                            <span className="text-xs text-slate-500">
                              {acts.length} activitati · {acts.reduce((s, a) => s + (a.hours || 0), 0)}h
                            </span>
                          </div>
                          <div className="space-y-1 pl-3 border-l-2 border-slate-200">
                            {acts.map(act => {
                              const dt = new Date(act.date);
                              const ds = isNaN(dt.getTime()) ? '' : dt.toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit' });
                              return (
                                <div key={act.id} className="flex justify-between items-start text-xs py-1">
                                  <div className="flex gap-2">
                                    <span className="text-slate-400 w-10">{ds}</span>
                                    <span className="text-slate-700">{act.title || 'Activitate'}</span>
                                  </div>
                                  <span className="text-slate-500">{act.hours}h</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Calendar View */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Calendar Activitati</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-1 flex-wrap">
                    {Array.from({ length: 31 }, (_, i) => {
                      const day = i + 1;
                      const dayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                      const dayActs = activities.filter(a => a.date === dayStr);
                      const dayHours = dayActs.reduce((s, a) => s + (a.hours || 0), 0);
                      
                      return (
                        <div
                          key={day}
                          className={`w-7 h-7 rounded text-[10px] flex items-center justify-center ${
                            dayHours > 0 
                              ? dayHours > 4 ? 'bg-green-500 text-white' : 'bg-green-200 text-green-800'
                              : 'bg-slate-100 text-slate-400'
                          }`}
                          title={`${day} ${monthName}: ${dayHours}h`}
                        >
                          {day}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Issues */}
              {neconformitati.length > 0 && (
                <Card className={stats.openIssues > 0 ? 'border-red-200' : ''}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <AlertTriangle className={`h-4 w-4 ${stats.openIssues > 0 ? 'text-red-600' : 'text-green-600'}`} />
                      Neconformitati
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {neconformitati.map(nc => (
                        <div 
                          key={nc.id} 
                          className={`p-2 rounded-lg border text-xs ${
                            nc.resolved 
                              ? 'border-green-200 bg-green-50' 
                              : 'border-red-200 bg-red-50'
                          }`}
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <Badge variant={nc.resolved ? 'secondary' : 'destructive'} className="text-[10px] mb-1">
                                {nc.type}
                              </Badge>
                              <div className="text-slate-700">{nc.description}</div>
                            </div>
                            {nc.resolved ? (
                              <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
                            ) : (
                              <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0" />
                            )}
                          </div>
                          {nc.resolution && (
                            <div className="mt-1 text-[10px] text-slate-500">
                              Rezolvare: {nc.resolution}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Section B - Documents */}
            <TabsContent value="sectiunea-b" className="mt-0 space-y-4">
              {/* Download OPIS */}
              <Card>
                <CardContent className="py-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="text-sm font-medium text-slate-900">Export OPIS</div>
                      <div className="text-xs text-slate-500">
                        Genereaza documentul OPIS cu lista livrabilelor
                      </div>
                    </div>
                    <Button onClick={handleDownloadOpis} disabled={isGeneratingOpis} size="sm">
                      <Download className="h-4 w-4 mr-2" />
                      {isGeneratingOpis ? 'Se genereaza...' : 'Descarca OPIS'}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Deliverables List */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Lista Livrabile</CardTitle>
                  <CardDescription className="text-xs">
                    Toate documentele incarcate pentru {monthName} {year}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {allDeliverables.length === 0 ? (
                    <div className="text-center py-8 text-xs text-slate-400">
                      Niciun livrabil incarcat
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {allDeliverables.map((deliv, i) => {
                        const dt = new Date(deliv.activityDate || '');
                        const ds = isNaN(dt.getTime()) ? '' : dt.toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit' });
                        
                        return (
                          <div key={i} className="flex items-start gap-3 p-2 bg-slate-50 rounded-lg">
                            <div className="text-[10px] text-slate-400 font-mono w-8">{i + 1}.</div>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-medium text-slate-900 truncate">
                                {deliv.fileName}
                              </div>
                              <div className="text-[10px] text-slate-500">
                                {ds} · {deliv.activityType || 'Activitate'} · {deliv.activityTitle}
                              </div>
                            </div>
                            <Badge variant="outline" className="text-[9px] flex-shrink-0">
                              {deliv.fileType || 'DOC'}
                            </Badge>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Document Checklist */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Checklist Documente</CardTitle>
                  <CardDescription className="text-xs">Verificare completitudine dosar</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {[
                      { label: 'Pontaj semnat', ok: stats.totalHours > 0 },
                      { label: 'Raport activitate', ok: stats.totalActivities > 0 },
                      { label: 'Livrabile incarcate', ok: stats.totalDeliverables > 0 },
                      { label: 'OPIS generat', ok: false },
                      { label: 'Fara neconformitati deschise', ok: stats.openIssues === 0 },
                    ].map((item, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <div className={`w-4 h-4 rounded-full flex items-center justify-center ${
                          item.ok ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400'
                        }`}>
                          {item.ok ? '✓' : '○'}
                        </div>
                        <span className={item.ok ? 'text-slate-900' : 'text-slate-500'}>{item.label}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
