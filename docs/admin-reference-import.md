# Importul documentelor de referinta

Locatie: `/admin?tab=ai` -> **Context AI & Eligibilitate** -> **Importa PDF / DOCX**.

1. Selecteaza documentele si confirma codul proiectului.
2. Verifica tipul sursei, codul SA si pozitia expertului. Aceste campuri sunt editabile.
3. Apasa **Verifica fisierele**. Acest pas foloseste `dryRun=true`, fara scrieri AppSync sau embeddings.
4. Consulta rezultatele si previzualizarea textului.
5. Apasa **Indexeaza fisierele verificate**. Sunt trimise numai fisierele verificate, pe rand, folosind sesiunea Cognito.

Modificarea maparii sau a proiectului invalideaza verificarea. Rezultatele sunt afisate separat: indexat, exista deja, omis sau eroare. Biblioteca RAG si contextul AI sunt reincarcate dupa import.

## Lot verificat la 15 septembrie 2026

| Documente | Mapare | Verificare tehnica |
| --- | --- | --- |
| 6 descrieri: SA1.1, SA2.1, SA3.2, SA3.3, SA3.4, SA3.5 | `scop_sa` + SA din nume | Text nativ, 14 pagini in total |
| 10 fise de post | `fisa_post` + pozitie | Text nativ, cate o pagina |
| I10 Manualul Beneficiarului V5 | `manual_beneficiar` | Text nativ, 209 pagini |
| 20260317 Text Cerere de Finantare DOCX | `cerere_finantare` | Text extractibil; parserul semnaleaza un element grafic `v:path` ignorat |

Sufixele de descarcare `(1)` sunt eliminate din mapare, dar numele original este pastrat. Exista aliasuri pentru corespondenta cu denumirile din catalog: recrutare/selectie grup tinta -> Expert Recrutare si Selectie GT; protectia datelor cu caracter personal -> Expert Protectia Datelor; responsabil centru regional -> Responsabil Centre Regionale. Verifica aceste corespondente fata de configuratia backend curenta. Nu se atribuie automat un expertId sau o persoana.

Verificarea este tehnica, nu certifica validitatea juridica a documentelor, actualitatea manualului ori completitudinea tuturor surselor proiectului. Lotul nu include o descriere separata SA6.1 sau fisele tuturor rolurilor PM.

## Limite operationale

- Originalele nu sunt modificate si nu sunt arhivate de acest import. In RAG sunt indexate textul si metadatele prin `indexKnowledgeDocument`, nu prin scrieri directe in baza de date.
- PDF-urile fara text nativ sunt omise cu mesaj OCR; foloseste fluxul individual existent pentru OCR.
- Maximum 15 MB per fisier. Un document mare, precum manualul, poate depasi timpul de executie al mediului de hosting; verifica importul real dupa deploy.
- Importul nu actualizeaza `Expert.jobDescriptionText` si nu inlocuieste/dezactiveaza automat versiuni vechi. Aceste operatii raman in administrarea existenta.
- Dupa o eroare de indexare sau de retea, verifica biblioteca si fragmentele/contextul inainte de reincercare. Fluxul existent poate lasa un document partial, iar deduplicarea nu este o dovada a indexarii complete.
- Testele locale folosesc servicii simulate pentru Cognito/AppSync. Indexarea reala si build-ul complet al aplicatiei trebuie verificate in CI si in mediul autentificat.
