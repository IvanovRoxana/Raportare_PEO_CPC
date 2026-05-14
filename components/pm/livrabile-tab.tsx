'use client';

import { useState } from 'react';
import { Check, AlertTriangle, FileText, Eye, Loader2, Sparkles } from 'lucide-react';
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
import { Checkbox } from '@/components/ui/checkbox';
import { FileUpload, type UploadedFile } from './file-upload';
import { formatDateRo } from '@/lib/app-utils';
import type { LivrabilRow, RaportRow } from '@/lib/types';

interface LivrabileTabProps {
  data: LivrabilRow[];
  raportData: RaportRow[];
  onDataChange: (data: LivrabilRow[]) => void;
}

export function LivrabileTab({ data, raportData, onDataChange }: LivrabileTabProps) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFilesChange = (newFiles: UploadedFile[]) => {
    setFiles(newFiles);

    // Create LivrabilRow entries for each file
    const rows: LivrabilRow[] = newFiles.map((file, index) => ({
      id: `livrabil-${index}-${file.id}`,
      fileName: file.name,
      activityDate: '',
      activityTitle: '',
      fileExists: true,
      titleMatch: false,
      issues: [],
    }));

    onDataChange(rows);
  };

  const verifyTitles = async () => {
    if (data.length === 0 || raportData.length === 0) return;

    setIsVerifying(true);
    setError(null);

    try {
      const response = await fetch('/api/ai/verify-livrabile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          livrabile: data,
          raportData,
          files: files.map((f) => ({ name: f.name, type: f.type })),
        }),
      });

      const result = await response.json();
      if (result.error) {
        setError(result.error);
      } else if (result.verifiedData) {
        onDataChange(result.verifiedData);
      }
    } catch (err) {
      setError('Eroare la verificarea livrabilelor');
    } finally {
      setIsVerifying(false);
    }
  };

  const matchingCount = data.filter((row) => row.titleMatch).length;
  const issuesCount = data.filter((row) => (row.issues ?? []).length > 0).length;

  return (
    <div className="space-y-6">
      {/* File Upload */}
      <Card>
        <CardHeader>
          <CardTitle>Încărcare Livrabile</CardTitle>
          <CardDescription>
            Încărcați toate fișierele livrabile pentru verificarea numelui conform raportului de activitate
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FileUpload
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png"
            multiple={true}
            files={files}
            onFilesChange={handleFilesChange}
            label="Încarcă livrabile"
            description="Glisați toate fișierele livrabile aici"
          />

          {files.length > 0 && raportData.length > 0 && (
            <Button onClick={verifyTitles} disabled={isVerifying}>
              {isVerifying ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Se verifică...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Verifică nume cu AI
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

      {/* Data Table */}
      {data.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Livrabile ({data.length} fișiere)</CardTitle>
                <CardDescription>
                  Titluri corecte: {matchingCount}/{data.length} | Probleme: {issuesCount}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox />
                    </TableHead>
                    <TableHead>Nume Fișier</TableHead>
                    <TableHead className="w-28">Data Activitate</TableHead>
                    <TableHead>Titlu Activitate</TableHead>
                    <TableHead className="w-24">Titlu OK</TableHead>
                    <TableHead className="w-24">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((row) => (
                    <TableRow
                      key={row.id}
                      className={(row.issues ?? []).length > 0 ? 'bg-destructive/5' : ''}
                    >
                      <TableCell>
                        <Checkbox checked={row.titleMatch} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium truncate max-w-[200px]">
                            {row.fileName}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {row.activityDate ? formatDateRo(row.activityDate) : '-'}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {row.activityTitle || '-'}
                      </TableCell>
                      <TableCell>
                        {row.titleMatch ? (
                          <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
                            <Check className="h-3 w-3 mr-1" />
                            OK
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Neverificat</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {(row.issues ?? []).length > 0 ? (
                          <Badge variant="destructive">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Probleme
                          </Badge>
                        ) : row.titleMatch ? (
                          <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
                            OK
                          </Badge>
                        ) : (
                          <Badge variant="secondary">În așteptare</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Issues */}
            {issuesCount > 0 && (
              <div className="mt-4 p-3 bg-destructive/10 rounded-md">
                <h4 className="font-medium text-destructive mb-2">
                  Probleme detectate ({issuesCount})
                </h4>
                <ul className="text-sm text-destructive space-y-1">
                  {data
                    .filter((row) => (row.issues ?? []).length > 0)
                    .map((row) =>
                      (row.issues ?? []).map((issue, i) => (
                        <li key={`${row.id}-${i}`}>
                          • {row.fileName}: {issue}
                        </li>
                      ))
                    )}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
