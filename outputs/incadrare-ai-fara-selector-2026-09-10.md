# Încadrarea activității fără selector manual

## Fluxul standard

Expertul selectează SA și încarcă livrabilul. Verificarea existentă citește textul extras integral și compară activitățile din catalogul autorizat pentru categoria expertului. Formularul afișează încadrarea, fără să solicite alegerea unei activități din listă.

Încadrarea se aplică automat numai pentru o activitate validă din SA curentă, cu încredere ridicată, motivare, rezumate susținute de citate și extragere completă. Catalogul indisponibil, documentele parțiale și încrederea redusă nu permit atribuirea automată. O altă SA necesită confirmarea expertului și reevaluare în contextul confirmat.

Încadrarea și eligibilitatea sunt decizii distincte. Un document poate aparține clar unei activități și totuși să fie neeligibil ori neconcludent. Salvarea încadrării nu schimbă verdictul, nu mărește scorul și nu reprezintă aprobarea PM. Lipsa surselor oficiale continuă să împiedice confirmarea eligibilității.

## Ciorne și compatibilitate

Când nu există o încadrare sigură, se salvează `Activity.status = draft`, `activityType = pending_classification`, titlul „Încadrare în așteptare” și fără `catalogActivityId`. Markerul folosește câmpurile existente; nu necesită migrare Amplify. Activitățile istorice fără ID de catalog își păstrează compatibilitatea și nu sunt transformate implicit în ciorne neîncadrate.

Orele și datele rămân în calendar. Transmiterea/aprobarea lunii și exportul final cer rezolvarea încadrării. Ciornele sunt accesibile PM inclusiv când documentul urmează să fie încărcat. Două ciorne neîncadrate nu sunt reunite pe baza titlului comun; o serie explicită își păstrează identitatea.

La editare, o reevaluare eșuată păstrează încadrarea existentă. Schimbarea SA sau a dovezilor documentare invalidează contextul analizei. Fluxurile speciale pentru evenimente, GDPR, Business Hub și concedii își păstrează regulile proprii.

Modulul de duplicate păstrează continuarea explicită a unei activități existente. Această continuare poate prelua încadrarea sursei când toate documentele coincid prin ID/hash și sursa aparține expertului, lunii, proiectului și catalogului permis. O schimbare SA este anunțată înaintea confirmării. Similitudinea titlului sau a copertei nu justifică această preluare.

## Raportare și corecții PM

Raportarea primește în continuare câmpurile canonice din Activity: SA, ID de catalog, tip și titlu. Nu folosește propunerea AI ca înlocuitor implicit al acestor câmpuri.

Actualizarea încadrării sincronizează blocurile de raportare asociate și invalidează cache-ul acestora. Textul generat pe vechea încadrare este invalidat și poate fi refăcut determinist din datele curente. Alocările de ore se păstrează; corectarea unei zile nu schimbă implicit încadrarea celorlalte zile. Un bloc cu încadrări incompatibile este semnalat pentru reconciliere, iar exportul este blocat.

Blocurile existente sunt marcate pentru verificare înaintea scrierii noii încadrări, inclusiv pentru înregistrări istorice fără ID de catalog. Reluarea unei salvări parțiale completează legăturile lipsă fără recrearea blocului. Înregistrările create de PM preiau proprietarul Cognito existent al sursei/blocului, pentru a păstra accesul expertului. Grupurile lunare COM cu mai multe activități rămân acceptate în aceeași SA.

Corectarea încadrării de către PM nu aprobă automat eligibilitatea livrabilului. Dacă analiza veche privea altă activitate, este necesară o reevaluare în noul context.

## Limitele verificării

Verificările locale acoperă regulile de încadrare, ciornele, grupurile, sincronizarea și blocajele de raportare. Testarea autentificată a întregului flux cu AppSync, documente reale și modelul AI în mediul publicat rămâne necesară. Nu au fost schimbate modelul, cheile, schema Amplify sau configurația de găzduire.

Protecțiile de scriere sunt în serviciile aplicației; nu reprezintă reguli noi la nivelul schemei AppSync. Modificările din zona financiară și Outlook realizate separat în timpul lucrului nu fac parte din această intervenție.

Verificare finală locală: TypeScript fără erori; ESLint fără erori, cu avertismentul existent `prepareActivities`; `git diff --check` fără probleme. Suita completă: 841 teste, 839 trecute, 2 eșecuri preexistente în `financial-hr-validation.test.ts`. Testele noi acoperă inclusiv orchestrarea reală a sincronizării cu modele AppSync simulate, eșecul creării unei legături urmat de reluare, proprietarul înregistrărilor și păstrarea orelor. Nicio cerere către serviciile externe nu este executată de aceste teste.
