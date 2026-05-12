'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Users, Building2, Calendar, TrendingUp } from 'lucide-react';
import { GT_ORGANIZATIONS } from '@/lib/deliverable-types';
import type { Activity, Expert, GrupTintaEntry } from '@/lib/types';

interface GTProgressTabProps {
  experts: Expert[];
  activities: Activity[];
  grupTintaEntries: GrupTintaEntry[];
  month: number;
  year: number;
}

export function GTProgressTab({ experts, activities, grupTintaEntries, month, year }: GTProgressTabProps) {
  const MONTHS = ['Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie', 
                  'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie'];
  const monthName = MONTHS[month];

  // Aggregate GT data
  const gtStats = useMemo(() => {
    const orgStats: Record<string, { org: typeof GT_ORGANIZATIONS[number]; activities: number; participants: number; experts: Set<string> }> = {};
    
    GT_ORGANIZATIONS.forEach(org => {
      orgStats[org.id] = { org, activities: 0, participants: 0, experts: new Set() };
    });

    let totalActivities = 0;
    let totalParticipants = 0;

    grupTintaEntries.forEach(entry => {
      totalActivities++;
      totalParticipants += entry.participants || 0;
      
      entry.organizations.forEach(orgId => {
        if (orgStats[orgId]) {
          orgStats[orgId].activities++;
          orgStats[orgId].participants += entry.participants || 0;
          orgStats[orgId].experts.add(entry.expertId);
        }
      });
    });

    // Also check activities with grupTinta
    activities.forEach(act => {
      if (act.grupTinta && act.grupTinta.length > 0) {
        act.grupTinta.forEach(gt => {
          totalActivities++;
          totalParticipants += gt.participants || 0;
          
          gt.organizations?.forEach(orgId => {
            if (orgStats[orgId]) {
              orgStats[orgId].activities++;
              orgStats[orgId].participants += gt.participants || 0;
              orgStats[orgId].experts.add(act.expertId);
            }
          });
        });
      }
    });

    return {
      byOrg: Object.values(orgStats).filter(s => s.activities > 0).sort((a, b) => b.participants - a.participants),
      totalActivities,
      totalParticipants,
      activeOrgs: Object.values(orgStats).filter(s => s.activities > 0).length,
      expertsWithGT: new Set([
        ...grupTintaEntries.map(e => e.expertId),
        ...activities.filter(a => a.grupTinta && a.grupTinta.length > 0).map(a => a.expertId)
      ]).size,
    };
  }, [grupTintaEntries, activities]);

  const maxParticipants = Math.max(...gtStats.byOrg.map(s => s.participants), 1);

  // Build timeline
  const gtTimeline = useMemo(() => {
    const entries: { date: string; expert: string; type: string; orgs: string[]; participants: number }[] = [];

    grupTintaEntries.forEach(entry => {
      const expert = experts.find(e => e.id === entry.expertId);
      entries.push({
        date: entry.date,
        expert: expert?.name || 'Unknown',
        type: entry.type || 'Activitate GT',
        orgs: entry.organizations,
        participants: entry.participants,
      });
    });

    return entries.sort((a, b) => a.date.localeCompare(b.date));
  }, [grupTintaEntries, experts]);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-slate-900">Progres Grup Țintă — {monthName} {year}</h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Monitorizarea implicării organizațiilor membre GT
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Calendar className="h-4 w-4 text-blue-700" />
              </div>
              <div>
                <div className="text-xl font-bold text-slate-900">{gtStats.totalActivities}</div>
                <div className="text-[10px] text-slate-500">Activități cu GT</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Users className="h-4 w-4 text-purple-700" />
              </div>
              <div>
                <div className="text-xl font-bold text-slate-900">{gtStats.totalParticipants}</div>
                <div className="text-[10px] text-slate-500">Participanți GT</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <Building2 className="h-4 w-4 text-green-700" />
              </div>
              <div>
                <div className="text-xl font-bold text-slate-900">{gtStats.activeOrgs}</div>
                <div className="text-[10px] text-slate-500">Organizații implicate</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg">
                <TrendingUp className="h-4 w-4 text-amber-700" />
              </div>
              <div>
                <div className="text-xl font-bold text-slate-900">{gtStats.expertsWithGT}</div>
                <div className="text-[10px] text-slate-500">Experți cu GT</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {gtStats.totalActivities === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="h-8 w-8 text-slate-300 mx-auto mb-3" />
            <div className="text-sm text-slate-500">
              Nicio activitate cu Grup Țintă înregistrată în {monthName} {year}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              Experții pot marca implicarea GT direct în formularul de activitate
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {/* Per Organization */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Implicare per Organizație GT</CardTitle>
              <CardDescription className="text-xs">Distribuția participanților pe organizații</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {GT_ORGANIZATIONS.map((org) => {
                  const stat = gtStats.byOrg.find(s => s.org.id === org.id);
                  const isActive = stat && stat.activities > 0;
                  
                  return (
                    <div key={org.id} className={!isActive ? 'opacity-40' : ''}>
                      <div className="flex justify-between items-center mb-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px] font-bold">
                            {org.name}
                          </Badge>
                          <span className="text-[10px] text-slate-500 truncate max-w-[150px]">
                            {org.full.split(' ').slice(0, 3).join(' ')}
                          </span>
                        </div>
                        {isActive ? (
                          <span className="text-xs font-medium text-slate-900">
                            {stat.participants} part.
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400">—</span>
                        )}
                      </div>
                      {isActive && (
                        <>
                          <Progress value={(stat.participants / maxParticipants) * 100} className="h-1.5" />
                          <div className="flex gap-3 mt-1 text-[10px] text-slate-500">
                            <span>{stat.activities} activ.</span>
                            <span>{stat.experts.size} experți</span>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Timeline */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Jurnal Activități cu GT</CardTitle>
              <CardDescription className="text-xs">Cronologia interacțiunilor cu Grupul Țintă</CardDescription>
            </CardHeader>
            <CardContent>
              {gtTimeline.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400">
                  Nicio interacțiune înregistrată
                </div>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {gtTimeline.map((entry, i) => {
                    const dt = new Date(entry.date);
                    const ds = isNaN(dt.getTime()) ? '' : dt.toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit' });
                    
                    return (
                      <div key={i} className="flex gap-3 items-start p-2 bg-slate-50 rounded-lg">
                        <div className="text-[10px] font-semibold text-slate-500 min-w-[36px] flex-shrink-0">
                          {ds}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-slate-900 truncate">{entry.type}</div>
                          <div className="text-[10px] text-slate-500">{entry.expert}</div>
                        </div>
                        <div className="flex gap-1 flex-wrap justify-end flex-shrink-0">
                          {entry.orgs.map(id => (
                            <Badge key={id} className="text-[9px] px-1.5 py-0 bg-blue-100 text-blue-800">
                              {id.toUpperCase()}
                            </Badge>
                          ))}
                          {entry.participants > 0 && (
                            <Badge className="text-[9px] px-1.5 py-0 bg-purple-100 text-purple-800">
                              {entry.participants}p
                            </Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
