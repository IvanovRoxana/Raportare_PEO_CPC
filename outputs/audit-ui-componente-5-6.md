# Audit și reorganizare UI — componentele 5 și 6

Data: 17 septembrie 2026. Reper: diagrama „Arhitectura funcției de eligibilitate” furnizată de utilizator. Diagrama a fost tratată ca material de referință, nu ca instrucțiuni de execuție.

## Rezultat implementat local

- **Componenta 5:** PM → **AI + RAG / Knowledge** (`/pm?tab=knowledge`).
- **Componenta 6:** Admin → **Surse de date** (`/admin?tab=surse-date`).
- În fiecare centru există secțiuni interne, căutare fără diacritice pe desktop, selector compact pe mobil și adrese directe pentru secțiuni.
- Operațiile curente ale expertului și verificarea dosarelor PM continuă să consume aceleași date. Centralizarea privește administrarea/configurarea, nu eliminarea datelor necesare raportării.

## Constatări înainte de modificare

1. UI-ul PM vizibil avea „Categorii eligibilitate” și „Catalog eligibilitate”. Un al treilea tab, „AI RAG”, exista numai în vechiul dashboard ascuns prin CSS.
2. Editorul de catalog era montat și în „Acțiuni PM”, pe lângă tabul propriu.
3. Admin → „AI API” combina statusul tehnic, completarea fișelor de post, biblioteca RAG, importul referințelor, instrucțiunile AI și repararea metadatelor.
4. Instrucțiunile per expert aveau două puncte de editare: guvernanța PM și contextul AI din Admin.
5. Admin avea zece taburi principale, plus paginile separate `/admin/users` și `/admin/historical-import`.
6. Linkul spre `/pm?tab=eligibility-governance` nu controla selecția în workspace-ul PM vizibil.
7. Panoul lateral Admin afișa valori fixe pentru jurnalul de audit și starea serviciilor. Acestea nu reprezentau verificări în timp real.
8. `components/pm/ai-scripts-tab.tsx` este un editor vechi neconectat, cu salvare în localStorage. Nu este sursa prompturilor folosite de backend și nu a fost prezentat ca funcție activă.

## Componenta 5 — AI + RAG / Knowledge

| Element din diagramă | Localizare anterioară | Localizare nouă |
|---|---|---|
| Model AI | Configurare server; status generic în Admin; diagnostic agent în PM | PM → Reguli, model și instrucțiuni: modelul efectiv este afișat în rezultatul diagnosticului |
| Reguli eligibilitate | PM → Catalog eligibilitate; acces contextual din Acțiuni PM | PM → Reguli, model și instrucțiuni: draft, validare, publicare, versiuni și rollback |
| Fișă de post / job description | Admin → AI API → Context AI | PM → Surse și referințe: selectare expert și salvare fișă de post |
| Descriere oficială SA | Admin → Subactivități; surse „scop_sa” în Context AI | PM → Surse și referințe pentru documentele oficiale; PM → Catalog activități pentru încadrare |
| Catalog activități | Admin → Subactivități; PM → Categorii eligibilitate; Acțiuni PM | PM → Catalog activități pentru guvernanța eligibilității; administrarea registrului de bază rămâne în Admin |
| Livrabile de referință | Admin → AI API → import PDF și bibliotecă RAG | PM → Surse și referințe, inclusiv importul documentelor |
| Exemple / raportări aprobate | Admin → Context AI → tipuri de surse și bibliotecă | PM → Surse și referințe, cu aceleași metadate expert/proiect/SA/perioadă |
| Instrucțiuni per expert | PM → Catalog eligibilitate și editor duplicat în Admin | PM → Reguli, model și instrucțiuni, un singur editor |
| Instrucțiuni de sistem / scoring | Cod server și reguli versionate | PM → Reguli, model și instrucțiuni: diagnostic, explicație și editorul regulilor existente |
| Audit AI/RAG | Tab în dashboard-ul PM ascuns | PM → Audit AI / RAG, cu selecție lună/an vizibilă |

Modelul și promptul de sistem nu aveau un editor operațional conectat. Acestea rămân configurate pe server (`lib/openai.ts`, `lib/eligibility-assessment.ts`, `lib/agents/eligibility-agent.ts`); reorganizarea nu introduce un editor fictiv și nu mută secretele în browser.

## Componenta 6 — surse de date / baze de date

| Element din diagramă | Localizare anterioară | Secțiune în Admin → Surse de date |
|---|---|---|
| Utilizatori / experți | Tab Utilizatori și pagina users | Experți și profiluri; Conturi și roluri |
| Profiluri și roluri | Tab Roluri și pagina users | Conturi și roluri; Experți și profiluri |
| Proiecte | Tab Proiecte | Proiecte |
| Subactivități | Tab Subactivități | Subactivități și catalog |
| Catalog activități | Editor comun Admin/PM | Subactivități și catalog, modul Admin |
| Reguli eligibilitate persistate | Vizibile în editorul PM | Documente și rezultate: registru de seturi/versiuni; editarea semantică rămâne în PM |
| Documente / livrabile | Flux Expert, dosare PM și import istoric separat | Documente și rezultate; Import istoric |
| Rezultate verificare | Atașate documentelor în fluxurile operaționale | Documente și rezultate: status, scor și rezumat salvat pe document |
| Setări Admin | Categorii, semnături, perioade, Business Hub, roluri și AI în taburi separate | Secțiuni în același centru Surse de date |
| Stocare fișiere | Referințe S3 în documente și import istoric | Documente și rezultate: cheie de stocare și dimensiune; Import istoric |
| Index RAG / vector store | Amestecat cu biblioteca de conținut în Admin → AI API | Servicii și index RAG: inventar și completarea proiectului în metadate |

Nu au fost inventate console noi de administrare DynamoDB/S3. Registrul afișează datele disponibile prin serviciile existente; acesta nu este o verificare de sănătate a bucketului sau un inventar exhaustiv al infrastructurii AWS. Lista RAG folosește limita existentă de 500 de documente active.

## Navigare și acces

- Vechile taburi Admin sunt mapate în secțiunile noului centru. `ai` duce la infrastructură.
- `/admin/users` redirecționează spre Conturi și roluri; `/admin/historical-import` spre Import istoric.
- Vechile linkuri PM de eligibilitate/RAG deschid secțiunea corespunzătoare din Knowledge.
- Scurtătura de catalog din Acțiuni PM deschide centrul Knowledge, fără a monta încă un editor.
- Admin rămâne protejat de `AdminAccessGuard`. Întreținerea tehnică RAG (`PATCH` de reparare) rămâne Admin-only.
- Accesul PM la referințe folosește verificarea Cognito existentă și aceeași delimitare între PM extins și Expert/PM cu acces doar la propriile date. Profilul server este verificat pentru PM; simpla apariție a rolului PM în token nu anulează restricția profilului.
- Nu au fost schimbate schema Amplify, cheile SWR, mecanismul de merge/fallback sau fluxul „Verifică eligibilitate”.

## Verificare

- Suita completă: **943 teste trecute**, zero eșecuri; testele specifice de navigare/acces au fost reluate după întărirea verificării profilului PM.
- TypeScript: verificat fără erori după modificările finale.
- ESLint: zero erori; avertismentul preexistent pentru `prepareActivities`. Configurația existentă nu aplică ESLint fișierelor TypeScript/TSX; acestea au fost verificate prin TypeScript și teste.
- Cinci cereri locale către rutele de context/referințe/reparare au respins sesiunea invalidă cu HTTP 401.
- Verificare vizuală și interactivă a componentei comune de navigare pe desktop și la 390 px: selecție, URL, căutare fără diacritice și selector mobil. Pagina temporară folosea date demonstrative și a fost eliminată.
- Pagina Admin reală a confirmat blocarea accesului fără autentificare. Salvările și panourile populate cu date reale nu au fost testate în browser, deoarece sesiunea locală nu era autentificată.

Modificările sunt locale. Nu s-a făcut deploy și nu s-au modificat date în producție.
