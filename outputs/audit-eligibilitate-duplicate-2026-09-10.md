**Audit: eligibilitatea livrabilelor și detectarea duplicatelor — 10 septembrie 2026**

Notă: acesta este auditul inițial, anterior remedierilor. Implementarea ulterioară este descrisă în `eligibilitate-implementare-2026-09-10.md`; referințele de linii de mai jos descriu versiunea auditată.

Am verificat codul local și schimbările de azi: `e0fb7a3` (titluri/eligibilitate), `5987b6c` (duplicate), `481a1a9` (text persistat). Nu am modificat codul aplicației. Modificarea existentă în dashboardul financiar a fost păstrată.

**Concluzie:** nu am identificat o deteriorare generală a arhitecturii Next.js + Amplify. Există două regresii în validarea titlului introdusă azi și o problemă anterioară care împiedică reîncercarea după eroarea din captură. Verificarea actuală nu acoperă integral cerința de a consulta documentele proiectului și apoi întregul livrabil.

**Constatări prioritare**

1. **P1 — Eroarea tehnică ascunde butonul de reîncercare.** `hasReusableEligibilityCheck` acceptă orice rezultat existent care nu este clasificat textual drept „text insuficient”. Rezultatul `Neconcludent / Eroare: Failed to fetch` îndeplinește această condiție. Interfața ascunde apoi butonul, deși recomandă reîncercarea. Am executat helperul real din sursă cu exact mesajele din această ramură: `isTextInsufficient=false`, `hasReusableEligibilityCheck=true`. Aceasta explică persistența blocajului din captură, dar nu originea primei erori de rețea. Linia de reutilizare datează din 31 august (`6d1570eb`). Corecția necesară: erorile de transport, execuțiile în curs și verificările nereușite trebuie separate de rezultatele finalizate; reîncercarea trebuie să rămână disponibilă.

   Referințe: `components/expert/deliverable-item.tsx:261`, `:1755`, `:1908`, `:1965`.

2. **P1 — Un titlu corect poate fi respins dacă fișierul poartă același nume. Regresie de azi.** Validarea găsește titlul în text, dar o verificare ulterioară îl respinge deoarece seamănă cu numele fișierului. Reproducere: titlul „Strategie de implementare si dezvoltare a Business Hub-ului” apare efectiv în text; fișierul este denumit identic, cu extensia `.docx`, ori folosește underscore între cuvinte. Validatorul returnează potrivire, însă noua condiție blochează eligibilitatea. Condiția se aplică și după `admin_override`. Corecția necesară: potrivirea demonstrată în document și derogarea administratorului trebuie respectate; numele fișierului nu poate invalida singur dovada din conținut.

   Referințe: `components/expert/deliverable-item.tsx:323`, `:336`; `lib/title-suggestion.ts:317`.

3. **P1 — Verificarea titlului poate opri recuperarea textului. Regresie de azi.** Pentru un livrabil salvat cu titlu declarat și cheie S3, dar fără text extras, noua verificare întoarce `extraction_failed` înainte ca fluxul să ajungă la descărcarea și extragerea textului. Mecanismul de recuperare există, dar nu mai este accesibil în acest scenariu. Corecția necesară: recuperarea textului trebuie încercată înainte de validarea care depinde de acel text. Scenariul a fost verificat prin executarea helperului real din fișier.

   Referințe: `components/expert/deliverable-item.tsx:328`, `:1771`, `:1820`.

4. **Lacună față de comportamentul cerut — eligibilitatea nu consultă documentele proiectului prin RAG.** Ruta primește din formular catalogul, activitatea selectată, subactivitatea, descrierea, obiectivele, beneficiarii, rezultatele, livrabilele și indicatorii. Aceste date sunt introduse în prompt. Nu există însă o interogare a bazei documentare a proiectului în această rută. Funcțiile de recuperare a contextului proiectului și a scopului subactivității există în ruta separată pentru descrierea asistată. Schimbările de azi nu au eliminat o astfel de integrare din ruta eligibilității.

   Referințe: `app/api/ai/check-deliverable-eligibility/route.ts:106`, `:227`, `:279`; contrast cu `app/api/ai/suggest-activity-from-deliverables/route.ts:87`.

5. **P2 — Analiza documentului este parțială și acest lucru nu este întotdeauna explicit.** Formularul și normalizarea serverului păstrează maximum 12.000 de caractere pentru fiecare livrabil, apoi promptul grupează maximum 18.000 de caractere, inclusiv etichetele. Documentele secundare pot rămâne doar parțial în prompt ori pot fi omise când bugetul este consumat. `documentsRead` enumeră totuși documentele normalizate, nu fragmentele care au încăput efectiv în prompt. Datele despre activitățile grupului sunt trimise în cerere, dar promptul folosește numai numărul acestora. Nu este garantată citirea integrală a documentelor sau a descrierilor tuturor zilelor din grup.

   Referințe: `components/expert/deliverable-item.tsx:240`; `lib/deliverable-eligibility.ts:461`, `:698`; `app/api/ai/check-deliverable-eligibility/route.ts:181`, `:195`, `:274`.

6. **P2 — Diagnosticul erorii nu identifică etapa eșuată.** Același `try/catch` include recuperarea textului din toate livrabilele și cererea de evaluare. Un eșec la un document secundar respinge `Promise.all` și oprește evaluarea grupului. Atât descărcarea S3, cât și POST-ul pot ajunge la mesajul generic din captură. Scorul 0 este atribuit de codul de eroare, nu este un scor produs de evaluarea documentului. Nu există în acest flux un timeout explicit al cererii și nici un identificator al etapei eșuate în rezultatul afișat.

   Referințe: `components/expert/deliverable-item.tsx:162`, `:1816`, `:1830`, `:1908`, `:2101`.

**Ce citesc și fac mecanismele actuale**

| Etapă | Comportament actual |
| --- | --- |
| Citire livrabil | Text extras în browser, cu recuperare din fișierul local/S3 dacă este insuficient și dacă validările anterioare permit continuarea. |
| Context oficial | Repere din catalog transmise de formular; maximum 12 activități candidate selectate pe categorie și relevanță. |
| Documentele proiectului | Nu sunt recuperate prin RAG în ruta eligibilității. |
| Evaluare | `governedGenerateText`, schemă de răspuns structurată, reguli specifice unor tipuri de livrabile și audit semantic/scor normalizat. |
| Eroare tehnică | `neconcludent`, scor 0 și mesaj generic; rezultatul poate ascunde butonul de reîncercare. |
| Salvare | Separată de evaluare; include verificările și metadatele pentru duplicate. |

**Auditul detectării duplicatelor**

Există două mecanisme distincte, care nu reprezintă o evaluare AI de similitudine semantică:

- **Avertizarea de document duplicat:** egalitate SHA-256 a fișierului, egalitate a hashului textului normalizat al primei pagini, egalitate a titlului normalizat sau egalitate a amprentei de conținut. Amprenta de conținut folosește primele 500 de caractere normalizate din prima pagină/text. Etichetele „titlu similar” și „conținut similar” ascund comparații de egalitate, fără scor de similitudine. Normalizarea elimină diferențe de majuscule, diacritice și punctuație. Dimensiunea și tipul MIME sunt primite de matcher, dar nu participă la aceste comparații. UI ignoră fotografiile și compară cu documentele disponibile în memorie, inclusiv cele ale colegilor. La salvarea metadatelor, backendul caută după aceleași câmpuri și înregistrează un semnal/audit; nu refuză automat crearea documentului.
- **Verificarea lunară:** caută prima repetare a unei semnături pentru același expert și aceeași lună. Semnătura alege un singur identificator, în ordinea documentId, hash fișier, hash prima pagină, amprentă text, nume+dimensiune+tip. Pentru un upload proaspăt cu `fileData`, documentId este ignorat. Formularul poate propune folosirea activității existente și asocierea zilelor, dacă activitățile sunt compatibile. Această regulă nu este apelată de butonul de eligibilitate.

Referințe: `lib/document-sharing.ts:341`; `components/expert/activity-form.tsx:981`, `:2114`; `lib/aws-store.ts:1076`, `:1115`; `lib/deliverable-deduplication.ts:53`, `:150`.

Probleme confirmate în detectare, afișare și legătura cu eligibilitatea:

- **P1 — Reîncărcarea aceluiași fișier poate ocoli verificarea lunară.** Un livrabil persistat cu `documentId=doc_old` și hash H are semnătura `document:doc_old`; reîncărcarea acelorași octeți cu `fileData` are semnătura `file_hash:H`. Funcția compară o singură semnătură și returnează `null`, deși hashul este identic și expertul/luna sunt aceleași. Două documentId distincte ocolesc comparația și când ambele livrabile nu mai au `fileData`. Reproducere executată cu helperul real. UI poate afișa în continuare avertizarea separată după hash, dar dialogul lunar nu este declanșat. Backendul folosește același helper. Referințe: `lib/deliverable-deduplication.ts:55`, `:163`; `lib/aws-store.ts:1892`.
- **P2 — Simpla amprentare este tratată ca risc de duplicat la calcularea scorului.** Auditul semantic selectează toate documentele cu un `duplicateStatus` nevid, inclusiv `fingerprinted`, care înseamnă doar că amprenta a fost calculată. Rubrica de duplicate scade de la 5/5 la 2/5 și marchează avertizare chiar fără un document duplicat identificat. Acest lucru poate reduce scorul normalizat; nu produce însă eroarea de rețea și nu schimbă direct statutul AI. Referințe: `lib/deliverable-eligibility.ts:596`, `:664`; `components/expert/deliverable-item.tsx:225`.

- **P2 — Nu este prioritizată potrivirea cea mai puternică în UI.** Matcherul păstrează ordinea documentelor, iar formularul ia primul rezultat. Am reprodus un caz în care o potrivire numai după titlu apare înaintea unui fișier identic: UI alege avertizarea slabă și referința greșită, deși există dovada de fișier identic. Referințe: `lib/document-sharing.ts:345`; `components/expert/activity-form.tsx:1010`.
- **P2 — Avertizările persistate nu sunt curățate când dispare potrivirea.** Efectul actual completează `possibleDuplicateOfDocumentId` și `duplicateStatus`, dar lasă valorile vechi dacă documentul nu mai are candidat. Cardul poate continua să afișeze o avertizare din metadatele rămase. Referințe: `components/expert/activity-form.tsx:1035`; `components/expert/deliverable-item.tsx:1141`.

**Impactul schimbărilor de azi și verificări**

- Ruta AI, RAG, schema backend și configurarea Amplify SSR nu au fost schimbate de cele trei commituri auditate.
- Limitarea persistării la 12.000 de caractere pentru text și 5.000 pentru prima pagină este nouă. Limita de 12.000 de caractere din analiza eligibilității exista deja. Această schimbare nu dovedește cauza erorii `Failed to fetch`.
- Căutarea duplicatelor la salvare poate efectua acum până la patru liste paginate consecutive. Aceasta poate crește latența salvării; nu explică direct eșecul rutei de eligibilitate.
- `tsc --noEmit --incremental false`: trecut.
- Șase suite relevante: **143 teste trecute, 2 eșuate**. Suite: `aws-deliverable-crud-contract`, `document-sharing`, `activity-form-duplicate-dialog`, `deliverable-eligibility`, `title-suggestion`, `activity-edit`. Cele două eșecuri sunt așteptări pentru textul vechi al mesajului de titlu, la `tests/title-suggestion.test.ts:126` și `:152`.
- Reproduceri locale suplimentare: titlu valid respins, recuperare text blocată, eroare tehnică reutilizată și candidat duplicat slab ales înaintea celui exact.
- ESLint exclude explicit fișierele `.ts` și `.tsx`; verificarea lui nu oferă acoperire pentru fișierele analizate aici.
- Nu am efectuat apeluri AI reale. Sesiunea browser în care apare eroarea nu este conectată, iar jurnalele locale disponibile sunt din iulie. Originea primei cereri eșuate nu poate fi atribuită sigur S3, rețelei sau rutei AI pe baza capturii.

**Ordinea recomandată a remedierilor**

1. Separarea stării tehnice de verdict, păstrarea butonului de reîncercare și afișarea etapei eșuate.
2. Corectarea validării titlului și executarea recuperării textului înaintea validărilor dependente de text.
3. Conectarea eligibilității la documentele oficiale ale proiectului și la contextul subactivității, folosind mecanismele existente de recuperare și autorizare.
4. Analiză pe fragmente pentru documentele lungi și audit care enumeră exact sursele și porțiunile efectiv folosite.
5. Compararea consecventă a identității și hashului pentru duplicatele lunare, prioritizarea/curățarea avertizărilor și excluderea stării `fingerprinted` din penalizarea de eligibilitate.
