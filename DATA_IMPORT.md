# Import date PEO

Tabelele primite sunt folosite in doua etape:

1. Pregatire date locale:

```powershell
npm run prepare:reference-data
```

Comanda citeste fisierele Excel/CSV PEO si genereaza fisiere normalizate in `data/import`.

2. Import cataloage stabile in AWS DynamoDB:

```powershell
npm run import:reference-data
```

Comanda importa in DynamoDB:

- `ActivityCatalog`, din `PEO_Catalog_Activitati v2.xlsx`
- `WorkingGroup`, din `PEO_Grupuri_Lucru (1).csv`

Datele operationale sunt pregatite, dar nu sunt importate automat:

- `sample-activities.json`
- `target-groups.json`
- `report-statuses.json`

Acestea contin emailul expertului din fisierele sursa si trebuie legate de `Expert.id` inainte de importul final, ca sa nu cream activitati fara utilizator real in aplicatie.

Scriptul de pregatire repara automat textele romanesti citite gresit din fisierele sursa, astfel incat in JSON si in baza de date sa ajunga diacritice corecte.

## Statusul activitatilor din catalog

Activitatile generate in `data/import/activity-catalog.json` sunt active implicit. Dupa publicarea schemei `ActivityCatalog` prin fluxul backend utilizat de proiect, randurile existente care nu au atributul `isActive` pot fi actualizate cu:

```powershell
npm run migrate:activity-status
```

Comanda foloseste profilul `raportarepeo` si regiunea `eu-north-1` implicit. Acestea pot fi suprascrise prin variabilele `AWS_PROFILE` si `AWS_REGION`. Migrarea completeaza numai statusurile absente; activitatile marcate deja ca inactive nu sunt reactivate.
