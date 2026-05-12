'use client';

import { useState } from 'react';
import { AlertTriangle, Loader2, Sparkles, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { FileUpload, type UploadedFile } from './file-upload';
import { formatDateRo } from '@/lib/app-utils';
import type { CrossExpertRow } from '@/lib/types';

interface CrossExpertTabProps {
  data: CrossExpertRow[];
  onDataChange: (data: CrossExpertRow[]) => void;
}

export function CrossExpertTab({ data, onDataChange }: CrossExpertTabProps) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyzeDocuments = async () => {
    if (files.length < 2) {
      setError('Încărcați cel puțin 2 rapoarte de activitate pentru comparare');
      return;
    }

    setIsAnalyzing(true);
    setError(null);

    try {
      const response = await fetch('/api/ai/cross-expert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: files.map((f) => ({
            name: f.name,
            type: f.type,
            data: f.data,
          })),
        }),
      });

      const result = await response.json();
      if (result.error) {
        setError(result.error);
      } else if (result.comparisons) {
        onDataChange(result.comparisons);
      }
    } catch (err) {
      setError('Eroare la analiza documentelor');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const potentialIssues = data.filter((row) => row.isPotentialIssue);

  return (
    <div className="space-y-6">
      {/* File Upload */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Comparare Cross-Expert
          </CardTitle>
          <CardDescription>
            Încărcați rapoartele de activitate ale mai multor experți pentru a detecta suprapuneri
            suspecte
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FileUpload
            accept=".pdf,.doc,.docx"
            multiple={true}
            files={files}
            onFilesChange={setFiles}
            label="Încarcă rapoarte experți"
            description="Încărcați rapoartele de activitate pentru comparare"
          />

          {files.length >= 2 && (
            <Button onClick={analyzeDocuments} disabled={isAnalyzing}>
              {isAnalyzing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Se analizează...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Analizează cu AI
                </>
              )}
            </Button>
          )}

          {error && (
            <div className="p-3 bg-destructive/10 text-destructive rounded-md text-sm">
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      {data.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Rezultate Comparare ({data.length} potriviri)</CardTitle>
                <CardDescription>
                  Suprapuneri suspecte: {potentialIssues.length}
                </CardDescription>
              </div>
              {potentialIssues.length > 0 && (
                <Badge variant="destructive" className="text-sm">
                  <AlertTriangle className="h-4 w-4 mr-1" />
                  {potentialIssues.length} probleme potențiale
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-28">Data</TableHead>
                    <TableHead>Expert 1</TableHead>
                    <TableHead>Expert 2</TableHead>
                    <TableHead className="w-32">Similaritate</TableHead>
                    <TableHead className="w-24">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((row) => (
                    <TableRow
                      key={row.id}
                      className={row.isPotentialIssue ? 'bg-destructive/5' : ''}
                    >
                      <TableCell className="font-medium">
                        {row.date ? formatDateRo(row.date) : '-'}
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{row.expert1}</p>
                          <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                            {row.activity1}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{row.expert2}</p>
                          <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                            {row.activity2}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <Progress
                            value={row.similarity}
                            className={
                              row.similarity > 70
                                ? '[&>div]:bg-destructive'
                                : row.similarity > 40
                                  ? '[&>div]:bg-yellow-500'
                                  : '[&>div]:bg-green-500'
                            }
                          />
                          <p className="text-xs text-center">{row.similarity}%</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {row.isPotentialIssue ? (
                          <Badge variant="destructive">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Atenție
                          </Badge>
                        ) : (
                          <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
                            OK
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Legend */}
            <div className="mt-4 flex items-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span>Similaritate mică (&lt;40%)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <span>Similaritate medie (40-70%)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <span>Similaritate mare (&gt;70%)</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
