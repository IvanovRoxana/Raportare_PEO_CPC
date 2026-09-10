# Eligibilitatea livrabilelor — implementarea locală

Arhitectura Next.js + Amplify SSR rămâne păstrată. Modificările separă identitatea documentului, titlul, evaluarea LLM și redactarea descrierii. Nu au fost schimbate cheile API, modelul configurat, infrastructura de găzduire sau schema AWS. Codul nu a fost publicat.

## Fluxul acceptat

1. Expertul alege categoria sa și subactivitatea alocată. La activitățile standard poate încărca documentele înainte să aleagă activitatea din catalog.
2. Detectarea duplicatelor folosește identitatea documentului și hashul fișierului. Potrivirile numai după titlu/copertă sunt avertizări, nu justifică reunirea automată. Pentru repetări compatibile se păstrează propunerea de asociere la activitatea existentă pe mai multe zile.
3. Modulul de titlu folosește textul primei pagini/începutului documentului. Un titlu prezent efectiv în acel text nu mai este respins pentru că seamănă cu numele fișierului. La DOCX, extractorul existent oferă începutul textului, fără o garanție de paginare fizică identică Word.
4. Eligibilitatea citește profilul expertului și catalogul autorizat pe server, inclusiv descrieri, obiective, rezultate, beneficiari și indicatori. RAG recuperează fragmente relevante din proiect, subactivitate și fișa postului. Fișa deja disponibilă în profil poate fi folosită explicit cu această proveniență.
5. LLM primește întregul text extras al livrabilelor acceptate în cerere. Returnează încadrare, scor, criterii, citate și rezumate factuale. Scorul LLM nu este înlocuit cu un scor calculat prin potriviri de cuvinte.
6. Încrederea ridicată și un verdict susținut permit completarea automată a activității din SA selectată. Expertul o poate corecta. Încrederea medie lasă propunerea pentru aplicare explicită. Schimbarea SA necesită confirmarea expertului și reevaluare.
7. PM vede încadrarea, motivarea, sursele, citatele verificate și rezumatele. Optimizarea descrierii rămâne un pas separat, bazat pe intenția expertului și dovezile documentelor analizate.

## Protecții împotriva rezultatelor incorecte

- Erorile tehnice și verificările întrerupte nu sunt verdict de neeligibilitate; nu afișează un scor fals de 0/100 și permit reîncercarea. Rezultatele finalizate au și acțiune explicită de reevaluare.
- Răspunsurile întârziate nu trebuie să suprascrie schimbarea activității, SA sau documentelor. Modificarea dovezilor invalidează evaluarea grupului.
- Textul salvat anterior ca previzualizare nu este tratat drept document integral: verificarea recitește fișierul original când este disponibil.
- Lipsa surselor obligatorii, extragerea parțială, citatele inventate și concluziile pozitive contradictorii rămân neconcludente, fără aplicare automată.
- Rezumatele pentru redactare se reutilizează numai pentru același ID și hash, dintr-o evaluare finalizată, cu citate valide. Rezumatul generat nu este o sursă pentru inventarea unor cifre.
- OCR are worker reutilizat, procesare serială per document, limite de timp și curățare. Pentru eligibilitatea PDF este cerută și citirea imaginilor din toate paginile; o citire incompletă este marcată explicit.

## Limite și verificarea în mediul publicat

Limitele actuale sunt 1–8 livrabile, maximum 180.000 de caractere/document, 240.000/grup și 320.000 pentru întregul prompt. Cererile mai mari sunt respinse explicit, nu evaluate doar din primele pagini. OCR are un buget de 120 de secunde/document și 30 de secunde/operație; evaluarea modelului are maximum 55 de secunde.

Nu au fost efectuate apeluri reale la OpenAI, S3 sau catalogul/RAG din producție. Mai trebuie verificată indexarea documentelor pentru proiect, SA și expert și rulat fluxul pe exemple reale: eligibil, neeligibil, încadrare în altă SA, document deja salvat și fișier nou.

Durata permisă efectiv de gateway trebuie verificată în mediul publicat: termenul local de așteptare nu poate mări limita infrastructurii. AWS explică faptul că un timeout între CloudFront și origine poate produce HTTP 504; aceasta este o posibilitate de verificat, nu cauza demonstrată a capturii „Failed to fetch”. [Documentație AWS](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/http-504-gateway-timeout.html).

Ruleseturile suplimentare PM au încă accesul existent PM/admin. Când nu sunt accesibile din sesiunea expertului, evaluarea folosește regulile incluse în cod și identifică separat această sursă; nu raportează folosirea unui ruleset publicat necitit. Drepturile AWS nu au fost lărgite.

Auditul inițial, anterior remedierilor, este păstrat în `audit-eligibilitate-duplicate-2026-09-10.md`.

## Verificări finale locale

- TypeScript: `tsc --noEmit --incremental false`, trecut.
- Suita completă: 804 teste, dintre care 802 trecute și 2 eșuate în `tests/financial-hr-validation.test.ts`. Cele două verifică editorul paginii Salariați, modificat separat înaintea intervenției de față; fișierul financiar nu a fost editat aici.
- ESLint: zero erori, avertismentul existent `prepareActivities`. Configurația exclude `.ts` și `.tsx`; pentru acestea verificările de aici sunt TypeScript și testele, nu lintul.
- `git diff --check`: trecut.
- Teste dedicate pentru identitate/hash, încadrare automată/manuală, schimbarea SA, invalidarea grupului, proveniența rezumatelor, surse RAG, citate, text complet și întreruperea/curățarea OCR.

Aceste verificări validează contractele și mecanismele locale. Nu măsoară încă exactitatea verdictelor LLM pe livrabile reale sau comportamentul infrastructurii publicate.
