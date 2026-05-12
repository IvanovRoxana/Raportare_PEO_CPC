# Plan Backend AWS pentru Raportare PEO

## Recomandare

Pentru aplicatia curenta, cea mai buna varianta Amazon este AWS Amplify Gen 2:

- AWS app name: `RaportarePEO_CPC`.
- AWS region: `eu-north-1` Europe (Stockholm).
- AWS application ARN: `arn:aws:resource-groups:eu-north-1:147885329053:group/RaportarePEO_CPC/0eez6e4ow3856oexs76t3b6e7r`.
- Auth: Amazon Cognito pentru login cu email si roluri `expert`, `pm`, `admin`.
- Data: AWS AppSync + DynamoDB, definite in TypeScript in `amplify/data/resource.ts`.
- Files: Amazon S3 prin Amplify Storage pentru livrabile, rapoarte si documente justificative.
- Hosting: optional AWS Amplify Hosting pentru aplicatia Next.js.

Aceasta varianta pastreaza proiectul aproape de structura actuala Next/React si evita administrarea manuala de servere.

## Ce am pregatit deja

- `amplify/backend.ts` conecteaza resursele principale.
- `amplify/auth/resource.ts` defineste login email si grupurile de acces.
- `amplify/data/resource.ts` modeleaza datele principale: experti, activitati, livrabile, grup tinta, catalog activitati, verificari, neconformitati, status raport si proiecte concurente.
- `amplify/storage/resource.ts` defineste spatiul de fisiere S3 pentru livrabile, rapoarte si asset-uri proiect.
- `.env.aws.example` documenteaza variabilele minime pentru modul AWS.

## Migrare catre AWS

1. Instalam toolchain-ul Node/npm si pachetele Amplify.
2. Rulam sandbox AWS pentru a genera `amplify_outputs.json`.
3. Folosim `lib/aws-store.ts` pentru metodele principale: `expertsService`, `activitiesService`, `verificationsService` etc.
4. Folosim `hooks/use-backend-data.ts` pentru hook-urile de date.
5. Mutam uploadul de livrabile din base64/localStorage in S3.
6. Importam datele existente: experti, catalog activitati, activitati, livrabile si verificari.
7. Testam fluxurile critice: login, adaugare activitate, calendar, upload document, raport RA, verificare PM.

## Date necesare de la contul AWS

- Regiunea AWS confirmata: `eu-north-1` Europe (Stockholm).
- Numele aplicatiei AWS confirmat: `RaportarePEO_CPC`.
- AWS application ARN confirmat: `arn:aws:resource-groups:eu-north-1:147885329053:group/RaportarePEO_CPC/0eez6e4ow3856oexs76t3b6e7r`.
- Acces la cont AWS cu permisiuni pentru Amplify, CloudFormation, Cognito, AppSync, DynamoDB, S3 si IAM.
- Lista utilizatorilor initiali si rolurile lor: expert, PM, admin.
- Decizie pentru hosting: Amplify Hosting sau pastram frontend-ul separat si folosim doar backend AWS.

## Observatii importante

- Cheile OpenAI sau alte secrete nu trebuie salvate in browser sau in tabele publice. Pentru productie le vom pune in variabile server-side sau AWS Secrets Manager.
- Livrabilele trebuie stocate in S3, nu ca base64 in baza de date.
- Pentru protectia datelor, expertii trebuie sa vada doar propriile activitati, iar PM/admin trebuie sa poata vedea/verifica tot.
