# Plan revizuit — eligibilitate autoritară

Referință: `PLAN (1).md`, revizuit la 16 septembrie 2026.

## Corecții de implementare

- Resolverul este în ruta server Next.js. Identitatea Cognito se verifică criptografic, iar profilul și apartenența documentelor se citesc din backend. Accesul la RAG și persistența folosesc rolul IAM al serviciului SSR; modelele AppSync RAG rămân PM/Admin.
- Evaluările documentelor încă nesalvate rămân propuneri, pentru a păstra fluxul existent. Numai documentele persistate, cu textul verificat în backend, pot avea un rezultat autoritar. Datele trimise de browser nu pot certifica propriul conținut.
- Regulile noi au schemă strictă și operatori implementați. Regulile istorice nu sunt reinterpretate automat ca reguli executabile. Publicarea creează un instantaneu validat; nu rescrie versiunile publicate. Rollback-ul este o versiune nouă, aplicabilă de acum înainte.
- O generație se publică numai după verificarea manifestului, identităților, hash-urilor și embeddingurilor. Publicarea concurentă folosește o condiție atomică. Generațiile vechi se păstrează.
- Completitudinea extragerii și a analizei se tratează separat. O lipsă esențială produce „Necesită clarificare”. Simpla existență a unui citat nu demonstrează criteriul.
- Cheia evaluării include textul verificat, catalogul, regulile, sursele/generațiile, contextul și configurația evaluatorului. Deciziile PM sunt înregistrări separate, nu suprascrieri ale rezultatului AI.
- Configurația OpenAI existentă din deployment se păstrează. Activarea și verificările reale cer schema nouă, rolul SSR și utilizatori de staging.

## Acceptare

Verificări locale: TypeScript, ESLint, întreaga suită Node și teste de regresie pentru autorizare, reguli, manifest, invalidare și decizii PM. Verificările staging și o evaluare reală nu se declară efectuate fără execuție și dovezi.

## Implementare în aplicația existentă

| Cerințe | Implementare |
| --- | --- |
| SUP-02, ELG-01/02/06 | `lib/eligibility-resolver.ts`, `lib/eligibility-authorization.ts` și `lib/eligibility-scope.ts`: sesiune Cognito verificată, acces la expert/document/proiect, rol canonic și aceeași aplicabilitate pentru RAG, import, health și backfill. |
| SUP-03, ELG-07/08/09 | Registru Zod strict, patru operatori executabili, plan de dovezi, verificarea citatelor și publicare tranzacțională a versiunilor în `/api/eligibility/rulesets/publish`. |
| ELG-03/04/05 | Originale arhivate în S3, generații deterministe, manifest verificat, publicare condiționată și păstrarea fragmentelor anterioare. O extragere parțială nu înlocuiește generația validă. |
| ELG-10/12, SUP-04 | Evaluări și dovezi persistate pe server, cheie de invalidare, reutilizare identică și verificare la citire. Analiza bulk rămâne propunere de clasificare. |
| ELG-11 | Jurnal comun pentru generare și embeddinguri, modelul efectiv, hash-uri, cost și fiecare retry. Rezultatul evaluării include consumul asociat. |
| Expert–PM | Cardurile și panoul PM existente afișează evaluarea verificată, limitele, criteriile, versiunea regulilor și deciziile PM. Reîncadrarea pornește o evaluare nouă. |
| Migrare | `/api/admin/rag/backfill-metadata` completează aditiv proiectul și rolul documentelor și propagă asocierea la fragmente. Nu presupune că extragerea veche este completă. |

Modificările locale RAG anterioare acestei intervenții au fost păstrate. Nu a fost creată o aplicație separată. Calea afișată în bara laterală Codex este folderul local al aceluiași proiect.

## Verificări și limite

- Suita locală: **918 teste trecute, zero eșecuri**. Acoperă autorizarea, aliasurile, regulile contradictorii, perioadele, invalidarea la intrarea/ieșirea unui criteriu din valabilitate, dovezile nerelevante, manifestul incomplet, modelul embedding greșit, retry, publicarea concurentă, restaurarea de generație și migrarea aditivă.
- ESLint: zero erori; avertismentul existent din `scripts/prepare-reference-data.mjs` pentru `prepareActivities` rămâne.
- `tsc --noEmit` și buildul Next.js de producție: **trecute pe versiunea finală**. Buildul a emis avertismente de cache webpack, fără erori de compilare. `git diff --check` a trecut.
- Nu au fost executate publicarea în AWS, migrarea datelor remote, testele cu sesiuni reale Expert/PM/Admin sau un apel OpenAI real pentru acceptarea acestei modificări.
- Verificarea read-only a ramurii `staging` din 16 septembrie 2026 a indicat că `computeRoleArn` nu este atribuit. Configurarea OpenAI existentă și fișierul `amplify.yml` nu au fost schimbate.
- Limitele AI existente rămân locale procesului SSR; jurnalul contabilizează apelurile, dar nu introduce un plafon global distribuit între toate instanțele.
- Documentele istorice fără original verificabil/completitudine și regulile vechi fără schema executabilă nu primesc automat aprobări. Publicarea unui registru real necesită criterii aprobate și ancore din sursele proiectului.

## Activare și acceptare în staging

1. Publică această revizie pe ramura de staging prin pipeline-ul Amplify existent, cu schema completă. `STAGING_BOOTSTRAP_PHASE=foundation` este doar pentru inițializarea unei ramuri noi, nu pentru această migrare a unei ramuri existente. Nu înlocui variabilele OpenAI.
2. După deploy-ul backendului, generează outputs pentru ramura respectivă și verifică existența `custom.eligibilityTables` și `custom.eligibilityComputeRoleArn`. Nu folosi outputs de producție pentru testele staging.
3. Atribuie ramurii staging rolul SSR generat. Exemplul PowerShell de mai jos este un pas de deployment **neexecutat** în acest task; nu schimbă variabilele de mediu:

   ```powershell
   npx ampx generate outputs --app-id d19mquq8thd1uj --branch staging --out-dir .amplify/staging
   $stagingOutputs = Get-Content -Raw -LiteralPath '.amplify/staging/amplify_outputs.json' | ConvertFrom-Json
   $eligibilityRoleArn = $stagingOutputs.custom.eligibilityComputeRoleArn
   if (-not $eligibilityRoleArn) { throw 'Rolul de eligibilitate lipseste din outputs.' }
   aws amplify update-branch --app-id d19mquq8thd1uj --branch-name staging --compute-role-arn $eligibilityRoleArn --profile raportarepeo --region eu-north-1 --query 'branch.{branchName:branchName,computeRoleArn:computeRoleArn}'
   ```

4. Verifică flagurile de eligibilitate existente în staging și buildul SSR cu outputs actualizate. Fără noile tabele/rol, evaluatorul răspunde explicit cu indisponibilitate; nu revine la o aprobare bazată pe date neverificate din browser.
5. Cu sesiune Admin, apelează backfill-ul paginat trimițând `{ "nextToken": null }`, apoi cursorul returnat până la `null`. Revizuiește lista `failed`, corectează asocierile ambigue și reia. Reimportă originalele PDF/DOCX pentru generații complete; un simplu `s3Key` trimis de client nu certifică originalul.
6. În panoul PM, creează criterii reale în schema `eligibility-rules-v2`. Fiecare proveniență trebuie să indice documentul, fragmentul și versiunea publicate. Publicarea respinge JSON invalid, conflicte, perioade invalide, ancore absente și date retroactive; pentru activare viitoare se introduce explicit data respectivă.
7. Execută matricea de acceptare de mai jos și păstrează numai ID-uri/hash-uri și rezultate de test, fără tokenuri ori conținut integral de document în raport.

| Scenariu staging | Rezultat de acceptare |
| --- | --- |
| Expert solicită direct `KnowledgeDocument`, `KnowledgeChunk`, `AiEligibilityRuleset` prin AppSync | Acces refuzat. Același Expert evaluează propriul livrabil prin resolverul server. |
| Expert schimbă `expertId`, proiectul sau ID-ul documentului cu unul neautorizat | 403; nu primește textul sau sursele altui expert. Fără sesiune: 401. |
| Expert/PM/Admin încearcă să modifice direct evaluări, dovezi sau decizii prin AppSync | Scriere refuzată. PM/Admin publică/decid numai prin rutele server autorizate. |
| Document salvat, original disponibil și registru publicat | `runId` persistat; GET pentru acel run confirmă rezultatul și contextul. Repetarea identică poate returna `reused`. |
| Se schimbă textul original, profilul, catalogul, regulile sau generația | Evaluarea veche nu mai este confirmată ca actuală; următoarea evaluare are altă cheie. |
| Document mai mare decât bugetul analizei sau pagină neprocesată | Limitarea este vizibilă; un criteriu obligatoriu nedovedit nu trece. |
| PM confirmă, respinge, cere clarificări sau aprobă o excepție | Decizie separată cu justificare, actor și dată; rezultatul AI original rămâne intact. |
| PM reîncadrează într-o SA/activitate permisă | Decizie salvată, evaluare nouă afișată; o eroare a reevaluării este raportată fără a pierde decizia. |
| Import repetat, import eșuat sau două importuri concurente | Fără duplicate; cititorul vede o singură generație validă. Generațiile anterioare rămân disponibile. |
| Regresii în aplicație | Verificare manuală `pending_classification`, salvare de activitate, pontaj și export, pe date staging. |

Promovarea în producție și acceptarea end-to-end rămân pași operaționali după aceste verificări. Documentul nu declară aceste verificări remote drept efectuate.
