# Analiză de integrare: agentul operațional de eligibilitate PEO

Data: 17 septembrie 2026. Stare: recomandare tehnică; implementarea nu a fost începută în această analiză.

Document analizat: `Instructiuni_Codex_Agent_Eligibilitate_PEO_Operational.md`, versiunea 2.0, din Downloads. Instrucțiunile sale au fost evaluate ca specificație propusă. Cererea utilizatoarei a fost analiza și identificarea metodei optime de integrare.

## Recomandarea

Integrarea potrivită este consolidarea evaluatorului existent într-un serviciu server-side unic, cu instrumente de citire autorizate și validare deterministă înainte de salvare. Se păstrează Next.js, Amplify, biblioteca RAG, formularul Expert, istoricul și decizia PM. Agentul de redactare a activității rămâne separat.

Documentul este o bază bună de specificație funcțională și tehnică. Nu este suficientă includerea sa în prompt: majoritatea cerințelor privesc persistența, autorizarea, versiunile, interfața și operarea. Implementarea trebuie pornită de la codul local actual, care conține deja o parte importantă din infrastructura cerută.

## 1. Cum se include documentul în proiect

Propun următoarea organizare la adoptarea specificației:

| Loc propus | Conținut și rol |
| --- | --- |
| `docs/eligibility/operational-agent-spec.md` | Specificația de produs, cu versiune, statut de aprobare și delimitarea propunerilor față de cerințele acceptate. |
| `docs/eligibility/integration-plan.md` | Deciziile de arhitectură, componentele reutilizate și dependențele dintre livrări. Analiza de față poate sta la baza acestui fișier. |
| `docs/eligibility/acceptance-matrix.md` | Maparea ELG-01–ELG-28 la teste, dovezi de execuție și limitări. |
| `AGENTS.md` | O trimitere scurtă la specificație, aplicabilă lucrărilor de eligibilitate. Regulile generale ale repository-ului rămân aici. |
| Modulul server-side al agentului | Numai mandatul runtime relevant, derivat din §7.3, versionat și testat împreună cu schema de ieșire. |

Documentul integral nu se introduce în corpusul normativ RAG. El descrie cum trebuie construit software-ul și nu reprezintă o sursă aprobată de eligibilitate PEO. În RAG se publică documentele reale ale proiectului, cu proveniența și aprobările lor. Separarea previne folosirea unei instrucțiuni tehnice drept criteriu de eligibilitate.

În această analiză am adăugat numai prezentul raport; locațiile de mai sus sunt propuneri.

## 2. Baza efectiv verificată

- Branch local: `main`; HEAD: `44ec80a` — `Fix server PDF.js runtime packaging for reference imports`.
- Documentul citează commitul `2937f824a57532fd0fabaea769808446e6c97619`. Analiza nu presupune identitatea dintre acea revizie și workspace.
- Existau 38 de fișiere urmărite cu modificări, plus fișiere ne urmărite de Git, inclusiv resolverul, regulile și istoricul de eligibilitate. Aceste modificări au fost păstrate.
- jCodemunch a găsit repository-ul indexat, dar indexul din 16 septembrie nu reflecta toate fișierele și limitele actuale. Constatările de mai jos au fost confirmate prin citirea fișierelor locale.
- Versiuni instalate verificate: `ai` 6.0.191 și `@ai-sdk/openai` 3.0.65. Tipurile locale expun atât `generateText` cu instrumente și `stopWhen`, cât și `ToolLoopAgent`.
- Nu au fost inspectate starea live a AWS, documentele reale, regulile publicate sau configurarea curentă a deploymentului. Rapoartele anterioare din `outputs` nu constituie verificări noi.

## 3. Ce există și ce trebuie adaptat

| Componentă | Constatare din codul local | Recomandare |
| --- | --- | --- |
| `lib/eligibility-resolver.ts`, `eligibility-authorization.ts`, `eligibility-scope.ts` | Rezolvă identitatea, accesul și contextul; resolverul filtrează fragmentele prin `onlyPublishedChunks`. | Păstrare. Extindere controlată pentru documente draft și autorizare la fiecare instrument. |
| `lib/rag/index-generation.ts` | Publicarea generațiilor, reluarea, concurența și extragerea incompletă au teste existente. | Păstrare; integrarea trebuie să utilizeze acest circuit. |
| `lib/eligibility-rules.ts`, `eligibility-evaluation.ts` | Există registru executabil, proveniență, plan de dovezi și validări ale citatelor. | Adaptare cu versiune de schemă, fără reinterpretarea tacită a regulilor publicate. |
| `lib/eligibility-run-store.ts`, `eligibility-run-read.ts` | Există evaluări persistate, reutilizare, verificarea contextului și finalizare condiționată. | Extindere cu rezervare atomică la pornire, etape, erori și acoperire. |
| `app/api/ai/check-deliverable-eligibility/route.ts` | Conține aproape întreaga orchestrare și un singur apel de generare, fără instrumente. | Păstrarea endpointului; extragerea orchestrării într-un serviciu comun. |
| `app/api/eligibility/decisions/route.ts` | Decizia PM este separată; reîncadrarea importă direct handlerul `POST` al evaluatorului. | Apelarea serviciului comun din ambele rute, eliminând dependența dintre handlere. |
| `components/expert/activity-form.tsx`, `deliverable-item.tsx` | Există clasificare automată, verificare în formular și protecție față de răspunsuri întârziate. | Păstrare UX; introducerea identității persistente a draftului înainte de evaluare. |
| `components/pm/eligibility-decision-controls.tsx` | Există confirmare, respingere, clarificare, excepție și reîncadrare motivată. | Extindere cu versiunea dosarului și dovezile consultate, în zona PM existentă. |
| `lib/agents/activity-agent.ts` | Utilizează deja `governedGenerateText`, instrumente, `stepCountIs` și ieșire structurată. | Reutilizarea modelului tehnic de execuție; păstrarea mandatului de redactare separat. |
| `scripts/import-rag-documents.mjs` | Are `--dry-run`, metadate și import prin endpointul de indexare. | Extindere pentru manifest T0, ID-uri stabile și reconciliere; nu este necesar un importator complet separat. |

După migrare se retrag ramura de evaluare consultativă pe text trimis de browser, dependența de formulări textuale pentru completitudine și orchestrarea duplicată. Adaptoarele de istoric și fallbackurile de identitate/catalog se inventariază separat înainte de orice eliminare.

## 4. Diferențele importante față de document

**A. Documentele noi nu au încă traseul operațional cerut.** Resolverul caută ID-urile în `Deliverable`/`Document` și întoarce `null` dacă nu există. Ruta păstrează atunci textul primit de la client și marchează evaluarea neautoritativă. Este necesară înregistrarea documentului draft pe server, verificarea originalului și asocierea ulterioară la activitate fără schimbarea identității versiunii. Reutilizarea modelului `Document` trebuie verificată înainte de a adăuga un model nou.

**B. Limita de context nu poate fi depășită prin instrumente.** `lib/eligibility-assessment.ts:18` limitează textul inițial la 18.000 de caractere. Ruta nu transmite instrumente modelului. Dovezile aflate mai târziu în document nu pot fi investigate în acea execuție. În plus, finalizatorul identifică incompletitudinea prin expresii în `textScope` (`:220`), iar regulile folosesc separat `analysisComplete`: cele două mecanisme trebuie consolidate într-un contract structural.

**C. Originalul este reextras la rezolvarea contextului.** `lib/eligibility-originals.ts:30` citește S3 și extrage din nou PDF/DOCX; verificarea snapshotului apelează iar resolverul. Recomand persistența extragerii și a pozițiilor pe versiune de original și versiune de extractor. Schimbarea originalului invalidează extragerea; simpla repetare a verificării o reutilizează.

**D. Data regulilor este data execuției.** Ruta setează `evaluationAt = new Date().toISOString()` (`:127`) și o folosește pentru selectarea regulilor și aplicabilitate. Verificarea ulterioară a snapshotului folosește tot prezentul. Trebuie separate data/perioada activității, timpul evaluării și momentul la care sursa a devenit cunoscută/publicată. Politica pentru clarificări retroactive necesită decizie de conținut; nu poate fi rezolvată prin alegerea arbitrară a unei date.

**E. Aplicabilitatea nu include încă activitatea și tipul livrabilului.** Schema curentă din `lib/eligibility-rules.ts:8` acoperă proiect, rol, categorie și SA. Înainte de recalcularea regulilor după clasificare trebuie extins acest contract. Până atunci, recalcularea aceleiași liste nu rezolvă cerința documentului.

**F. Semantica este condiționată de termeni literali.** `semantic_evidence` verifică `requiredTerms` în citatele sursei și livrabilului (`lib/eligibility-rules.ts:97`). Se recomandă o versiune nouă de regulă care exprimă separat condiția literală și aprecierea semantică. Regulile curente se păstrează pentru istoricul lor; migrarea fiecărei reguli trebuie justificată și aprobată.

**G. Pornirea nu previne execuțiile concurente identice.** `findReusableEligibilityRun` caută doar rezultate finalizate, iar `startEligibilityRun` generează un UUID nou (`lib/eligibility-run-store.ts:11`). Două cereri identice pot porni două apeluri AI. Finalizarea este deja condiționată; lipsește rezervarea atomică după `evaluationKey`, cu expirare controlată și identitate a încercării.

**H. Guvernanța trebuie adaptată înaintea buclei cu mai mulți pași.** `normalizeUsage` citește `result.usage` (`lib/ai-governance.ts:205`); SDK-ul distinge consumul ultimului pas de `totalUsage`, consumul cumulat. Contoarele locale nu constituie un buget distribuit. Este necesară rezervare într-un mecanism partajat, contabilizare pe întreaga execuție și reconcilierea încercărilor eșuate. Semantica SDK este documentată în [Generating Text](https://ai-sdk.dev/docs/ai-sdk-core/generating-text).

**I. Verdictul și explicația pot rămâne nealiniate.** Ruta suprapune `criteriaResult` peste `assessment` (`:200`), fără să recompună rezumatul după verdictul final. Există și `normalizedScore: result.score` fără transformare (`lib/eligibility-assessment.ts:276`). Recomand un singur finalizator al rezultatului afișat, pornind de la constatările validate; scorul rămâne secundar și nu este etichetat drept normalizat fără o regulă reală.

**J. Invalidarea este mai largă decât contextul aplicabil.** Snapshotul include hashul întregului `ActivityCatalog` (`route.ts:168`). O schimbare fără legătură poate invalida alte evaluări. Se recomandă versiunea catalogului autorizat și a corpusului aplicabil, incluzând apariția unor surse relevante noi.

Acestea sunt constatări din codul local. Nu demonstrează ce cale este activă în producție și nici frecvența efectelor pe documentele reale.

## 5. Arhitectura propusă

```text
Formular Expert / reîncadrare PM
    → endpointurile existente
    → serviciu comun de evaluare
        → autentificare, documente draft/persistente și versiuni
        → context aplicabil + rezervare atomică a execuției/bugetului
        → agent cu instrumente de citire și limite cumulate
        → recalculare după încadrare, dacă se schimbă cerințele
        → validare dovezi, acoperire și snapshot final
        → persistență în istoricul existent
    → rezultat în formular și același runId în dosarul PM
```

Module noi propuse, cu responsabilități limitate:

- `lib/eligibility-service.ts`: orchestrarea comună, independentă de `NextResponse`.
- `lib/agents/eligibility-agent.ts`: mandatul evaluatorului și execuția AI.
- `lib/agents/eligibility-tools.ts`: inițial `readDeliverable`, `searchProjectEvidence`, `readReferenceDocument`, fiecare limitat la contextul autorizat.
- `lib/eligibility-coverage.ts`: registrul intervalelor efectiv furnizate modelului și verificarea acoperirii per cerință.

Numele sunt propuneri, nu fișiere deja implementate. Contractele și stocarea existente se extind aditiv, cu adaptor pentru rezultate vechi. Separarea acoperirii trebuie să exprime disponibilitatea originalului, completitudinea extragerii, intervalele consultate și suficiența probelor pentru fiecare criteriu.

Recomand folosirea inițială a `governedGenerateText` cu instrumente și oprire controlată, după corectarea guvernanței. Acest mecanism este deja folosit în proiect. `ToolLoopAgent` este disponibil în instalarea locală, dar adoptarea sa nu este necesară pentru această consolidare. [Documentația AI SDK](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling) descrie bucla prin `stopWhen`.

Se poate porni de la limitele propuse de 5 apeluri model și 10 execuții de instrumente, configurabile. Se rezervă capacitate pentru finalizare; atingerea limitei nu justifică un verdict pozitiv. Limitele de pași nu înlocuiesc plafoanele de cost, tokeni și timp. Modelul dedicat trebuie conectat efectiv în apel, snapshot, audit și verificarea reutilizării.

Pentru execuții lungi, implementarea trebuie să includă procesare durabilă în AWS. Alegerea concretă Lambda/SQS sau alt mecanism existent se face după inventarul infrastructurii și măsurarea duratei. Un timeout local de 55 de secunde nu dovedește capacitatea întregului traseu HTTP. Workerul și endpointul trebuie să apeleze același serviciu; un răspuns `202` cu `runId` este valid numai dacă execuția a fost preluată durabil.

## 6. Ordinea recomandată a livrărilor

| Livrare | Conținut | Dovada necesară pentru continuare |
| --- | --- | --- |
| 1. Stabilizarea bazei | Identificarea modificărilor locale existente; specificație versionată; contract de execuție, perioadă și compatibilitate. | Baseline reproductibil și maparea cerințelor la cod. |
| 2. Documente verificabile | Draft server-side, originale autorizate, extragere persistentă și localizări, legare la activitate. | Document nou evaluabil înainte de salvarea activității; accesul străin refuzat. |
| 3. Execuție controlată | Serviciu comun, rezervare atomică, bugete cumulate, audit corect și stări tehnice distincte. | Cereri concurente reutilizează execuția; consumul tuturor pașilor este urmărit. |
| 4. Agent și validare | Cele trei instrumente reale, acoperire, reguli versionate, aplicabilitate temporală și după încadrare, explicație finală coerentă. | Dovadă citită după limita inițială și acceptată de validator; cazurile negative rămân negative. |
| 5. Expert–PM–Admin | Integrarea rezultatului în formular, salvare cu același runId, decizii PM, administrare consolidată, manifest T0. | PM regăsește evaluarea și versiunile; importul și UI folosesc aceleași validări. |
| 6. Acceptanță și activare | Teste de integrare, date reprezentative, migrare verificată, durabilitate unde este necesară, monitorizare și revenire compatibilă. | Traseu real complet în mediul aplicației; dovezi și limite consemnate. |

Pregătirea surselor și aprobarea conținutului regulilor trebuie începute devreme. Ele pot fi pregătite în paralel cu dezvoltarea, fără a transforma propunerile AI în reguli publicate automat.

## 7. Clarificări de inclus în specificație înainte de implementare

1. **Unitatea evaluării:** set de documente, document principal, expert, SA, activitate și perioadă; definirea felului în care mai multe date ale aceleiași activități formează contexte distincte.
2. **Aplicabilitatea istorică:** politica aprobată pentru perioada raportării și clarificări ulterioare. Același contract trebuie folosit la pornire și la verificarea valabilității.
3. **Suficiența acoperirii:** reguli care necesită întregul document versus secțiuni determinate, cu metadate explicite. „Pasaj consultat” nu înseamnă automat „cerință dovedită”.
4. **Tipologia surselor:** înlocuirea graduală a presupunerilor fixe proiect/SA/fișă de post prin cerințe aprobate de surse; clarificările și actele adiționale trebuie să aibă identitate proprie.
5. **Politica pentru drafturi și documente comune:** retenție, atașarea evaluării la dosar și relații de acces; hashul comun nu acordă acces între experți.
6. **Migrarea și revenirea:** versiuni de schemă și adaptoare istorice; comportament explicit dacă o versiune veche a aplicației întâlnește date noi. Un simplu flag nu inversează o migrare incompatibilă.

Acestea nu necesită inventarea unor reguli materiale PEO. Deciziile de conținut aparțin persoanelor autorizate; componentele tehnice pot fi construite și testate cu date sintetice clar identificate.

## 8. Verificările efectuate

Am rulat testele existente pentru autoritate, evaluare, schema răspunsului, generații RAG și consum AI:

```powershell
& 'C:\Users\RoxanaIvanov\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test --experimental-strip-types tests/eligibility-authority.test.ts tests/eligibility-assessment.test.ts tests/eligibility-response-schema.test.ts tests/rag-index-generation.test.ts tests/ai-usage.test.ts
```

Rezultat: **46 teste trecute, 0 eșecuri, 0 omise**. A apărut avertismentul existent `MODULE_TYPELESS_PACKAGE_JSON`.

Aceste teste confirmă comportamentele locale deja acoperite; nu certifică îndeplinirea tuturor celor 28 de scenarii noi. De exemplu, testarea helperului de cost nu demonstrează contabilizarea corectă a unei execuții SDK cu mai mulți pași, iar testarea regulilor temporale nu demonstrează că ruta alege perioada activității.

Nu au fost rulate typecheck, lint sau build pentru această analiză documentară; nu a fost modificat codul aplicației. Nu au fost efectuate apeluri AI plătite, migrări, publicări sau teste cu sesiuni reale Expert/PM/Admin.

Prima implementare recomandată este un pachet coerent de contracte și documente draft autorizate, urmat de execuția controlată și instrumentele reale. Rezultatul urmărit rămâne același flux Expert–PM, cu o evaluare verificabilă și păstrată în dosar.
