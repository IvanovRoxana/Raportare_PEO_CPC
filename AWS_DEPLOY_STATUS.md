# Status AWS - RaportarePEO_CPC

Ultima actualizare: 2026-05-11

## Realizat

- AWS CLI autentificat cu profilul `raportarepeo`.
- Cont confirmat: `147885329053`.
- Rol confirmat: `AdministratorAccess`.
- Regiune: `eu-north-1`.
- CDK bootstrap reusit pentru `aws://147885329053/eu-north-1`.
- Amplify sandbox deploy reusit.
- Fisier generat: `amplify_outputs.json`.
- AppSync endpoint generat: `https://vfyiapouw5e35k7zhb3gdsgiji.appsync-api.eu-north-1.amazonaws.com/graphql`.
- Storage S3 generat pentru `peoRaportareFiles`.
- Cognito User Pool generat cu grupurile `admin`, `pm`, `expert`.
- `npm run build` trece cu succes.
- Aplicatia Next foloseste AWS direct.
- Login, sign-up si user menu sunt conectate la AWS Cognito.
- Hook-urile principale de date folosesc `lib/backend-store.ts`, cu AWS ca provider unic.
- `npm run build` trece dupa eliminarea completa a codului backend anterior.
- Server local pornit pentru test: `http://127.0.0.1:3000`.
- Amplify Hosting creat pentru frontend:
  - App ID: `d19mquq8thd1uj`
  - Branch: `main`
  - URL public: `https://main.d19mquq8thd1uj.amplifyapp.com/`
- Deploy static Amplify reusit:
  - Job: `4`
  - Status: `SUCCEED`
  - Verificat HTTP 200 pentru `/`, `/auth/login/`, `/expert/` si `/pm/`.

## Corectii facute in proiect

- Am eliminat dependenta `next/font/google`, ca build-ul sa nu depinda de acces la Google Fonts.
- Am adaugat `amplify/package.json` pentru rezolvarea corecta a importurilor ESM.
- Am corectat regulile duplicate de autorizare pentru `ReportStatus` si `ConcurrentProject`.
- Am reparat `totalHoursMonth` in calendarul expert.
- Am adaugat `lib/aws/client.ts`, `lib/aws/auth.ts`, `lib/aws-store.ts` si `lib/backend-store.ts`.
- Am actualizat `use-backend-data`, login, sign-up, user menu si pagina expert pentru backend AWS.
- Am eliminat codul, middleware-ul, rutele si dependentele vechi pentru backend-ul anterior.
- Am sters scripturile SQL vechi si lockfile-ul pnpm care nu mai era folosit.

## Urmatorul pas

1. Testare login in browser la `https://main.d19mquq8thd1uj.amplifyapp.com/auth/login/`.
2. Testare resetare parola pentru utilizatorii importati in Cognito.
3. Seed initial pentru catalog activitati si grupuri de lucru, daca lipsesc in dashboard.
4. Mutare upload livrabile catre S3.
5. Pentru functiile AI `/api/ai/...`, trecerea de la deploy static la deploy SSR/compute sau mutarea rutelor AI in Lambda.
