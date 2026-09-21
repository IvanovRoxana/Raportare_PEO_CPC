# Verifică eligibilitate — execuție durabilă

POST-ul existent acceptă acum numai joburi asincrone. Autentifică, autorizează metadatele și scrie într-o singură tranzacție DynamoDB: rularea, jobul/outbox, rezervarea de deduplicare, cheia idempotentă a tentativei și referința de recuperare. Răspunde cu `202 { runId, executionStatus, stage }`. Nu descarcă originale și nu apelează AI.

DynamoDB Streams declanșează dispatcherul la crearea jobului. Acesta publică în SQS înainte să confirme publicarea în baza de date. Un duplicat este permis; pierderea jobului nu este. Un trigger EventBridge la un minut recuperează publicările ratate și lease-urile expirate prin indexul `eligibilityDispatchDue`.

Workerul procesează câte un mesaj, verifică utilizatorul curent prin Cognito AdminGetUser/AdminListGroupsForUser și reautorizează expertul/documentele. Nu stochează tokenul browserului. Rezultatul, dovezile și starea terminală se salvează atomic, condiționat de tokenul și termenul rezervării workerului. Un worker vechi nu poate salva după preluarea jobului de alt worker.

## Configurare pentru staging

Configurația și cheia OpenAI existente se păstrează. Nu este necesară generarea unei chei noi.

1. Publicați **aceeași cheie existentă** într-un parametru SSM SecureString accesibil workerului. `ELIGIBILITY_OPENAI_KEY_PARAMETER` indică numele parametrului; implicit `/peo/eligibility/openai-api-key`. Acest pas se face în mediul AWS autorizat, fără cheie în Git, comenzi afișate sau template CloudFormation. Dacă parametrul există deja, reutilizați-l. Pentru o cheie KMS proprie, setați `ELIGIBILITY_OPENAI_KMS_KEY_ARN`.
2. Asigurați în build aceleași `OPENAI_MODEL`, `OPENAI_ELIGIBILITY_MODEL`, `OPENAI_EMBEDDING_MODEL`, politica temporală și limitele de buget ca în configurația curentă. CDK transmite doar aceste valori nesensibile workerului. Cheia se citește de la SSM la execuție.
3. Rulați pipeline-ul Amplify pe Linux, cu schema completă (nu bootstrap `foundation`). PDF.js este instalat ca modul extern, inclusiv activele sale native pentru platforma de deploy. Bundlingul CDK trebuie validat în acest pipeline; un bundle produs pe Windows nu se promovează în Lambda Linux.
4. Păstrați `ELIGIBILITY_ASYNC_ENABLED=false` până când coada, workerul, triggerul de recuperare și permisiunile sunt verificate. Activați apoi `ELIGIBILITY_ASYNC_ENABLED=true` pentru acceptare, împreună cu flagurile existente ale funcției. Flagul este server-side. Nu există fallback către requestul AI sincron.
5. Conectați topicul SNS `eligibilityAsync.alertsTopicArn` la destinația operațională aprobată. Sunt definite alarme pentru DLQ, întârzierea cozii și erorile workerului/dispatcherului; topicul fără abonament nu trimite notificări unei persoane.

Nu s-a făcut deploy și nu s-a accesat sau copiat cheia de producție în timpul implementării locale.

## Limite și recuperare

- Worker: timeout Lambda 300 s; buget total al încercării 240 s; heartbeat 20 s; rezervare 90 s.
- SQS: vizibilitate 30 minute (șase ori timeoutul Lambda); lot de un mesaj; maximum trei workeri simultani; DLQ după cinci recepții nereușite la nivelul transportului.
- Maximum trei încercări reale de evaluare. Rate-limit, timeout și indisponibilitatea tranzitorie pot fi reluate. Revocarea accesului, documentele modificate, lipsa bugetului și rezultatele invalide nu sunt reluate automat.
- Joburile au un termen total de 30 minute. Un job expirat fără worker activ este marcat explicit `failed`; o rezervare activă nu este închisă doar fiindcă rularea are peste 180 s.
- Dezactivarea acceptării nu oprește workerii sau consultarea rezultatelor deja acceptate.
- Polling: interval de 2–10 s, timeout separat pe fiecare request; pierderea conexiunii nu produce verdict și nu marchează jobul eșuat.
- Recuperarea automată după refresh necesită ca formularul să restaureze identificatorii documentelor salvate. Documentele locale nesalvate nu pot fi reconstruite de server. Jobul deja acceptat rămâne totuși durabil.

## Scenarii obligatorii înainte de activarea în producție

Testele locale folosesc limite AWS simulate și modele fără apeluri reale. Verificările de mai jos cer staging:

1. Evaluare AI de peste 90 s: POST rapid, progres vizibil, finalizare prin polling.
2. Refresh cu documente salvate și pierderea răspunsului POST: aceeași rulare este recuperată prin lookup autorizat.
3. Dublu clic și mesaje SQS duplicate: o singură rezervare activă; rezultatul nu este suprascris.
4. Opriți workerul în timpul evaluării: lease-ul expiră, jobul este reluat, iar al treilea eșec devine terminal.
5. Blocați temporar publicarea SQS: outbox-ul rămâne recuperabil; după restabilire se publică.
6. Revocați accesul sau modificați hashul/titlul/sursa în timpul evaluării: salvarea unui verdict autoritar este respinsă.
7. Verificați PDF, DOCX, TXT și XLSX în pachetul Lambda Linux.
8. Verificați răspunsul neconcludent pentru citate inventate, versiune greșită, lipsa dovezilor și reguli în conflict; confirmați și cazurile eligibil/neeligibil.
9. Validați cu responsabilul regulilor un set real de rezultate de referință. Fixture-urile tehnice nu reprezintă validare de domeniu.

Logurile `[ELIGIBILITY_STAGE]`, `[ELIGIBILITY_COMPLETED]`, `[ELIGIBILITY_JOB_ATTEMPT_FAILED]` și `[ELIGIBILITY_DISPATCH_FAILED]` folosesc runId, etapă, durată și coduri. Nu includ documentele sau cheia API.

Referințe: [SQS/Lambda](https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-configure.html), [transactional outbox](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html).
