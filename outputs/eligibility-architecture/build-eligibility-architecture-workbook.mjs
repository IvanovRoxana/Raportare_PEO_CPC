import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const outputDir = __dirname;
const catalogPath = path.join(repoRoot, "data", "import", "activity-catalog.json");

const catalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));

const workbook = Workbook.create();

const colors = {
  ink: "#172033",
  header: "#1F4E79",
  header2: "#2F6F73",
  fill: "#EAF2F8",
  fill2: "#E7F4EF",
  warn: "#FFF2CC",
  risk: "#FCE4D6",
  good: "#E2F0D9",
  border: "#D9E2EC",
};

function colName(index) {
  let n = index + 1;
  let name = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    name = String.fromCharCode(65 + r) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function writeSheet(name, rows, options = {}) {
  const sheet = workbook.worksheets.add(name);
  sheet.showGridLines = false;
  const rowCount = rows.length;
  const colCount = Math.max(...rows.map((row) => row.length));
  const range = sheet.getRange(`${colName(0)}1:${colName(colCount - 1)}${rowCount}`);
  range.values = rows;
  range.format = {
    font: { name: "Aptos", size: 10, color: colors.ink },
    wrapText: true,
    verticalAlignment: "Top",
  };
  sheet.getRange(`${colName(0)}1:${colName(colCount - 1)}1`).format = {
    fill: options.headerFill || colors.header,
    font: { bold: true, color: "#FFFFFF" },
    wrapText: true,
    verticalAlignment: "Middle",
  };
  range.format.borders = { preset: "outside", style: "thin", color: colors.border };
  sheet.freezePanes.freezeRows(1);
  if (options.freezeColumns) sheet.freezePanes.freezeColumns(options.freezeColumns);
  for (let i = 0; i < colCount; i += 1) {
    const width = options.widths?.[i] || 18;
    sheet.getRange(`${colName(i)}:${colName(i)}`).format.columnWidth = width;
  }
  sheet.getRange(`A1:${colName(colCount - 1)}1`).format.rowHeight = 30;
  if (options.bodyRowHeight) {
    sheet.getRange(`A2:${colName(colCount - 1)}${rowCount}`).format.rowHeight = options.bodyRowHeight;
  }
  return sheet;
}

function splitPiped(value) {
  return String(value || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

const catalogRows = [
  ["ID catalog", "Categorie expert", "Subactivitate", "Nr. activitate", "Nume activitate", "Categorie serviciu", "Activ", "Descriere", "Obiective", "Componenta serviciu", "Beneficiari", "Rezultate asteptate", "Livrabile asteptate", "Indicatori"],
  ...catalog.map((item) => [
    item.id,
    item.category,
    item.saCode,
    item.activityNumber,
    item.activityName,
    item.serviceCategory,
    item.isActive === false ? "Nu" : "Da",
    item.description || "",
    item.objectives || "",
    item.serviceComponent || "",
    item.beneficiaries || "",
    item.expectedResults || "",
    item.deliverables || "",
    item.indicators || "",
  ]),
];

const deliverableRows = [
  ["ID catalog", "Categorie expert", "Subactivitate", "Nr. activitate", "Nume activitate", "Livrabil asteptat", "Sursa"],
  ...catalog.flatMap((item) => splitPiped(item.deliverables).map((deliverable) => [
    item.id,
    item.category,
    item.saCode,
    item.activityNumber,
    item.activityName,
    deliverable,
    "data/import/activity-catalog.json -> ActivityCatalog.deliverables",
  ])),
];

const modelRows = [
  ["Entitate", "Rol in arhitectura", "Campuri cheie", "Relatii / indexuri", "Sursa cod"],
  ["ActivityCatalog", "Catalogul de referinta pentru subactivitate -> activitate -> livrabile asteptate", "id, category, saCode, serviceCategory, activityNumber, activityName, isActive, description, objectives, serviceComponent, beneficiaries, expectedResults, deliverables, indicators", "index(saCode); citire pentru user autentificat; CRUD pentru pm/admin", "amplify/data/resource.ts:638, lib/types.ts:683"],
  ["Activity", "Activitatea raportata de expert; tine selectia SA si activitatea din catalog", "id, date, expertId, hours, activityType/title, saCode, catalogActivityId, description, workingGroupId, periodGroupId, projectCode", "hasMany Deliverable(activityId); hasMany WorkBlockActivityLink(activityId); index(expertId,date), index(year,month)", "amplify/data/resource.ts:130, lib/types.ts:109"],
  ["Deliverable", "Documentul/livrabilul incarcat si metadatele sale AI/OCR", "id, activityId, fileName, fileType, s3Key, documentId, expertId, month, year, sourceActivityId, saCode, deliverableType, docText, firstPageText, eligibilityCheck", "belongsTo Activity(activityId); hasMany WorkBlockDeliverableLink(deliverableId); index(activityId), index(expertId,year,month)", "amplify/data/resource.ts:181, lib/types.ts:400"],
  ["ReportingWorkBlock", "Grup logic de raportare lunara, agregand activitati si livrabile", "id, expertId, projectCode, month, year, title, saCode, reportingFlowType, generatedNarrative, status", "hasMany WorkBlockActivityLink(workBlockId); hasMany WorkBlockDeliverableLink(workBlockId)", "amplify/data/resource.ts:247, lib/types.ts:459"],
  ["WorkBlockActivityLink", "Tabela de legatura N:M intre work block si activitati", "id, workBlockId, activityId, allocatedHours", "belongsTo ReportingWorkBlock; belongsTo Activity; index(workBlockId), index(activityId)", "amplify/data/resource.ts:286, lib/types.ts:485"],
  ["WorkBlockDeliverableLink", "Tabela de legatura N:M intre work block si livrabile", "id, workBlockId, deliverableId, isPrimary, contributionType", "belongsTo ReportingWorkBlock; belongsTo Deliverable; index(workBlockId), index(deliverableId)", "amplify/data/resource.ts:301, lib/types.ts:495"],
  ["AiEligibilityRuleset / AiEligibilityRuleVersion", "Versiuni administrabile pentru reguli de eligibilitate; schema exista, dar flow-ul curent foloseste default-code-rules-v1 in cod", "rulesJson, schemaVersion, version, status, publishedAt, changedBy", "index(status,version), index(schemaVersion), index(rulesetId,version)", "amplify/data/resource.ts:764, lib/types.ts:368"],
  ["DocumentMetadata", "Metadate document in storage, inclusiv OCR si eligibilityCheck, folosit pentru deduplicare si audit", "s3Key, originalFileName, fileHash, firstPageTextHash, contentFingerprint, docText, firstPageText, eligibilityCheck", "legat prin documentId/sourceActivityId si folosit in SharedDeliverable", "lib/types.ts:519"],
];

const flowRows = [
  ["Pas", "Componenta", "Input", "Procesare", "Output / decizie", "Sursa cod"],
  [1, "Formular expert", "Expert, categorie, SA alocate, ActivityCatalog backend + fallback JSON", "resolveExpertActivityCatalog, filtrare dupa categorie, SA, active/indisponibile", "Lista de activitati disponibile pentru expert", "components/expert/activity-form.tsx:494-542"],
  [2, "Selectie activitate", "saCode, catalogActivityId, activityName, campuri catalog", "Se ataseaza activitatii raportate si se transmit catre livrabile", "Activitate raportata cu context de catalog", "lib/types.ts:109"],
  [3, "Upload livrabil", "Fisier, titlu declarat, OCR/firstPageText/docText, deliverableType", "Se salveaza Deliverable si DocumentMetadata; se calculeaza hash/fingerprint pentru duplicate", "Livrabil cu text extras si metadate", "lib/types.ts:400"],
  [4, "Verificare eligibilitate", "Livrabil principal + livrabile din grup, activitatea selectata, catalog, optiuni de livrabil", "Clientul POST-eaza catre /api/ai/check-deliverable-eligibility", "Rezultat temporar neconcludent pana raspunde API-ul", "components/expert/deliverable-item.tsx:1313"],
  [5, "API pre-validare", "Body request", "Feature flag, normalizare documente, concatenare text max 18.000 caractere, minimum 80 caractere", "neconcludent daca textul e insuficient", "app/api/ai/check-deliverable-eligibility/route.ts:108-186"],
  [6, "Shortlist catalog", "Toate activitatile candidate + context text", "Se pastreaza categoria curenta daca exista; scor +25 categorie, +15 aceeasi SA, +20 nume activitate exact in context, +1 token relevant", "Top 12 activitati permise pentru prompt", "app/api/ai/check-deliverable-eligibility/route.ts:47-83"],
  [7, "Evaluare AI guvernata", "Prompt cu livrabil, activitate, catalog, reguli si text extras", "governedGenerateText cu schema JSON stricta", "status, score AI, checks, missingElements, recommendations, riskFlags, suggestedSettings", "app/api/ai/check-deliverable-eligibility/route.ts:215-315"],
  [8, "Protectii si audit semantic", "Rezultat AI + documente + campuri catalog", "Validare schema, protectie Concordia publication, rubrica determinista, calcul normalizedScore", "score final = normalizedScore, plus aiScore/rubricScore/audit", "lib/deliverable-eligibility.ts:534-741"],
  [9, "Persistare rezultat", "EligibilityCheck normalizat", "Clientul scrie eligibilityCheck pe Deliverable", "UI arata status, scor /100, observatii, sugestii de setari", "components/expert/deliverable-item.tsx:1373-1585"],
  [10, "Reporting work blocks", "Activitati si livrabile verificate", "Legaturi WorkBlockActivityLink si WorkBlockDeliverableLink agregate pentru raportare", "Blocuri de lucru pentru export Anexa/OPIS", "amplify/data/resource.ts:247-315"],
];

const rubricRows = [
  ["Criteriu", "Max", "Scor default / regula", "Semnal pass", "Semnal warning/fail", "Observatii"],
  ["activityMatch", 20, "18 daca exista activitate selectata, 12 fara; 6 daca AI sugereaza schimbare activitate sau detecteaza mismatch", "Activitatea/SA se potrivesc cu documentul si catalogul", "Sugestie schimbare activitate sau textul indica nepotrivire", "scoreFromChecks poate limita scorul pe checks relevante activitate/subactivitate/catalog"],
  ["deliverableTypeMatch", 15, "13 daca tipul e specificat, 8 fara; 5 daca AI sugereaza alt tip", "Tipul de livrabil corespunde documentului", "Sugestie de schimbare deliverableType", "Optiunile sunt validate strict impotriva listei permise"],
  ["minimumEvidence", 20, "20 cu text suficient si fara gap; 13 cu text dar gap; 4 fara text suficient", "Cel putin un document are >=80 caractere utile", "Text insuficient / dovezi insuficiente / document neanalizabil", "API intoarce direct neconcludent sub 80 caractere"],
  ["beneficiaryTargetGroup", 10, "10 cand exista beneficiari in catalog si in evidenta; 6 daca doar catalog; 8 daca doar text; 5 fara", "Mentioneaza beneficiar/grup tinta/participant/organizatie/membru", "Necunoscut cand lipsesc indicii", "Criteriu contextual, nu blocheaza singur eligibilitatea"],
  ["expectedResult", 10, "10 daca analiza nu semnaleaza lipsa rezultat/livrabil; 4 daca exista gap", "Rezultat/livrabil asteptat sustinut", "Rezultat/livrabil lipsa", "Se bazeaza pe rezultat AI si pe campurile catalogului"],
  ["formatEvidence", 10, "8 daca numele fisierului are extensie; 5 altfel", "Fisier identificabil", "Fisier/titlu lipsa", "Nu valideaza continutul, doar trasabilitatea formatului"],
  ["dateAuthorLink", 10, "10 daca sunt cel putin 2 semnale din data/autor/link; 7 pentru 1; 4 pentru 0", "Data, autor sau URL in text", "Semnale de trasabilitate insuficiente", "Important pentru publicatii/evenimente"],
  ["duplicateRisk", 5, "5 fara duplicate; 2 cu duplicate", "Fara duplicate marcate", "duplicateStatus prezent", "Leaga verificarea de deduplicarea documentelor"],
  ["Formula scor final", 100, "normalizedScore = round(rubricScore * 70% + min(aiScore, statusFloor) * 30%)", "Scorul determinist domina", "AI nu poate ridica peste pragul statusului", "statusFloor: eligibil=90, eligibil_cu_observatii=75, neeligibil=35, neconcludent=20"],
];

const improvementRows = [
  ["Prioritate", "Zona", "Problema observata", "Propunere imbunatatire", "Impact"],
  ["P1", "Reguli eligibilitate", "AiEligibilityRuleset exista in schema, dar flow-ul curent foloseste default-code-rules-v1 din cod.", "Mutarea rubricii si pragurilor in rulesJson versionat, cu publish/rollback si audit PM.", "Reguli ajustabile fara deploy, trasabilitate mai buna."],
  ["P1", "Catalog livrabile", "ActivityCatalog.deliverables este string cu valori separate prin |.", "Normalizare intr-o entitate ActivityCatalogDeliverable sau camp JSON array versionat.", "Validari mai precise, dropdown-uri curate, raportare pe livrabil fara parsing text."],
  ["P1", "Scor", "Status AI si rubrica pot intra in conflict; scorul final combina 70/30, dar nu exista praguri explicite de decizie post-normalizare.", "Definirea pragurilor: ex. >=85 eligibil, 65-84 cu observatii, <65 neeligibil/neconcludent in functie de evidenta.", "Decizii consistente si explicabile."],
  ["P2", "Evidenta OCR", "MinimumEvidence foloseste prag simplu de lungime si regex-uri generale.", "Adaugare scor de calitate OCR: pagini citite, limba, densitate text, prezenta tabele/imagini relevante.", "Reduce neconcludente false si eligibile slabe."],
  ["P2", "Shortlist catalog", "Token matching este lexical si poate favoriza activitati apropiate ca vocabular.", "Combinare lexical + embedding/RAG pe catalog si istoric validat, cu explicatii per candidat.", "Sugestii mai bune pentru activitate gresit selectata."],
  ["P2", "Validare sugestii", "Sugestiile sunt permise doar daca exista exact in top 12 shortlist.", "Separarea shortlist pentru prompt de lista completa de validare, sau garantarea includerii activitatii propuse.", "Evita respingerea unei sugestii corecte care n-a intrat in top 12."],
  ["P2", "Audit", "ModelAuditId si semanticAudit sunt salvate, dar ruleset administrabil nu pare conectat in runtime.", "Legare rezultat de AiEligibilityRuleVersion activa si salvare snapshot reguli aplicate.", "Audit AM/PM mai solid."],
  ["P3", "Date relationale", "Activitatea si livrabilul tin ambele saCode/deliverableType, ceea ce poate deriva inconsistente.", "Validari la salvare: Deliverable.saCode trebuie sa corespunda Activity.saCode, iar catalogActivityId sa existe.", "Mai putine erori de selectie."],
  ["P3", "UX", "Utilizatorul vede scor si observatii, dar nu neaparat contributia fiecarui criteriu.", "Afisare rubricScores compact in UI: criteriu, scor/max, evidenta.", "Expertul intelege ce trebuie corectat."],
];

const summaryRows = [
  ["Sectiune", "Concluzie"],
  ["Baza de date folosita", "Amplify Data / AppSync peste modele DynamoDB. Pentru legatura SA -> activitate -> livrabile asteptate se foloseste ActivityCatalog, incarcat din backend si completat cu seed-ul data/import/activity-catalog.json."],
  ["Seed catalog", `${catalog.length} activitati in data/import/activity-catalog.json; livrabilele sunt stocate ca text delimitat cu |.`],
  ["Legatura operationala", "Activity.catalogActivityId + Activity.saCode leaga activitatea raportata de catalog; Deliverable.activityId leaga documentul de activitate; WorkBlockActivityLink si WorkBlockDeliverableLink creeaza gruparea de raportare."],
  ["Validare eligibilitate", "API-ul /api/ai/check-deliverable-eligibility combina rezultat AI strict JSON cu o rubrica determinista si returneaza score final normalizat."],
  ["Formula scor", "normalizedScore = round(rubricScore * 0.7 + min(aiScore, statusFloor) * 0.3). Status floor: eligibil 90, eligibil_cu_observatii 75, neeligibil 35, neconcludent 20."],
  ["Risc principal", "Catalogul si regulile sunt partial textuale/hardcodate; modelul pentru ruleset exista, dar ar merita conectat efectiv la runtime."],
];

writeSheet("00_Sumar", summaryRows, { widths: [28, 120], headerFill: colors.header2, bodyRowHeight: 42 });
const catalogSheet = writeSheet("01_Catalog_Activitati", catalogRows, { widths: [24, 12, 14, 12, 44, 32, 10, 55, 55, 55, 38, 44, 44, 38], freezeColumns: 3 });
const livrabileSheet = writeSheet("02_Livrabile_Normalizate", deliverableRows, { widths: [24, 12, 14, 12, 44, 44, 54], freezeColumns: 3 });
writeSheet("03_Model_Date", modelRows, { widths: [28, 42, 70, 62, 34], headerFill: colors.header2, bodyRowHeight: 66 });
writeSheet("04_Flow_Eligibilitate", flowRows, { widths: [8, 28, 46, 64, 48, 36], headerFill: colors.header, bodyRowHeight: 48 });
writeSheet("05_Rubrica_Scor", rubricRows, { widths: [26, 8, 58, 42, 42, 58], headerFill: colors.header2, bodyRowHeight: 54 });
writeSheet("06_Imbunatatiri", improvementRows, { widths: [12, 24, 55, 65, 42], headerFill: "#7A4E12", bodyRowHeight: 54 });

catalogSheet.tables.add(`A1:N${catalogRows.length}`, true, "ActivityCatalogTable");
livrabileSheet.tables.add(`A1:G${deliverableRows.length}`, true, "DeliverablesNormalizedTable");

await fs.mkdir(outputDir, { recursive: true });
const checks = await workbook.inspect({
  kind: "workbook,sheet",
  maxChars: 6000,
});
console.log(checks.ndjson);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 },
  summary: "final formula error scan",
});
console.log(errors.ndjson);

for (const sheetName of ["00_Sumar", "01_Catalog_Activitati", "02_Livrabile_Normalizate", "03_Model_Date", "04_Flow_Eligibilitate", "05_Rubrica_Scor", "06_Imbunatatiri"]) {
  const preview = await workbook.render({ sheetName, autoCrop: "all", scale: 1, format: "png" });
  await fs.writeFile(path.join(outputDir, `${sheetName}.png`), new Uint8Array(await preview.arrayBuffer()));
}

const output = await SpreadsheetFile.exportXlsx(workbook);
const outputPath = path.join(outputDir, "arhitectura-catalog-livrabile-eligibilitate.xlsx");
await output.save(outputPath);
console.log(outputPath);
