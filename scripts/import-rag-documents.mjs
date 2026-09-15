#!/usr/bin/env node
/* global fetch */

import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_DIR = path.join(process.cwd(), 'rag-seed');
const SUPPORTED_EXTENSIONS = new Set(['.txt', '.md', '.pdf', '.docx']);
const SOURCE_TYPES_BY_FOLDER = new Map([
  ['cerere-finantare', 'cerere_finantare'],
  ['manual-beneficiar', 'manual_beneficiar'],
  ['descriere-activitati', 'descriere_activitati'],
  ['fise-post', 'fisa_post'],
  ['raportari-aprobate-oir', 'raportare_aprobata_oir'],
  ['livrabile-istorice', 'livrabil_istoric'],
]);

function parseArgs(argv) {
  const args = {
    dir: DEFAULT_DIR,
    category: '',
    projectCode: '',
    positionInProject: '',
    dryRun: false,
    endpoint: '',
    token: '',
    tokenEnv: 'RAG_ADMIN_IMPORT_TOKEN',
    cognitoToken: '',
    cognitoTokenEnv: 'RAG_COGNITO_ACCESS_TOKEN',
    maxFiles: 0,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dir') args.dir = path.resolve(argv[++index]);
    if (arg === '--category') args.category = argv[++index] || '';
    if (arg === '--project-code') args.projectCode = argv[++index] || '';
    if (arg === '--position-in-project') args.positionInProject = argv[++index] || '';
    if (arg === '--dry-run') args.dryRun = true;
    if (arg === '--endpoint') args.endpoint = argv[++index] || '';
    if (arg === '--token') args.token = argv[++index] || '';
    if (arg === '--token-env') args.tokenEnv = argv[++index] || 'RAG_ADMIN_IMPORT_TOKEN';
    if (arg === '--cognito-token') args.cognitoToken = argv[++index] || '';
    if (arg === '--cognito-token-env') args.cognitoTokenEnv = argv[++index] || 'RAG_COGNITO_ACCESS_TOKEN';
    if (arg === '--max-files') args.maxFiles = Number(argv[++index]) || 0;
  }

  return args;
}

function normalizeText(value) {
  return String(value ?? '')
    .replace(/\u0000/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function looksLikeCorruptedText(value) {
  const sample = String(value || '').slice(0, 5000);
  if (sample.length < 100) return false;
  const suspicious = sample.match(/[\u3400-\u9fff\ufffd]/g)?.length || 0;
  return suspicious / sample.length > 0.03;
}

function hashText(value) {
  return createHash('sha256').update(value).digest('hex');
}

function splitText(text, maxChars = 1400, overlapChars = 180) {
  const normalized = normalizeText(text);
  const chunks = [];
  let start = 0;

  while (start < normalized.length) {
    const hardEnd = Math.min(normalized.length, start + maxChars);
    let end = hardEnd;
    if (hardEnd < normalized.length) {
      const split = Math.max(
        normalized.lastIndexOf('\n\n', hardEnd),
        normalized.lastIndexOf('. ', hardEnd),
        normalized.lastIndexOf(' ', hardEnd),
      );
      if (split > start + 400) end = split + 1;
    }

    const chunkText = normalizeText(normalized.slice(start, end));
    if (chunkText) {
      chunks.push({
        chunkIndex: chunks.length,
        textHash: hashText(chunkText),
        tokenEstimate: Math.ceil(chunkText.length / 4),
        textPreview: chunkText.slice(0, 160),
      });
    }

    if (end >= normalized.length) break;
    start = Math.max(0, end - overlapChars);
  }

  return chunks;
}

function parseCsvLine(line) {
  const cells = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      cells.push(value.trim());
      value = '';
    } else {
      value += char;
    }
  }

  cells.push(value.trim());
  return cells;
}

function metadataValue(value) {
  const normalized = String(value || '').trim();
  if (!normalized || normalized === 'NEEDS_REVIEW') return undefined;
  return normalized;
}

function metadataNumber(value) {
  const normalized = metadataValue(value);
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function readMetadata(folderPath) {
  const metadataPath = path.join(folderPath, 'metadata.csv');
  try {
    const content = await readFile(metadataPath, 'utf8');
    const lines = content.split(/\r?\n/).filter((line) => line.trim());
    if (lines.length < 2) return new Map();
    const headers = parseCsvLine(lines[0]);
    const rows = new Map();

    for (const line of lines.slice(1)) {
      const cells = parseCsvLine(line);
      const row = Object.fromEntries(headers.map((header, index) => [header, cells[index] || '']));
      if (row.fileName) rows.set(row.fileName, row);
    }

    return rows;
  } catch {
    return new Map();
  }
}

async function listFiles(folderPath) {
  const entries = await readdir(folderPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name !== 'metadata.csv')
    .map((entry) => path.join(folderPath, entry.name));
}

async function listDocumentFolders(rootDir) {
  const folders = [];
  const pending = [rootDir];

  while (pending.length) {
    const folderPath = pending.pop();
    const entries = await readdir(folderPath, { withFileTypes: true });
    const files = entries.filter((entry) => entry.isFile() && entry.name !== 'metadata.csv');
    if (files.some((entry) => SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))) {
      folders.push(folderPath);
    }
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        pending.push(path.join(folderPath, entry.name));
      }
    }
  }

  return folders;
}

async function extractPdfText(filePath) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(await readFile(filePath));
  const document = await pdfjs.getDocument({ data, useWorkerFetch: false, isEvalSupported: false }).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '));
  }
  return pages.join('\n\n');
}

async function extractDocxText(filePath) {
  const mammothModule = await import('mammoth');
  const mammoth = mammothModule.default ?? mammothModule;
  const result = await mammoth.extractRawText({ buffer: await readFile(filePath) });
  return result.value || '';
}

async function readDocumentText(filePath, extension) {
  if (extension === '.pdf') return extractPdfText(filePath);
  if (extension === '.docx') return extractDocxText(filePath);
  return readFile(filePath, 'utf8');
}

function inferSourceMetadata(fileName, folderName, args) {
  const normalizedName = fileName.toLowerCase();
  const saMatch = normalizedName.match(/\bsa\s*(\d+)[._-](\d+)\b/i);
  const projectMatch = fileName.match(/\b(\d{6})\b/) || folderName.match(/\b(\d{6})\b/);
  const positionByName = [
    [/business[_ -]?hub/i, 'Coordonator Business HUB'],
    [/centre[_ -]?regionale|centru[_ -]?regional/i, 'Coordonator Centre Regionale'],
    [/afaceri[_ -]?publice/i, 'Responsabil Afaceri Publice'],
    [/informare[_ -]?si[_ -]?comunicare/i, 'Responsabil Informare si Comunicare'],
    [/recrutare[_ -]?si[_ -]?selectie[_ -]?grup[_ -]?tinta/i, 'Expert recrutare si selectie grup tinta'],
    [/protectia[_ -]?datelor/i, 'Expert protectia datelor cu caracter personal'],
    [/cercetare[_ -]?si[_ -]?analize/i, 'Expert cercetare si analize'],
  ];
  const positionInProject = positionByName.find(([pattern]) => pattern.test(normalizedName))?.[1] || args.positionInProject;
  const isJobDescription = /fisa[_ -]?de?[_ -]?post/i.test(normalizedName);
  const isActivityDescription = /descriere[_ -]?activitate/i.test(normalizedName);

  return {
    sourceType: isJobDescription ? 'fisa_post' : isActivityDescription ? 'scop_sa' : SOURCE_TYPES_BY_FOLDER.get(folderName) || 'other',
    saCode: saMatch ? `SA${saMatch[1]}.${saMatch[2]}` : undefined,
    projectCode: args.projectCode || projectMatch?.[1],
    positionInProject,
  };
}

async function collectDocuments(rootDir, args) {
  const folders = await listDocumentFolders(rootDir);
  const documents = [];
  const skipped = [];

  for (const folderPath of folders) {
    const folderName = path.basename(folderPath);
    const sourceType = SOURCE_TYPES_BY_FOLDER.get(folderName) || 'other';
    const metadata = await readMetadata(folderPath);
    const files = await listFiles(folderPath);

    for (const filePath of files) {
      if (args.maxFiles > 0 && documents.length >= args.maxFiles) return { documents, skipped };
      const extension = path.extname(filePath).toLowerCase();
      const fileName = path.basename(filePath);
      if (!SUPPORTED_EXTENSIONS.has(extension)) {
        skipped.push({ fileName, reason: 'unsupported_extension' });
        continue;
      }

      const row = metadata.get(fileName) || {};
      const inferred = inferSourceMetadata(fileName, folderName, args);
      if (folderName === 'raportari-aprobate-oir' && !metadata.has(fileName)) {
        skipped.push({ fileName, reason: 'missing_metadata_row' });
        continue;
      }

      const fileStat = await stat(filePath);
      let text;
      try {
        text = await readDocumentText(filePath, extension);
      } catch (error) {
        skipped.push({ fileName, reason: 'text_extraction_failed', detail: error instanceof Error ? error.message : String(error) });
        continue;
      }
      if (looksLikeCorruptedText(text)) {
        skipped.push({ fileName, reason: 'text_looks_corrupted_encoding' });
        continue;
      }
      const normalizedText = normalizeText(text);
      if (normalizedText.length < 100) {
        skipped.push({ fileName, reason: 'text_too_short_after_extraction' });
        continue;
      }
      const activityName = metadataValue(row.activityName);
      const category = metadataValue(row.category) || metadataValue(row.expertCategory) || args.category;
      const positionInProject = metadataValue(row.positionInProject) || inferred.positionInProject;
      const expertRole = metadataValue(row.expertRole) || positionInProject;
      documents.push({
        title: activityName || path.basename(fileName, extension),
        sourceType: metadataValue(row.sourceType) || inferred.sourceType || sourceType,
        text: normalizedText,
        category,
        expertId: metadataValue(row.expertId),
        expertName: metadataValue(row.expertName),
        expertRole,
        month: metadataNumber(row.month),
        year: metadataNumber(row.year),
        saCode: metadataValue(row.saCode) || inferred.saCode,
        activityName,
        approvalStatus: metadataValue(row.approvalStatus),
        projectCode: metadataValue(row.projectCode) || inferred.projectCode,
        originalFileName: fileName,
        createdBy: 'script-import-rag-documents',
        metadata: {
          folder: folderName,
          category,
          positionInProject,
          expertRole,
          fileSize: fileStat.size,
          textHash: hashText(normalizedText),
          sourceFileName: metadataValue(row.sourceFileName),
          sourcePath: metadataValue(row.sourcePath),
          reviewNotes: metadataValue(row.reviewNotes),
        },
      });
    }
  }

  return { documents, skipped };
}

async function postDocument(endpoint, token, cognitoToken, document, dryRun) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-rag-admin-token': token,
      ...(cognitoToken ? { 'x-cognito-access-token': cognitoToken } : {}),
    },
    body: JSON.stringify({ ...document, dryRun }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { documents, skipped } = await collectDocuments(args.dir, args);
  const summary = documents.map((document) => {
    const chunks = splitText(document.text);
    return {
      fileName: document.originalFileName,
      sourceType: document.sourceType,
      category: document.category,
      expertRole: document.expertRole,
      positionInProject: document.metadata.positionInProject,
      title: document.title,
      month: document.month,
      year: document.year,
      saCode: document.saCode,
      projectCode: document.projectCode,
      activityName: document.activityName,
      textChars: normalizeText(document.text).length,
      chunks: chunks.length,
      firstChunk: chunks[0]?.textPreview,
    };
  });

  console.log(JSON.stringify({
    dryRun: args.dryRun,
      dir: args.dir,
      projectCode: args.projectCode || undefined,
    documents: summary,
    skipped,
    note: 'Importul proceseaza .txt, .md, .pdf si .docx; PDF-urile scanate pot necesita OCR separat.',
  }, null, 2));

  if (args.dryRun) return;
  if (!args.endpoint) {
    throw new Error('Pentru import real seteaza --endpoint http://localhost:3000/api/admin/rag/index-document dupa un dry-run validat.');
  }
  const token = args.token || process.env[args.tokenEnv]?.trim() || '';
  if (!token) {
    throw new Error(`Pentru import real seteaza ${args.tokenEnv} sau foloseste --token. Tokenul nu este afisat in output.`);
  }
  const cognitoToken = args.cognitoToken || process.env[args.cognitoTokenEnv]?.trim() || '';
  if (!cognitoToken) {
    throw new Error(`Pentru import real seteaza ${args.cognitoTokenEnv} sau foloseste --cognito-token. Tokenul Cognito nu este afisat in output.`);
  }

  for (const document of documents) {
    const result = await postDocument(args.endpoint, token, cognitoToken, document, false);
    console.log(JSON.stringify({
      fileName: document.originalFileName,
      ok: result.ok,
      documentId: result.documentId,
      chunks: result.chunks,
    }));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
