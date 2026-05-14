'use client';

import { useState } from 'react';
import { Upload, Check, AlertTriangle, Loader2 } from 'lucide-react';
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
import type { PontajRow } from '@/lib/types';

interface PontajTabProps {
  data: PontajRow[];
  onDataChange: (data: PontajRow[]) => void;
}

export function PontajTab({ data, onDataChange }: PontajTabProps) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processExcelFile = async () => {
    if (files.length === 0) return;

    setIsProcessing(true);
    setError(null);

    try {
      // Dynamic import xlsx
      const XLSX = await import('xlsx');

      const file = files[0];
      // Convert base64 to array buffer
      const base64Data = file.data.split(',')[1];
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const workbook = XLSX.read(bytes, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as unknown[][];

      // Parse the Excel data into PontajRow format
      const rows: PontajRow[] = [];
      // Skip header row, start from row 1
      for (let i = 1; i < jsonData.length; i++) {
        const row = jsonData[i];
        if (!row || row.length < 3) continue;

        // Try to parse date from various formats
        let dateStr = '';
        const dateValue = row[0];
        if (typeof dateValue === 'number') {
          // Excel date serial number
          const date = new Date((dateValue - 25569) * 86400 * 1000);
          dateStr = date.toISOString().split('T')[0];
        } else if (typeof dateValue === 'string') {
          dateStr = dateValue;
        }

        const hoursValue = row[1];
        const hours = typeof hoursValue === 'number' ? hoursValue : parseFloat(String(hoursValue)) || 0;

        rows.push({
          id: `pontaj-${i}`,
          date: dateStr,
          hours,
          activityCode: String(row[2] || ''),
          description: String(row[3] || ''),
          verified: false,
          issues: [],
        });
      }

      onDataChange(rows);
    } catch (err) {
      console.error('Error processing Excel:', err);
      setError('Eroare la procesarea fisierului Excel. Verificati formatul.');
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleVerified = (id: string) => {
    const updated = data.map((row) =>
      row.id === id ? { ...row, verified: !row.verified } : row
    );
    onDataChange(updated);
  };

  const verifyAll = () => {
    const updated = data.map((row) => ({ ...row, verified: true }));
    onDataChange(updated);
  };

  const totalHours = data.reduce((sum, row) => sum + row.hours, 0);
  const verifiedCount = data.filter((row) => row.verified).length;
  const issuesCount = data.filter((row) => (row.issues ?? []).length > 0).length;

  return (
    <div className="space-y-6">
      {/* File Upload */}
      <Card>
        <CardHeader>
          <CardTitle>Incarcare Pontaj Excel</CardTitle>
          <CardDescription>
            Incarcati fisierul Excel cu pontajul pentru verificare
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FileUpload
            accept=".xls,.xlsx"
            multiple={false}
            files={files}
            onFilesChange={setFiles}
            label="Incarca pontaj Excel"
            description="Format acceptat: .xls, .xlsx"
          />

          {files.length > 0 && (
            <Button onClick={processExcelFile} disabled={isProcessing}>
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Se proceseaza...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Proceseaza fisierul
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
                <CardTitle>Date Pontaj ({data.length} inregistrari)</CardTitle>
                <CardDescription>
                  Total ore: {totalHours} | Verificate: {verifiedCount}/{data.length}
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={verifyAll}>
                <Check className="h-4 w-4 mr-1" />
                Verifica toate
              </Button>
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
                    <TableHead className="w-20">Ore</TableHead>
                    <TableHead className="w-24">Cod</TableHead>
                    <TableHead>Descriere</TableHead>
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
                      <TableCell>{row.hours}h</TableCell>
                      <TableCell>
                        <Badge variant="outline">{row.activityCode || '-'}</Badge>
                      </TableCell>
                      <TableCell className="max-w-[300px] truncate">
                        {row.description || '-'}
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
                          <Badge variant="secondary">In asteptare</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Summary */}
            <div className="mt-4 flex gap-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span className="text-sm">Verificate: {verifiedCount}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <span className="text-sm">In asteptare: {data.length - verifiedCount - issuesCount}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <span className="text-sm">Cu probleme: {issuesCount}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
