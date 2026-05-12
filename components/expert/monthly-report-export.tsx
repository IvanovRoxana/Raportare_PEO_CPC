'use client';

import { useState } from 'react';
import { FileText, Download, Loader2, FileSpreadsheet, FileType } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import type { Activity, Expert } from '@/lib/types';
import { getMonthName } from '@/lib/app-utils';
import { getWorkingHoursInfo } from '@/lib/working-hours';

interface MonthlyReportExportProps {
  expert: Expert;
  activities: Activity[];
  month: number;
  year: number;
}

export function MonthlyReportExport({ expert, activities, month, year }: MonthlyReportExportProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [includeOPIS, setIncludeOPIS] = useState(true);
  const [includeTimesheet, setIncludeTimesheet] = useState(true);
  const [includeRA, setIncludeRA] = useState(true);
  const [format, setFormat] = useState<'docx' | 'pdf' | 'xlsx'>('docx');

  const workingInfo = getWorkingHoursInfo(month, year, expert.norma || 8, activities);
  const totalHours = workingInfo.totalHours;

  const handleExport = async () => {
    setIsGenerating(true);
    try {
      // Generate the selected documents
      const docs = [];
      
      if (includeTimesheet) {
        docs.push(generateTimesheet(expert, activities, month, year, workingInfo));
      }
      
      if (includeOPIS) {
        docs.push(generateOPIS(expert, activities, month, year));
      }
      
      if (includeRA) {
        // Call AI to generate report
        const response = await fetch('/api/ai/generate-report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            activities,
            month: getMonthName(month),
            year,
            expertName: expert.name,
          }),
        });
        
        if (response.ok) {
          const data = await response.json();
          docs.push({
            name: `Raport_Activitate_${expert.name}_${getMonthName(month)}_${year}.md`,
            content: data.report,
          });
        }
      }

      // For now, download as text files
      // In production, use docx/pdf libraries
      docs.forEach(doc => {
        const blob = new Blob([doc.content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = doc.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });

      setIsOpen(false);
    } catch (error) {
      console.error('Error exporting report:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Download className="h-4 w-4" />
          Export Raport Lunar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Export Raport Lunar - {getMonthName(month)} {year}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Summary */}
          <div className="bg-muted/50 p-3 rounded-lg text-sm">
            <p><strong>Expert:</strong> {expert.name}</p>
            <p><strong>Total ore:</strong> {totalHours}h / {workingInfo.maxHoursWithNorma}h</p>
            <p><strong>Activități:</strong> {activities.length}</p>
          </div>

          {/* Document selection */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Documente de generat:</Label>
            
            <div className="flex items-center space-x-2">
              <Checkbox
                id="timesheet"
                checked={includeTimesheet}
                onCheckedChange={(checked) => setIncludeTimesheet(checked as boolean)}
              />
              <label htmlFor="timesheet" className="text-sm flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-green-600" />
                Pontaj (Timesheet)
              </label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="opis"
                checked={includeOPIS}
                onCheckedChange={(checked) => setIncludeOPIS(checked as boolean)}
              />
              <label htmlFor="opis" className="text-sm flex items-center gap-2">
                <FileType className="h-4 w-4 text-blue-600" />
                OPIS Livrabile
              </label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="ra"
                checked={includeRA}
                onCheckedChange={(checked) => setIncludeRA(checked as boolean)}
              />
              <label htmlFor="ra" className="text-sm flex items-center gap-2">
                <FileText className="h-4 w-4 text-purple-600" />
                Raport de Activitate (generat AI)
              </label>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Anulează
            </Button>
            <Button onClick={handleExport} disabled={isGenerating || (!includeOPIS && !includeTimesheet && !includeRA)}>
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Se generează...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Descarcă
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function generateTimesheet(
  expert: Expert,
  activities: Activity[],
  month: number,
  year: number,
  workingInfo: { workingDays: number; maxHoursWithNorma: number }
) {
  const monthName = getMonthName(month);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  
  // Group activities by date
  const byDate = new Map<string, Activity[]>();
  activities.forEach(a => {
    const existing = byDate.get(a.date) || [];
    existing.push(a);
    byDate.set(a.date, existing);
  });

  let content = `PONTAJ LUNAR / TIMESHEET
========================
Proiect: PEO - Parteneriat pentru Educație și Oportunități
Cod proiect: 302141

Expert: ${expert.name}
Funcție: ${expert.role}
Luna: ${monthName} ${year}
Normă: ${expert.norma || 8} ore/zi

---
Data\t\tOre\tActivitate
---
`;

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayActivities = byDate.get(dateStr) || [];
    const totalHoursDay = dayActivities.reduce((sum, a) => sum + (a.hours || 0), 0);
    
    const dayOfWeek = new Date(year, month, day).getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    
    if (totalHoursDay > 0) {
      dayActivities.forEach((a, i) => {
        content += `${i === 0 ? dateStr : '\t\t'}\t${a.hours}\t${a.title}\n`;
      });
    } else if (!isWeekend) {
      content += `${dateStr}\t0\t-\n`;
    }
  }

  const totalHours = activities.reduce((sum, a) => sum + (a.hours || 0), 0);
  content += `
---
TOTAL ORE: ${totalHours} / ${workingInfo.maxHoursWithNorma}

Semnătură expert: _____________________
Data: _____________________

Aprobat Manager Proiect: _____________________
Data: _____________________
`;

  return {
    name: `Pontaj_${expert.name.replace(/\s+/g, '_')}_${monthName}_${year}.txt`,
    content,
  };
}

function generateOPIS(
  expert: Expert,
  activities: Activity[],
  month: number,
  year: number
) {
  const monthName = getMonthName(month);
  
  let content = `OPIS LIVRABILE
==============
Proiect: PEO - Parteneriat pentru Educație și Oportunități
Cod proiect: 302141

Expert: ${expert.name}
Funcție: ${expert.role}
Luna: ${monthName} ${year}

---
Nr.\tData\t\tDenumire Document\t\tObservații
---
`;

  let nr = 1;
  activities.forEach(a => {
    if (a.deliverables && a.deliverables.length > 0) {
      a.deliverables.forEach(d => {
        content += `${nr}\t${a.date}\t${d.name || d.type || 'Document'}\t${d.stadiu || '-'}\n`;
        nr++;
      });
    }
  });

  content += `
---
Total documente: ${nr - 1}

Întocmit de: ${expert.name}
Data: ${new Date().toLocaleDateString('ro-RO')}

Semnătură: _____________________
`;

  return {
    name: `OPIS_${expert.name.replace(/\s+/g, '_')}_${monthName}_${year}.txt`,
    content,
  };
}
