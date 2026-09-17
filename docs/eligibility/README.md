# Agent de eligibilitate PEO — integrare locală

Implementare: 17 septembrie 2026. Configurarea OpenAI existentă din AWS este păstrată. Nu au fost modificate chei, secrete sau flaguri în AWS și nu s-au efectuat apeluri AI plătite.

Documentul utilizatorului este păstrat în [specificatie-sursa.md](specificatie-sursa.md) ca specificație de produs, nu ca instrucțiuni care autorizează automat publicări, migrări ori modificări de reguli. Analiza inițială este în [analiza de integrare](../../outputs/analiza-integrare-agent-eligibilitate-operational.md).

## Flux implementat

Butonul existent din formular apelează același endpoint. Ruta folosește serviciul comun `lib/eligibility-service.ts`, utilizat și la reevaluarea din PM. Originalele noi se încarcă înainte de evaluare, într-o zonă S3 privată, prin URL semnat pentru un singur PUT. Identitatea, proprietarul, proiectul și hashul sunt verificate pe server. Salvarea activității reutilizează originalul și păstrează `runId`.

Agentul folosește SDK-ul și guvernanța AI existente. Instrumentele sunt de citire: `readDeliverable`, `searchProjectEvidence`, `readReferenceDocument`, `getAllowedActivityContext`, `listRelatedDeliverables`. Căutarea suplimentară este lexicală în corpusul publicat și autorizat; recuperarea inițială reutilizează mecanismul RAG existent. Exemplele istorice nu devin surse normative.

Un registru urmărește intervalele de caractere furnizate modelului. Intervalele suprapuse sunt numărate o singură dată. Completitudinea extragerii este distinctă de completitudinea consultării. Citatele sunt verificate în intervalele efectiv consultate. Aceste localizări sunt în textul extras; nu sunt prezentate ca pagini PDF sau paragrafe DOCX.

Cerințele v2 își păstrează operatorii. Schema v3 permite aplicabilitate după activitate/tip de livrabil și evaluare semantică fără termeni literali obligatorii. Publicarea este în continuare o acțiune PM/Admin validată. Dacă încadrarea schimbă cerințele, evaluarea se reface în limita aceluiași buget. Rezumatul, lista de verificări și recomandările finale sunt construite după validarea constatărilor.

Snapshotul include documentele, contextul expertului, catalogul autorizat, sursele, regulile, perioada, modelul și limitele. Documentele salvate sunt legate de evaluare prin manifeste; modificările invalidează rezultatul. Un run poate fi legat de mai multe activități/date. Decizia PM rămâne separată și este păstrată dacă reevaluarea eșuează.

## Execuție și configurare

`OPENAI_ELIGIBILITY_MODEL` este opțional; în absența lui se utilizează modelul existent al aplicației, prin aceeași configurare OpenAI. Nu este necesară o cheie nouă.

| Variabilă opțională | Implicit | Limită maximă |
| --- | ---: | ---: |
| ELIGIBILITY_MAX_MODEL_CALLS | 5 | 10 |
| ELIGIBILITY_MAX_TOOL_CALLS | 10 | 30 |
| ELIGIBILITY_MAX_TOKENS | 120000 | 500000 |
| ELIGIBILITY_TIMEOUT_MS | 50000 | 55000 |
| ELIGIBILITY_MAX_COST_USD | 1 | 10 |
| ELIGIBILITY_MAX_CONCURRENT | 3 | 10 |

Bugetele zilnice/lunare folosesc configurația `AI_DAILY_COST_LIMIT_USD` / `AI_MONTHLY_COST_LIMIT_USD`. Rezervările distribuite sunt per proiect, în tabelul privat `EligibilityRuntime`. Rezervarea unei execuții identice și rezervarea costului/concurenței sunt condiționate atomic în DynamoDB. Consumul cunoscut se reconciliază la final; o execuție întreruptă cu consum necunoscut păstrează conservator rezervarea. Costul este estimat cu tarifele configurate în aplicație, nu reprezintă factura furnizorului.

`ELIGIBILITY_RULES_TIME_POLICY=evaluation_time` păstrează comportamentul existent. Politica opțională `activity_date` necesită date explicite și refuză grupurile care traversează cerințe diferite. Schimbarea acestei politici necesită o decizie de proiect; implementarea nu inventează reguli retroactive.

Execuția curentă este sincronă, cu limită de timp și oprire explicită. O cerere identică în curs primește `409 ELIGIBILITY_IN_PROGRESS` și runId-ul existent; formularul urmărește acea execuție. Nu există un worker durabil, iar răspunsul nu pretinde că evaluarea va continua după oprirea procesului HTTP. Un run rămas pending după 180 secunde este afișat ca întrerupt. Originalul poate fi salvat și evaluarea poate fi reluată.

## Import T0 prin infrastructura existentă

Scriptul existent acceptă acum un manifest JSON, cu versiunea `1`, un `id` stabil și lista `sources`. Fiecare sursă are `id`, `file` relativ la manifest, `sha256`, `title` și una sau mai multe `mappings`. Fiecare asociere are `id`, `projectCode`, `sourceType` și, după caz, `category`, `roleId`, `expertId`, `saCode`, `approvalStatus`.

```powershell
node scripts/import-rag-documents.mjs --manifest C:\surse\manifest.json --dry-run
```

Comanda verifică hashurile, extragerea și asocierile fără apeluri de model sau scrieri AWS. Importul efectiv folosește același script și endpointul existent `/api/admin/rag/index-document`, cu autentificarea deja prevăzută. Identitatea sursei este stabilă la rerulare; hashul schimbat produce o versiune nouă prin mecanismul existent. Manifestul și hashul său sunt păstrate în metadatele de ingestie. Sursele reale și asocierile lor nu au fost inventate sau importate în această implementare.

## Verificare și activare

Verificările locale acoperă citirea după limita inițială, acoperirea, accesul revocat la instrumente inclusiv în cache, versiunile surselor, citatele inventate/neconsultate, criteriile semantice v3, perioada, consumul cumulat, modificarea documentelor salvate și manifestul T0. Comenzile de verificare sunt cele din `AGENTS.md`: testele Node, TypeScript, ESLint și buildul Next.js.

Rezultate locale la 17 septembrie 2026: **939 teste trecute**, fără eșecuri; după ultima ajustare a încadrării și acoperirii, încă **95 de teste relevante trecute**. `tsc --noEmit` și buildul de producție `npm run build` au trecut. ESLint nu raportează erori; rămâne avertismentul existent `prepareActivities` din `scripts/prepare-reference-data.mjs`. Configurația ESLint existentă exclude fișierele TS/TSX; acestea sunt verificate de TypeScript și teste. Buildul a emis avertismente de cache Webpack, fără a împiedica finalizarea. `git diff --check` a trecut. Copia specificației sursă are același SHA-256 ca fișierul furnizat.

Pentru activare în mediul aplicației sunt necesare:

1. Publicarea backendului Amplify, inclusiv `EligibilityRuntime`, câmpurile aditive ale evaluării, permisiunile S3 private și asocierea rolului SSR; apoi frontendul, cu aceleași secrete AWS.
2. Verificarea surselor reale și publicarea cerințelor aprobate, folosind diagnosticul PM și importul existent. Nu se activează automat flagurile.
3. Teste cu sesiuni reale Expert/PM/Admin: upload semnat și CORS, salvare/descărcare, document comun, modificare/revocare, rezervări concurente DynamoDB, decizie PM și consum AI în audit.
4. Măsurarea duratei pe dosare reprezentative în traseul HTTP AWS. Dacă bugetul de timp nu ajunge, integrarea unui worker durabil care apelează serviciul comun precedă activarea pentru acele dosare.

Aceste verificări live nu sunt înlocuite de testele locale. Nu există în această livrare worker/coadă, propuneri AI de reguli în editorul PM, localizări exacte pagină/paragraf sau o politică automată de ștergere a drafturilor. Tipologia normativă rămâne cea existentă; clarificările și actele adiționale necesită o extensie și o politică de autoritate aprobate. Implementarea oferă fluxul local al agentului și bazele de control; nu certifică realizarea integrală a tuturor scenariilor operaționale din specificația sursă.
