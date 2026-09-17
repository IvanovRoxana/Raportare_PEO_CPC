'use client';

import { useRef, useState } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AiApiStatusPanel } from './ai-api-status-panel';

type RagLibraryDocument = {
  id: string;
  title: string;
  sourceType: string;
  category?: string;
  projectCode?: string;
  saCode?: string;
  expertName?: string;
  originalFileName?: string;
  indexedAt?: string;
};

async function getAccessToken() {
  const token = (await fetchAuthSession({ forceRefresh: true })).tokens?.accessToken?.toString();
  if (!token) throw new Error('Nu am gasit sesiunea Cognito curenta.');
  return token;
}

export function DataInfrastructurePanel() {
  const [libraryDocuments, setLibraryDocuments] = useState<RagLibraryDocument[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [repairingProject, setRepairingProject] = useState(false);
  const [projectRepairMessage, setProjectRepairMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const projectRepairLock = useRef(false);
  async function loadLibrary() {
    setLoadingLibrary(true);
    try {
      const token = await getAccessToken();
      const response = await fetch('/api/admin/rag/library', {
        cache: 'no-store',
        headers: { authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || 'Biblioteca RAG nu a putut fi incarcata.');
      setLibraryDocuments(data?.documents || []);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Biblioteca RAG nu a putut fi incarcata.');
    } finally {
      setLoadingLibrary(false);
    }
  }

  async function completeMissingProjects() {
    if (projectRepairLock.current) return;
    projectRepairLock.current = true;
    setRepairingProject(true);
    let documents = 0;
    let chunks = 0;
    let failures = 0;
    try {
      for (const model of ['KnowledgeDocument', 'KnowledgeChunk']) {
        let nextToken: string | null = null;
        do {
          const token = await getAccessToken();
          const response: Response = await fetch('/api/admin/rag/library', {
            method: 'PATCH',
            headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
            body: JSON.stringify({ action: 'complete-project', model, nextToken }),
            signal: AbortSignal.timeout(60000),
          });
          const data: { updated: number; failed: string[]; nextToken: string | null; error?: string } | null = await response.json().catch(() => null);
          if (!response.ok || !data || !Number.isInteger(data.updated) || !Array.isArray(data.failed)) {
            throw new Error(data?.error || 'Serverul nu a confirmat completarea proiectului. Poti relua operatia.');
          }
          if (model === 'KnowledgeDocument') documents += data.updated;
          else chunks += data.updated;
          failures += data.failed.length;
          nextToken = data.nextToken;
          setProjectRepairMessage(`Proiect 302141: ${documents} documente si ${chunks} fragmente completate. Procesare in curs...`);
        } while (nextToken);
      }
      setProjectRepairMessage(`Finalizat: ${documents} documente si ${chunks} fragmente completate cu 302141.${failures ? ` ${failures} actualizari neconfirmate; reia operatia.` : ''} Codurile existente au fost pastrate.`);
    } catch (error) {
      setProjectRepairMessage(`Operatie oprita dupa ${documents} documente si ${chunks} fragmente confirmate. ${error instanceof Error ? error.message : 'Reia completarea.'}`);
    } finally {
      projectRepairLock.current = false;
      setRepairingProject(false);
      await loadLibrary();
    }
  }

  return <div className="space-y-5">
    <AiApiStatusPanel />
    {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <Card className="rounded-2xl">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Index RAG / întreținere</CardTitle>
            <Button type="button" variant="outline" size="sm" className="mt-2" disabled={repairingProject} onClick={() => void completeMissingProjects()}>
              {repairingProject && <Loader2 className="h-4 w-4 animate-spin" />} Completeaza proiectul 302141
            </Button>
            <p className="mt-1 text-xs text-muted-foreground">Completeaza doar proiectele lipsa din documente si fragmentele RAG.</p>
            {projectRepairMessage && <p role="status" className="mt-2 text-sm">{projectRepairMessage}</p>}
            <p className="mt-1 text-sm text-muted-foreground">Inventarul documentelor indexate. Conținutul de referință se gestionează în PM → AI + RAG / Knowledge.</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => void loadLibrary()} disabled={loadingLibrary}>
            {loadingLibrary ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Reincarca
          </Button>
        </CardHeader>
        <CardContent>
          {!libraryDocuments.length ? <p className="text-sm text-muted-foreground">Apasa Reincarca pentru a vedea documentele indexate.</p> : (
            <div className="space-y-2">
              {libraryDocuments.map((document) => (
                <div key={document.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-white px-3 py-2 text-sm">
                  <div>
                    <div className="font-medium text-slate-900">{document.title}</div>
                    {document.projectCode && document.projectCode !== '302141' && <div className="text-xs text-amber-700">Proiect diferit de 302141 — necesita verificare.</div>}
                    <div className="text-xs text-muted-foreground">{document.sourceType} · {document.projectCode || 'fără proiect'}{document.saCode ? ` · ${document.saCode}` : ''}{document.category ? ` · ${document.category}` : ''}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
  </div>;
}
