'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { BarChart3, Clock, Users, FileText, TrendingUp } from 'lucide-react';
import type { Activity, Expert } from '@/lib/types';

interface ProgressReportTabProps {
  experts: Expert[];
  activities: Activity[];
  month: number;
  year: number;
}

interface SAStats {
  sa: string;
  totalHours: number;
  totalActivities: number;
  expertsInvolved: Set<string>;
  deliverables: number;
}

export function ProgressReportTab({ experts, activities, month, year }: ProgressReportTabProps) {
  const MONTHS = ['Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie', 
                  'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie'];
  const monthName = MONTHS[month];

  // Aggregate by SA (Sub-Activity)
  const saStats = useMemo(() => {
    const stats: Record<string, SAStats> = {};
    
    activities.forEach(act => {
      const sa = act.activityType || 'Nespecificat';
      if (!stats[sa]) {
        stats[sa] = {
          sa,
          totalHours: 0,
          totalActivities: 0,
          expertsInvolved: new Set(),
          deliverables: 0,
        };
      }
      stats[sa].totalHours += act.hours || 0;
      stats[sa].totalActivities += 1;
      stats[sa].expertsInvolved.add(act.expertId);
      stats[sa].deliverables += (act.deliverables?.length || 0);
    });

    return Object.values(stats).sort((a, b) => b.totalHours - a.totalHours);
  }, [activities]);

  // Expert stats
  const expertStats = useMemo(() => {
    const stats: Record<string, { expert: Expert; hours: number; activities: number; deliverables: number }> = {};
    
    experts.forEach(exp => {
      stats[exp.id] = { expert: exp, hours: 0, activities: 0, deliverables: 0 };
    });

    activities.forEach(act => {
      if (stats[act.expertId]) {
        stats[act.expertId].hours += act.hours || 0;
        stats[act.expertId].activities += 1;
        stats[act.expertId].deliverables += (act.deliverables?.length || 0);
      }
    });

    return Object.values(stats).sort((a, b) => b.hours - a.hours);
  }, [experts, activities]);

  // Summary stats
  const totalHours = activities.reduce((sum, a) => sum + (a.hours || 0), 0);
  const totalActivities = activities.length;
  const totalDeliverables = activities.reduce((sum, a) => sum + (a.deliverables?.length || 0), 0);
  const activeExperts = new Set(activities.map(a => a.expertId)).size;
  const maxHours = Math.max(...saStats.map(s => s.totalHours), 1);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-slate-900">Raport Progres — {monthName} {year}</h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Agregare pe sub-activități și experți
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Clock className="h-4 w-4 text-blue-700" />
              </div>
              <div>
                <div className="text-xl font-bold text-slate-900">{totalHours}h</div>
                <div className="text-[10px] text-slate-500">Ore totale</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <BarChart3 className="h-4 w-4 text-green-700" />
              </div>
              <div>
                <div className="text-xl font-bold text-slate-900">{totalActivities}</div>
                <div className="text-[10px] text-slate-500">Activități</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <FileText className="h-4 w-4 text-purple-700" />
              </div>
              <div>
                <div className="text-xl font-bold text-slate-900">{totalDeliverables}</div>
                <div className="text-[10px] text-slate-500">Livrabile</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg">
                <Users className="h-4 w-4 text-amber-700" />
              </div>
              <div>
                <div className="text-xl font-bold text-slate-900">{activeExperts}</div>
                <div className="text-[10px] text-slate-500">Experți activi</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* SA Progress */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Progres per Sub-Activitate</CardTitle>
            <CardDescription className="text-xs">Distribuția orelor pe categorii de activități</CardDescription>
          </CardHeader>
          <CardContent>
            {saStats.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400">
                Nicio activitate înregistrată
              </div>
            ) : (
              <div className="space-y-3">
                {saStats.map((stat) => (
                  <div key={stat.sa}>
                    <div className="flex justify-between items-center mb-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">{stat.sa}</Badge>
                        <span className="text-[10px] text-slate-500">
                          {stat.expertsInvolved.size} experți
                        </span>
                      </div>
                      <span className="text-xs font-medium text-slate-900">{stat.totalHours}h</span>
                    </div>
                    <Progress value={(stat.totalHours / maxHours) * 100} className="h-2" />
                    <div className="flex justify-between mt-1 text-[10px] text-slate-500">
                      <span>{stat.totalActivities} activități</span>
                      <span>{stat.deliverables} livrabile</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Expert Progress */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Progres per Expert</CardTitle>
            <CardDescription className="text-xs">Activitatea fiecărui expert în {monthName}</CardDescription>
          </CardHeader>
          <CardContent>
            {expertStats.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400">
                Niciun expert înregistrat
              </div>
            ) : (
              <div className="space-y-2">
                {expertStats.map((stat) => {
                  const maxExpHours = Math.max(...expertStats.map(s => s.hours), 1);
                  return (
                    <div key={stat.expert.id} className="p-2 bg-slate-50 rounded-lg">
                      <div className="flex justify-between items-center mb-1">
                        <div>
                          <span className="text-xs font-medium text-slate-900">{stat.expert.name}</span>
                          <span className="text-[10px] text-slate-500 ml-2">{stat.expert.role}</span>
                        </div>
                        <span className="text-xs font-bold text-slate-900">{stat.hours}h</span>
                      </div>
                      <Progress value={(stat.hours / maxExpHours) * 100} className="h-1.5" />
                      <div className="flex gap-3 mt-1 text-[10px] text-slate-500">
                        <span>{stat.activities} activități</span>
                        <span>{stat.deliverables} livrabile</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Activity Timeline */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Timeline Activități</CardTitle>
          <CardDescription className="text-xs">Distribuția zilnică a activităților în {monthName}</CardDescription>
        </CardHeader>
        <CardContent>
          {activities.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-400">
              Nicio activitate înregistrată
            </div>
          ) : (
            <div className="flex gap-1 flex-wrap">
              {Array.from({ length: 31 }, (_, i) => {
                const day = i + 1;
                const dayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const dayActivities = activities.filter(a => a.date === dayStr);
                const dayHours = dayActivities.reduce((sum, a) => sum + (a.hours || 0), 0);
                
                const intensity = dayHours === 0 ? 0 : dayHours <= 4 ? 1 : dayHours <= 8 ? 2 : 3;
                const colors = ['bg-slate-100', 'bg-green-200', 'bg-green-400', 'bg-green-600'];
                
                return (
                  <div
                    key={day}
                    className={`w-6 h-6 rounded text-[9px] flex items-center justify-center ${colors[intensity]} ${dayHours > 0 ? 'text-white font-medium' : 'text-slate-400'}`}
                    title={`${day} ${monthName}: ${dayHours}h, ${dayActivities.length} activități`}
                  >
                    {day}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
