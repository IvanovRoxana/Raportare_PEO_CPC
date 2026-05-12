'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, Check, Users, FileText, Loader2, Sparkles } from 'lucide-react';
import type { Activity, Expert, CrossExpertRow } from '@/lib/types';

interface CrossExpertCheckProps {
  experts: Expert[];
  activities: Activity[];
  month: number;
  year: number;
  apiKey: string | null;
  onSaveIssues?: (issues: CrossExpertRow[]) => void;
}

// Simple similarity check between two strings
function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  
  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;
  
  const words1 = s1.split(/\s+/).filter(w => w.length > 3);
  const words2 = s2.split(/\s+/).filter(w => w.length > 3);
  
  if (words1.length === 0 || words2.length === 0) return 0;
  
  const commonWords = words1.filter(w => words2.includes(w));
  return commonWords.length / Math.max(words1.length, words2.length);
}

export function CrossExpertCheck({ experts, activities, month, year, apiKey, onSaveIssues }: CrossExpertCheckProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);

  const MONTHS = ['Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie', 
                  'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie'];
  const monthName = MONTHS[month];

  // Find potential overlaps
  const potentialIssues = useMemo(() => {
    const issues: CrossExpertRow[] = [];
    
    // Group activities by date
    const byDate: Record<string, Activity[]> = {};
    activities.forEach(act => {
      if (!byDate[act.date]) byDate[act.date] = [];
      byDate[act.date].push(act);
    });

    // Check for similar activities on the same date
    Object.entries(byDate).forEach(([date, dayActivities]) => {
      if (dayActivities.length < 2) return;
      
      for (let i = 0; i < dayActivities.length; i++) {
        for (let j = i + 1; j < dayActivities.length; j++) {
          const act1 = dayActivities[i];
          const act2 = dayActivities[j];
          
          // Skip if same expert
          if (act1.expertId === act2.expertId) continue;
          
          // Check activity type match
          const sameType = act1.activityType === act2.activityType;
          
          // Check title similarity
          const titleSimilarity = calculateSimilarity(act1.title || '', act2.title || '');
          
          // Check description similarity if available
          const descSimilarity = calculateSimilarity(act1.description || '', act2.description || '');
          
          const overallSimilarity = Math.max(
            sameType ? 0.3 : 0,
            titleSimilarity,
            descSimilarity * 0.8
          );
          
          if (overallSimilarity > 0.4) {
            const expert1 = experts.find(e => e.id === act1.expertId);
            const expert2 = experts.find(e => e.id === act2.expertId);
            
            issues.push({
              id: `cross_${date}_${act1.id}_${act2.id}`,
              date,
              expert1Id: act1.expertId,
              expert1Name: expert1?.name || 'Unknown',
              expert2Id: act2.expertId,
              expert2Name: expert2?.name || 'Unknown',
              activity1: act1.title || act1.activityType || 'Activitate',
              activity2: act2.title || act2.activityType || 'Activitate',
              similarity: Math.round(overallSimilarity * 100),
              isPotentialIssue: overallSimilarity > 0.6,
            });
          }
        }
      }
    });

    return issues.sort((a, b) => b.similarity - a.similarity);
  }, [activities, experts]);

  // Check for common deliverables
  const commonDeliverables = useMemo(() => {
    const delivTitles: Record<string, { expertId: string; expertName: string; activityTitle: string; date: string }[]> = {};
    
    activities.forEach(act => {
      const expert = experts.find(e => e.id === act.expertId);
      act.deliverables?.forEach(deliv => {
        const normalizedTitle = deliv.fileName.toLowerCase().trim();
        if (!delivTitles[normalizedTitle]) delivTitles[normalizedTitle] = [];
        delivTitles[normalizedTitle].push({
          expertId: act.expertId,
          expertName: expert?.name || 'Unknown',
          activityTitle: act.title || '',
          date: act.date,
        });
      });
    });

    return Object.entries(delivTitles)
      .filter(([, entries]) => {
        const uniqueExperts = new Set(entries.map(e => e.expertId));
        return uniqueExperts.size > 1;
      })
      .map(([title, entries]) => ({
        title,
        experts: entries,
      }));
  }, [activities, experts]);

  const runAIAnalysis = async () => {
    if (!apiKey) return;
    
    setIsAnalyzing(true);
    try {
      const response = await fetch('/api/ai/cross-expert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          month: monthName,
          year,
          activities: activities.map(a => ({
            expertName: experts.find(e => e.id === a.expertId)?.name,
            date: a.date,
            activityType: a.activityType,
            title: a.title,
            description: a.description,
            hours: a.hours,
          })),
        }),
      });

      if (!response.ok) throw new Error('AI analysis failed');
      const { analysis } = await response.json();
      setAiAnalysis(analysis);
    } catch (error) {
      console.error('Error in AI analysis:', error);
      setAiAnalysis('Eroare la analiza AI: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const highSeverity = potentialIssues.filter(i => i.similarity >= 70).length;
  const mediumSeverity = potentialIssues.filter(i => i.similarity >= 50 && i.similarity < 70).length;
  const lowSeverity = potentialIssues.filter(i => i.similarity < 50).length;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-sm font-medium text-slate-900">Verificare Cross-Expert — {monthName} {year}</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Identificarea suprapunerilor și activităților similare între experți
          </p>
        </div>
        {apiKey && (
          <Button onClick={runAIAnalysis} disabled={isAnalyzing} size="sm" className="text-xs">
            {isAnalyzing ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3 mr-1" />
            )}
            {isAnalyzing ? 'Analizez...' : 'Analiză AI'}
          </Button>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-3">
        <Card className={highSeverity > 0 ? 'border-red-200 bg-red-50' : ''}>
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className={`h-4 w-4 ${highSeverity > 0 ? 'text-red-600' : 'text-slate-400'}`} />
              <div>
                <div className="text-lg font-bold text-slate-900">{highSeverity}</div>
                <div className="text-[10px] text-slate-500">Severitate mare</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={mediumSeverity > 0 ? 'border-amber-200 bg-amber-50' : ''}>
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className={`h-4 w-4 ${mediumSeverity > 0 ? 'text-amber-600' : 'text-slate-400'}`} />
              <div>
                <div className="text-lg font-bold text-slate-900">{mediumSeverity}</div>
                <div className="text-[10px] text-slate-500">Severitate medie</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-slate-400" />
              <div>
                <div className="text-lg font-bold text-slate-900">{lowSeverity}</div>
                <div className="text-[10px] text-slate-500">Severitate scăzută</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-slate-400" />
              <div>
                <div className="text-lg font-bold text-slate-900">{commonDeliverables.length}</div>
                <div className="text-[10px] text-slate-500">Livrabile comune</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* AI Analysis */}
      {aiAnalysis && (
        <Card className="border-indigo-200 bg-indigo-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-indigo-600" />
              Analiză AI
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xs text-slate-700 whitespace-pre-wrap">{aiAnalysis}</div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4">
        {/* Potential Issues */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Suprapuneri Potențiale</CardTitle>
            <CardDescription className="text-xs">Activități similare între experți diferiți</CardDescription>
          </CardHeader>
          <CardContent>
            {potentialIssues.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400">
                <Check className="h-6 w-6 mx-auto mb-2 text-green-500" />
                Nicio suprapunere identificată
              </div>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {potentialIssues.map((issue) => (
                  <div
                    key={issue.id}
                    className={`p-2 rounded-lg border ${
                      issue.similarity >= 70 ? 'border-red-200 bg-red-50' :
                      issue.similarity >= 50 ? 'border-amber-200 bg-amber-50' :
                      'border-slate-200 bg-slate-50'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <Badge variant="outline" className="text-[10px]">
                        {new Date(issue.date).toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit' })}
                      </Badge>
                      <div className="flex items-center gap-1">
                        <Progress value={issue.similarity} className="w-12 h-1.5" />
                        <span className={`text-[10px] font-medium ${
                          issue.similarity >= 70 ? 'text-red-700' :
                          issue.similarity >= 50 ? 'text-amber-700' :
                          'text-slate-600'
                        }`}>
                          {issue.similarity}%
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                      <div>
                        <div className="font-medium text-slate-900">{issue.expert1Name}</div>
                        <div className="text-slate-500 truncate">{issue.activity1}</div>
                      </div>
                      <div>
                        <div className="font-medium text-slate-900">{issue.expert2Name}</div>
                        <div className="text-slate-500 truncate">{issue.activity2}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Common Deliverables */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Livrabile Comune</CardTitle>
            <CardDescription className="text-xs">Documente cu titluri identice la mai mulți experți</CardDescription>
          </CardHeader>
          <CardContent>
            {commonDeliverables.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400">
                <Check className="h-6 w-6 mx-auto mb-2 text-green-500" />
                Niciun livrabil comun identificat
              </div>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {commonDeliverables.map((item, i) => (
                  <div key={i} className="p-2 rounded-lg border border-blue-200 bg-blue-50">
                    <div className="text-xs font-medium text-slate-900 mb-1 truncate">
                      {item.title}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {item.experts.map((exp, j) => (
                        <Badge key={j} variant="secondary" className="text-[9px]">
                          {exp.expertName}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
