# Mediu Amplify staging

Mediul staging are frontend, AppSync/DynamoDB, Cognito si Storage separate de main.
Nu reutiliza amplify_outputs.json din radacina pentru operatii de seed.

## Variabile Amplify pentru ramura staging

Configureaza in Amplify Hosting, exclusiv pe ramura staging:

    APP_ENV=staging
    NEXT_PUBLIC_APP_ENV=staging
    NEXT_PUBLIC_ENABLE_FINANCIAL_TIMESHEETS=true
    NEXT_PUBLIC_ENABLE_FINANCIAL_LEAVE=true
    ACTIVITY_AUTOFILL_RAG_ENABLED=false
    ACTIVITY_AUTOFILL_RAG_AUDIT_ENABLED=false
    ENABLE_DELIVERABLE_ELIGIBILITY_CHECK=false

Nu copia chei OpenAI, tokenuri de import sau credentiale de sincronizare Cognito daca nu sunt
necesare unui test aprobat.

## Generarea configuratiei locale staging

    npx ampx generate outputs --app-id d19mquq8thd1uj --branch staging --out-dir .amplify/staging

Fisierul .amplify/staging/amplify_outputs.json nu se comite.

## Seed controlat

    $env:APP_ENV = "staging"
    npm run seed:staging -- -DryRun
    npm run seed:staging

Seed-ul:

- cere exact mediul staging;
- compara endpoint-ul cu productia;
- identifica API ID-ul din URL-ul AppSync;
- scrie numai in tabelele care contin acel API ID;
- foloseste ID-uri deterministe si poate fi rulat din nou;
- creeaza 25 de profiluri, activitati PEO, proiecte Concordia/GOODWORKS4ALL si concedii sintetice;
- include intentionat statusuri nevalidate si un concediu duplicat pentru testarea alertelor.

## Utilizatori de test

Defineste emailurile si o parola temporara puternica numai in sesiunea curenta:

    $env:APP_ENV = "staging"
    $env:STAGING_ADMIN_EMAIL = "<email-admin>"
    $env:STAGING_FINANCIAL_EMAIL = "<email-financiar>"
    $env:STAGING_PM_EMAIL = "<email-pm>"
    $env:STAGING_EXPERT_EMAIL = "<email-expert>"
    $env:STAGING_TEMP_PASSWORD = "<parola-temporara>"
    npm run users:staging

Scriptul compara user pool-ul cu productia si creeaza utilizatorii cu mesajele Cognito suprimate.
Pana la introducerea unui grup dedicat, utilizatorul Financiar este adaugat in grupul admin.

## Verificare dupa deploy

1. Bannerul MEDIU DE TEST - DATELE NU SUNT OFICIALE este vizibil pe fiecare pagina.
2. URL-urile AppSync si ID-urile Cognito/Storage difera de main.
3. Tabelul Expert staging contine exact cele 25 de ID-uri cu prefix staging-expert-.
4. Exporturile de pontaj au sufixul _TEST.
5. Numarul de elemente din tabelele de productie este neschimbat.
