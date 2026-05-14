'use client';

import { useState } from 'react';
import { Upload, Check, AlertTriangle, Loader2, Sparkles } from 'lucide-react';
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
import type { RaportRow, PontajRow } from '@/lib/types';

interface RaportActivitateTabProps {
  data: RaportRow[];
  pontajData: PontajRow[];
  onDataChange: (data: RaportRow[]) => void;
}

export function RaportActivitateTab({ data, pontajData, onDataChange }: RaportActivitateTabProps) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isComparing, setIsComparing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processDocument = async () => {
    if (files.length === 0) return;

    setIsProcessing(true);
    setError(null);

    try {
      // Send to AI for processing
      const response = await fetch('/api/ai/extract-raport', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileData: files[0].data,
          fileName: files[0].name,
          fileType: files[0].type,
        }),
      });

      const result = await response.json();
      if (result.error) {
        setError(result.error);
      } else if (result.rows) {
        onDataChange(result.rows);
      }
    } catch (err) {
      setError('Eroare la procesarea documentului');
    } finally {
      setIsProcessing(false);
    }
  };

  const compareWithPontaj = async () => {
    if (data.length === 0 || pontajData.length === 0) return;

    setIsComparing(true);
    setError(null);

    try {
      const response = await fetch('/api/ai/compare-documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          raportData: data,
          pontajData,
        }),
      });

      const result = await response.json();
      if (result.error) {
        setError(result.error);
      } else if (result.comparedData) {
        onDataChange(result.comparedData);
      }
    } catch (err) {
      setError('Eroare la compararea documentelor');
    } finally {
      setIsComparing(false);
    }
  };

  const toggleVerified = (id: string) => {
    const updated = data.map((row) =>
      row.id === id ? { ...row, verified: !row.verified } : row
    );
    onDataChange(updated);
  };

  const matchingCount = data.filter((row) => row.matchesPontaj).length;
  const verifiedCount = data.filter((row) => row.verified).length;
  const issuesCount = data.filter((row) => (row.issues ?? []).length > 0).length;

  return (
    <div className="space-y-6">
      {/* File Upload */}
      <Card>
        <CardHeader>
          <CardTitle>Încărcare Raport Activitate</CardTitle>
          <CardDescription>
            Încărcați raportul de activitate (Word/PDF) pentru verificare și comparare cu pontajul
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FileUpload
            accept=".pdf,.doc,.docx"
            multiple={false}
            files={files}
            onFilesChange={setFiles}
            label="Încarcă raport activitate"
            description="Format acceptat: .pdf, .doc, .docx"
          />

          <div className="flex gap-2">
            {files.length > 0 && (
              <Button onClick={processDocument} disabled={isProcessing}>
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Se procesează...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Extrage date
                  </>
                )}
              </Button>
            )}

            {data.length > 0 && pontajData.length > 0 && (
              <Button variant="outline" onClick={compareWithPontaj} disabled={isComparing}>
                {isComparing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Se compară...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Compară cu Pontaj (AI)
                  </>
                )}
              </Button>
            )}
          </div>

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
                <CardTitle>Raport Activitate ({data.length} activități)</CardTitle>
                <CardDescription>
                  Potriviri pontaj: {matchingCount}/{data.length} | Verificate: {verifiedCount}/{data.length}
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
                    <TableHead className="w-28">Data</TableHead>
                    <TableHead>Titlu Activitate</TableHead>
                    <TableHead className="w-32">Livrabile</TableHead>
                    <TableHead className="w-24">Pontaj</TableHead>
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
                        <Checkbox
                          checked={row.verified}
                          onCheckedChange={() => toggleVerified(row.id)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        {row.date ? formatDateRo(row.date) : '-'}
                      </TableCell>
                      <TableCell className="max-w-[250px]">
                        <p className="truncate font-medium">{row.activityTitle}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {row.description}
                        </p>
                      </TableCell>
                      <TableCell>
                        {(row.deliverables ?? []).length > 0 ? (
                          <Badge variant="outline">{(row.deliverables ?? []).length} fișiere</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {row.matchesPontaj ? (
                          <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
                            <Check className="h-3 w-3 mr-1" />
                            Match
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Necomparat</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {row.verified ? (
                          <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
                            <Check className="h-3 w-3 mr-1" />
                            OK
                          </Badge>
                        ) : (row.issues ?? []).length > 0 ? (
                          <Badge variant="destructive">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Probleme
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

            {/* Issues Summary */}
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
                          • {formatDateRo(row.date)}: {issue}
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
