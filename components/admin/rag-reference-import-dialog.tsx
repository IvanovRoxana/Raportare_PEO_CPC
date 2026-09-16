'use client';

import { useRef, useState } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import { ClipboardCheck, Loader2, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { inferRagReferenceImportFromFileName, REFERENCE_SOURCE_TYPES, type RagReferenceImportOverride } from '@/lib/rag/reference-import';
import { uploadReferenceFile, validateReferenceUpload, type ReferenceUploadResult } from '@/lib/rag/reference-upload';

type UploadRow = {
  id: number;
  file: File;
  override: RagReferenceImportOverride;
  result?: ReferenceUploadResult;
};

const SOURCE_LABELS: Record<string, string> = {
  scop_sa: 'Scop SA', descriere_activitati: 'Descriere activitati', fisa_post: 'Fisa postului',
  cerere_finantare: 'Cerere de finantare', manual_beneficiar: 'Manual beneficiar',
};
const STATUS_LABELS: Record<ReferenceUploadResult['status'], string> = {
  dry_run: 'Verificat, neindexat', indexed: 'Indexat', duplicate: 'Exista deja in RAG', skipped: 'Omis', failed: 'Eroare',
};

export function RagReferenceImportDialog({ roles, onIndexed }: { roles: string[]; onIndexed: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<UploadRow[]>([]);
  const [projectCode, setProjectCode] = useState('302141');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const lock = useRef(false);
  const nextId = useRef(0);
  const ready = rows.filter((row) => row.result?.status === 'dry_run');
  const isSaved = (row: UploadRow) => row.result?.status === 'indexed' || row.result?.status === 'duplicate';

  function addFiles(files: FileList | null) {
    if (!files) return;
    setError('');
    const added = Array.from(files).map((file): UploadRow => {
      const inference = inferRagReferenceImportFromFileName(file.name, { projectCode });
      return {
        id: nextId.current++, file,
        override: inference.ok ? {
          sourceType: inference.input.sourceType, saCode: inference.input.saCode, expertRole: inference.input.expertRole,
        } : {},
      };
    });
    setRows((current) => [...current, ...added.filter((row) => !current.some((item) => item.file.name === row.file.name && item.file.size === row.file.size && item.file.lastModified === row.file.lastModified))]);
  }

  function edit(id: number, override: RagReferenceImportOverride) {
    setRows((current) => current.map((row) => row.id === id ? { ...row, override: { ...row.override, ...override }, result: undefined } : row));
  }

  async function run(dryRun: boolean) {
    if (lock.current) return;
    const candidates = rows.filter((row) => dryRun ? !isSaved(row) : row.result?.status === 'dry_run');
    if (!candidates.length) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      // One request per file keeps a large selection from becoming a single long-running request.
      for (const [index, row] of candidates.entries()) {
        setProgress(`${dryRun ? 'Verificare' : 'Indexare'} ${index + 1}/${candidates.length}: ${row.file.name}`);
        let result: ReferenceUploadResult;
        try {
          const validation = validateReferenceUpload(row.file, projectCode, row.override);
          if (validation) throw new Error(validation);
          const token = (await fetchAuthSession()).tokens?.accessToken?.toString() || '';
          result = await uploadReferenceFile(row.file, projectCode, row.override, dryRun, token);
        } catch (caught) {
          result = { fileName: row.file.name, status: 'failed', error: caught instanceof Error ? caught.message : 'Cererea a esuat.' };
          if (!dryRun) result.error += ' Verifica biblioteca RAG inainte de reincercare; rezultatul scrierii poate fi partial.';
        }
        setRows((current) => current.map((item) => item.id === row.id ? { ...item, result } : item));
      }
      if (!dryRun) await onIndexed();
      setProgress(dryRun ? 'Verificare terminata. Nu s-au scris date in backend.' : 'Import terminat. Consulta rezultatul fiecarui fisier.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Actualizarea bibliotecii a esuat.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!lock.current) setOpen(value); }}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline"><Upload className="h-4 w-4" />Importa PDF / DOCX</Button>
      </DialogTrigger>
      <DialogContent showCloseButton={!busy} className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-4xl" onInteractOutside={(event) => { if (busy) event.preventDefault(); }}>
        <DialogHeader>
          <DialogTitle>Import documente de referinta</DialogTitle>
          <DialogDescription>Verifica textul si asocierea la proiect, SA sau rol inainte de indexarea in RAG. Fisierele originale nu sunt arhivate aici.</DialogDescription>
        </DialogHeader>
        <div className="grid min-w-0 gap-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
          <div className="space-y-2">
            <Label htmlFor="reference-project">Cod proiect</Label>
            <Input id="reference-project" value={projectCode} disabled={busy || rows.some(isSaved)} onChange={(event) => {
              setProjectCode(event.target.value);
              setRows((current) => current.map((row) => ({ ...row, result: undefined })));
            }} />
          </div>
          <div className="min-w-0 space-y-2">
            <Label htmlFor="reference-files">Documente PDF / DOCX (maximum 15 MB fiecare)</Label>
            <Input id="reference-files" type="file" multiple accept=".pdf,.docx" disabled={busy} onChange={(event) => { addFiles(event.target.files); event.target.value = ''; }} />
          </div>
        </div>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <p role="status" className="break-words text-sm text-muted-foreground">{progress || `${rows.length} fisiere selectate`}</p>
        <datalist id="reference-expert-roles">{Array.from(new Set(roles)).filter(Boolean).map((role) => <option key={role} value={role} />)}</datalist>
        <div className="min-w-0 divide-y" aria-busy={busy}>
          {rows.map((row) => {
            const saved = isSaved(row);
            const needsSa = ['scop_sa', 'descriere_activitati'].includes(row.override.sourceType || '');
            return (
              <section key={row.id} className="min-w-0 space-y-3 py-4" aria-label={row.file.name}>
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-semibold">{row.file.name}</p>
                    <p className="text-xs text-muted-foreground">{Math.ceil(row.file.size / 1024)} KB</p>
                  </div>
                  <Button type="button" size="icon" variant="ghost" title={`Elimina ${row.file.name} din selectie`} aria-label={`Elimina ${row.file.name} din selectie`} disabled={busy} onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))}><Trash2 className="h-4 w-4" /></Button>
                </div>
                <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                  <div className="min-w-0 space-y-1">
                    <Label htmlFor={`source-${row.id}`}>Tip sursa</Label>
                    <select id={`source-${row.id}`} className="h-9 w-full min-w-0 rounded-md border bg-background px-2 text-sm" value={row.override.sourceType || ''} disabled={busy || saved} onChange={(event) => edit(row.id, { sourceType: event.target.value, saCode: undefined, expertRole: undefined })}>
                      <option value="">Alege tipul sursei</option>
                      {REFERENCE_SOURCE_TYPES.map((type) => <option key={type} value={type}>{SOURCE_LABELS[type]}</option>)}
                    </select>
                  </div>
                  {needsSa && <div className="space-y-1"><Label htmlFor={`sa-${row.id}`}>Cod SA</Label><Input id={`sa-${row.id}`} value={row.override.saCode || ''} disabled={busy || saved} onChange={(event) => edit(row.id, { saCode: event.target.value.toUpperCase() })} /></div>}
                  {row.override.sourceType === 'fisa_post' && <div className="min-w-0 space-y-1"><Label htmlFor={`role-${row.id}`}>Pozitia din catalogul expertilor</Label><Input id={`role-${row.id}`} list="reference-expert-roles" value={row.override.expertRole || ''} disabled={busy || saved} onChange={(event) => edit(row.id, { expertRole: event.target.value })} /></div>}
                </div>
                {row.result && <div className="space-y-2 text-sm">
                  <p className={['failed', 'skipped'].includes(row.result.status) ? 'text-red-700' : 'text-emerald-700'}>{STATUS_LABELS[row.result.status]}{row.result.chunks !== undefined ? ` - ${row.result.chunks} fragmente` : ''}{row.result.pageCount ? ` - ${row.result.pageCount} pagini` : ''}</p>
                  {(row.result.error || row.result.reason) && <p role="alert" className="break-words text-red-700">{row.result.error || row.result.reason}</p>}
                  {row.result.documentId && <p className="break-all text-xs text-muted-foreground">ID document: {row.result.documentId}</p>}
                  {row.result.warnings?.map((warning, index) => <p key={index} className="text-amber-800">{warning}</p>)}
                  {!!row.result.preview?.length && <details><summary className="cursor-pointer">Text extras (previzualizare)</summary><p className="mt-2 whitespace-pre-wrap break-words text-muted-foreground">{row.result.preview.map((chunk) => chunk.text).join('\n\n')}</p></details>}
                </div>}
              </section>
            );
          })}
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
          <Button type="button" variant="outline" disabled={busy || !rows.some((row) => !isSaved(row)) || !projectCode.trim()} onClick={() => void run(true)}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}Verifica fisierele</Button>
          <Button type="button" className="h-auto min-h-9 max-w-full whitespace-normal" disabled={busy || !ready.length} onClick={() => void run(false)}><Upload className="h-4 w-4" />Indexeaza fisierele verificate ({ready.length})</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
