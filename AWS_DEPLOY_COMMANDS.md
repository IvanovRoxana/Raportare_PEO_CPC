# Comenzi deploy AWS - RaportarePEO_CPC

Aplicatie AWS:

- Name: `RaportarePEO_CPC`
- Region: `eu-north-1`
- Application ARN: `arn:aws:resource-groups:eu-north-1:147885329053:group/RaportarePEO_CPC/0eez6e4ow3856oexs76t3b6e7r`

## 1. Verificare instalari

Deschide un PowerShell nou dupa instalarea Node.js si AWS CLI, apoi ruleaza:

```powershell
node -v
npm -v
aws --version
```

Daca `npm` sau `aws` nu sunt recunoscute, instalarea nu este completa sau PowerShell trebuie redeschis.

## 2. Configurare AWS CLI

Varianta recomandata, daca ai AWS IAM Identity Center / SSO:

```powershell
aws configure sso --profile raportarepeo
```

Valori recomandate:

- profile name: `raportarepeo`
- default region: `eu-north-1`
- output format: `json`

Apoi:

```powershell
aws sso login --profile raportarepeo
aws sts get-caller-identity --profile raportarepeo
```

Alternativa, daca ai primit Access Key si Secret Access Key:

```powershell
aws configure --profile raportarepeo
```

Nu salva chei AWS in fisierele proiectului si nu le trimite in chat.

## 3. Instalare dependinte proiect

```powershell
cd "C:\Users\RoxanaIvanov\OneDrive - Confederatia Concordia\Documents\New project\Raportare_PEO_best"
npm install
npm add aws-amplify @aws-amplify/adapter-nextjs
npm add --save-dev @aws-amplify/backend@latest @aws-amplify/backend-cli@latest typescript
```

## 4. Pornire backend sandbox

```powershell
$env:AWS_PROFILE="raportarepeo"
$env:AWS_REGION="eu-north-1"
npx ampx sandbox
```

Rezultatul asteptat:

- se creeaza resurse AWS pentru backend;
- apare/este actualizat fisierul `amplify_outputs.json`;
- backend-ul poate fi conectat la aplicatia Next.js.

## 5. Pornire frontend local

Intr-un al doilea PowerShell:

```powershell
cd "C:\Users\RoxanaIvanov\OneDrive - Confederatia Concordia\Documents\New project\Raportare_PEO_best"
npm run dev
```

Aplicatia va porni de obicei la `http://localhost:3000`.
