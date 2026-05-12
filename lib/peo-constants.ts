// ============================================
// PEO 302141 - Constants and Configuration
// ============================================

// Activities per Sub-Activity (from HTML file)
export const ACTS: Record<string, string[]> = {
  "SA1.1": [
    "Monitorizare GT — entitati",
    "Monitorizare eveniment GT",
    "Recrutare / sesiune informare GT",
    "Actualizare registru GT",
    "Verificare conformitate GDPR",
    "Actualizare documente GDPR",
    "Sedinta interna de status",
    "Verificare planning",
    "Elaborare RA / OPIS"
  ],
  "SA2.1": [
    "Elaborare caiet de sarcini achizitie servicii de analize",
    "Participare selectie furnizor analize / cercetare",
    "Coordonare si monitorizare furnizor analize",
    "Verificare si validare raport de analiza livrat",
    "Raport analiza reprezentativitate parteneri sociali la nivel sectorial",
    "Raport analiza valoare adaugata sectoare strategice",
    "Raport analiza cantitativa piata muncii",
    "Analiza calitativa — Munca la romani",
    "Studiu impozitarea muncii",
    "Raport analiza salariu minim",
    "Raport violenta si hartuire la locul de munca",
    "Raport telemunca si dreptul de deconectare",
    "Raport integrare lucratori non-UE",
    "Raport timp de lucru si flexibilizarea muncii",
    "Sedinta interna de status",
    "Verificare planning",
    "Elaborare RA / OPIS"
  ],
  "SA2.2": [
    "Studiu / analiza / cercetare",
    "Raport intermediar",
    "Sedinta interna de status",
    "Elaborare RA / OPIS"
  ],
  "SA3.2": [
    "S1 — Monitorizare legislativa regionala si informare membri",
    "S1 — Elaborare nota de informare / sinteza legislativa regionala",
    "S1 — Colectare puncte de vedere membri regionali",
    "S2 — Organizare eveniment / workshop / webinar regional",
    "S2 — Participare consultare publica / eveniment extern",
    "S3 — Prospecte si suport afiliere organizatii patronale",
    "S3 — Consiliere organizatii patronale noi / in curs de infiintare",
    "S4 — Activitate Business HUB Bucuresti",
    "S5 — Actualizare / raportare Harta Interactiva Romania",
    "Sedinta interna de status",
    "Verificare planning",
    "Elaborare RA / OPIS"
  ],
  "SA3.3": [
    "Coordonare operationala centru regional",
    "Relationare reprezentanti teritoriali si evidenta structurata",
    "Organizare intalnire / eveniment / atelier local",
    "Prospecte si atragere noi membri in teritoriu",
    "Raportare catre sediul central — situatie teritoriu",
    "Actualizare baza de date centrale cu informatii teritoriale",
    "Eveniment recrutare si prezentare avantaje afiliere CPC",
    "Sedinta interna de status",
    "Elaborare RA / OPIS"
  ],
  "SA3.4": [
    "01 — Onboarding / integrare membru nou CPC",
    "02 — Elaborare mesaje strategice per eveniment",
    "02 — Chestionare / sondaje / colectare feedback membri",
    "02 — Distribuire materiale informative si ghiduri membri",
    "03 — Suport Grup de Lucru tematic (GL protectia consumatorului / fiscalitate / transport / energie)",
    "03 — Suport Club Tranzitia Energetica si decarbonizare",
    "04 — Redactare Newsletter lunar CPC",
    "04 — Redactare / actualizare Raport Anual CPC",
    "04 — Pregatire materiale Board CPC / Adunare membri",
    "05 — Elaborare document de pozitie / analiza legislativa",
    "05 — Monitorizare legislativa si informare membri CPC",
    "05 — Participare / reprezentare consultare publica sau dezbatere",
    "06 — Organizare eveniment / masa rotunda / dezbatere",
    "06 — Participare / reprezentare la eveniment extern",
    "06 — Elaborare materiale suport eveniment (discursuri, prezentari)",
    "Sedinta interna de status",
    "Verificare planning",
    "Elaborare RA / OPIS"
  ],
  "SA3.5": [
    "S1 — Monitorizare legislativa UE si informare membri",
    "S1 — Elaborare fisa sintetica act normativ UE",
    "S1 — Alerta / informare deschidere consultare publica europeana",
    "S2 — Elaborare document de pozitie european CPC",
    "S2 — Consultare membri si agregare pozitii europene",
    "S2 — Contributie scrisa la consultare BusinessEurope / IOE / BIAC",
    "S3 — Participare eveniment / consultare europeana (PE / CE / Consiliu UE)",
    "S3 — Participare eveniment BusinessEurope / IOE / BIAC / Alliance Patronats Francophone",
    "S3 — Networking si cultivare relatii la nivel european",
    "S4 — Vizita de studiu / schimb experienta federatie europeana",
    "S4 — Documentare bune practici europene internalizate",
    "S4 — Diseminare interna concluzii schimb experienta",
    "S5 — Reprezentare activa in BusinessEurope (grupuri de lucru / forumuri)",
    "S5 — Reprezentare activa in IOE / BIAC / Alliance des Patronats Francophone",
    "S6 — Redactare newsletter european periodic",
    "S6 — Elaborare nota informativa europeana tematica",
    "S6 — Elaborare rezumat post-participare la eveniment / schimb european",
    "Sedinta interna de status",
    "Elaborare RA / OPIS"
  ],
  "SA4.1": [
    "Comunicare interna proiect",
    "Comunicare externa proiect",
    "Elaborare materiale informare si vizibilitate",
    "Actualizare website proiect",
    "Redactare comunicat de presa",
    "Organizare conferinta de presa",
    "Sedinta interna de status",
    "Elaborare RA / OPIS"
  ],
};

// Deliverables per Expert Category
export const DELIVS: Record<string, string[]> = {
  ap: [
    "Document de pozitie / analiza legislativa",
    "Nota de informare periodica (regionala / europeana)",
    "Sinteza legislativa cu impact regional / sectorial",
    "Fisa de argumentatie per eveniment",
    "Nota de briefing pentru vorbitori",
    "MOM / Minut / Proces verbal eveniment",
    "Raport de participare eveniment",
    "Raport post-eveniment cu concluzii",
    "Raport de monitorizare legislativa (regional / european)",
    "Raport prospecte si afiliere organizatii patronale",
    "Registru utilizare spatii Business HUB",
    "Raport de activitate Business HUB (lunar / trimestrial)",
    "Newsletter informativ lunar CPC",
    "Material prezentare / suport eveniment",
    "Fotografii + link eveniment",
    "Agenda eveniment",
    "Lista de prezenta eveniment",
  ],
  com: [
    "Material publicat + link",
    "Raport participare eveniment",
    "Material informativ / prezentare",
    "Screenshot confirmare publicare",
    "MOM sedinta comunicare",
    "Dosar media / raport media"
  ],
  bh: [
    "Registru utilizare spatii BH",
    "Raport activitate BH",
    "Material informativ (ghid/procedura)",
    "MOM eveniment BH"
  ],
  gt: [
    "Fisa monitorizare entitate",
    "Fisa monitorizare eveniment",
    "Registru intern GT",
    "Registru monitorizare operativa",
    "MOM sesiune informare GT",
    "Formular de inscriere GT",
    "Metodologie actualizata"
  ],
  gdpr: [
    "Raport verificare GDPR",
    "Lista de control GDPR",
    "Document GDPR actualizat",
    "Proces verbal verificare",
    "Nota instruire GDPR"
  ],
  cercetare: [
    "Caiet de sarcini achizitie servicii analize",
    "Raport de analiza / studiu validat",
    "Raport de monitorizare furnizor analize",
    "Nota de validare raport de analiza",
    "Raport intermediar cercetare",
    "Bibliografie / referinte studiu",
    "Material publicat + link (diseminare pe site Concordia)",
    "Screenshot confirmare publicare",
  ],
  cr: [
    "Raport activitate centru regional (lunar / trimestrial)",
    "Evidenta / registru relatii reprezentanti teritoriali",
    "MOM / Minut / Proces verbal intalnire / eveniment local",
    "Raport prospecte noi membri in teritoriu",
    "Raport situatie teritoriu (catre sediul central)",
    "Material prezentare avantaje afiliere CPC",
    "Fotografii + link eveniment local",
    "Lista de prezenta eveniment",
    "Agenda eveniment",
  ],
};

// Expert Responsibilities per Category
export const RESP: Record<string, string> = {
  ap: `- Elaborarea/actualizarea metodologiei de inscriere, recrutare si selectie grupul tinta
- Evaluarea eligibilitatii candidatilor
- Derularea procesului de selectie a membrilor GT conform metodologiei
- Transmiterea catre candidati a rezultatelor procesului de selectie
- Este responsabil de implementarea activitatii in care este implicat conform specificatiilor si indicatorilor asumati in proiect, a legislatiei in vigoare si a instructiunilor emise de AMPEO
- Executa orice alte dispozitii primite de la managerul de proiect.`,
  com: `- Gestionarea comunicarii interne si externe a proiectului
- Activitati de informare si vizibilitate
- Este responsabil de implementarea activitatii in care este implicat
- Executa orice alte dispozitii primite de la managerul de proiect.`,
  bh: `- Coordoneaza activitatile hub-ului de afaceri
- Sprijina dezvoltarea antreprenoriatului in randul grupului tinta
- Este responsabil de implementarea activitatii in care este implicat
- Executa orice alte dispozitii primite de la managerul de proiect.`,
  gt: `- Elaborarea/actualizarea metodologiei de inscriere, recrutare si selectie grupul tinta
- Evaluarea eligibilitatii candidatilor
- Derularea procesului de selectie a membrilor GT conform metodologiei
- Transmiterea catre candidati a rezultatelor procesului de selectie
- Este responsabil de implementarea activitatii in care este implicat
- Executa orice alte dispozitii primite de la managerul de proiect.`,
  gdpr: `- Asigura conformitatea GDPR a proiectului
- Elaborarea si actualizarea documentelor GDPR
- Verificarea conformitatii proceselor cu legislatia privind protectia datelor
- Este responsabil de implementarea activitatii in care este implicat
- Executa orice alte dispozitii primite de la managerul de proiect.`,
  cercetare: `- Elaborarea caietelor de sarcini pentru achizitii de servicii de analize (CPV 79311400-1) impreuna cu expertul achizitii
- Participa la activitatea de selectie a furnizorilor de studii si analize
- Coordoneaza si monitorizeaza activitatea furnizorilor de analize
- Verifica si valideaza rapoartele de analiza elaborate de furnizori
- Este responsabil de implementarea activitatii in care este implicat conform specificatiilor si indicatorilor asumati in proiect, a legislatiei in vigoare si a instructiunilor emise de AMPEO
- Este responsabil de corelarea realizarilor obtinute cu rezultatele si indicatorii proiectului
- Executa orice alte dispozitii primite de la managerul de proiect.`,
  cr: `- Este responsabil cu relationarea cu reprezentantii teritoriali si mentinerea unei evidente structurate raportate periodic catre sediul central
- Contribuie la crearea unei imagini atractive a organizatiei si prospectarea pietei pentru atragerea de noi membri
- Organizeaza intalniri, evenimente si ateliere de lucru locale pe teme de interes pentru cei din teritoriu
- Raporteaza catre sediul central orice problema semnalata de reprezentantii locali
- Tine o evidenta periodica a situatiei din teritoriu si contribuie la consolidarea bazei de date centrale
- Este liantul care pune in legatura membrii actuali cu cei interesati sa adere
- Este responsabil de implementarea activitatii in care este implicat conform specificatiilor si indicatorilor asumati in proiect
- Executa orice alte dispozitii primite de la managerul de proiect.`,
};

// All Deliverables (master list)
export const ALL_DELIVS = [
  // Documente pozitie si analize
  "Document de pozitie / analiza legislativa",
  "Document de pozitie european CPC",
  "Analiza legislativa cu recomandari",
  "Contributie scrisa la consultare BusinessEurope / IOE / BIAC",
  "Propunere legislativa / ghid practic",
  // Note si sinteze
  "Nota de informare periodica (regionala / europeana)",
  "Sinteza legislativa cu impact regional / sectorial",
  "Fisa sintetica act normativ UE / national",
  "Nota de briefing pentru vorbitori",
  "Fisa de argumentatie per eveniment",
  "Nota informativa post-eveniment european",
  "Alerta consultare publica europeana",
  // Rapoarte
  "Raport de monitorizare legislativa (regional / european)",
  "Raport de participare eveniment",
  "Raport de participare eveniment european",
  "Raport post-eveniment cu concluzii",
  "Raport de activitate Business HUB (lunar / trimestrial)",
  "Raport semestrial / anual activitate centru regional",
  "Raport schimb de experienta / vizita studiu",
  "Raport anual sinteza activitate europeana CPC",
  "Raport prospecte si afiliere organizatii patronale",
  "Raport consiliere organizatii patronale",
  "Raport trimestrial onboarding membri",
  "Raport sinteză feedback membri",
  "Raport activitate semestrial Grup de Lucru",
  // Minute si procese verbale
  "MOM / Minut / Proces verbal eveniment",
  "Minut / Proces verbal sedinta Grup de Lucru",
  "Minut / Proces verbal sedinta Board / Adunare membri",
  // Registre si evidente
  "Registru utilizare spatii Business HUB",
  "Registru / evidenta membri integrati CPC",
  "Evidenta organizatii patronale sprijinite",
  "Raport extrase platforma Harta Interactiva",
  // Dosare si planuri
  "Dosar onboarding / plan integrare nou membru",
  "Plan de actiune integrare bune practici europene",
  "Sinteza comparativa modele patronale europene",
  // Publicatii si materiale
  "Newsletter informativ lunar CPC",
  "Newsletter european periodic",
  "Raport Anual CPC",
  "Material prezentare / suport eveniment",
  "Ghid bune practici tematic",
  "Materiale informative / ghiduri distribuite",
  "Chestionar / sondaj distribuit membrilor",
  "Materiale Board CPC / Adunare membri",
  // Comunicare si media
  "Scrisoare / nota de consultare cu autoritati",
  "Screenshot confirmare publicare material",
  "Dosar media / raport media",
  "Fotografii + link eveniment",
  // Documente justificative evenimente
  "Agenda eveniment",
  "Lista de prezenta eveniment",
  "Invitatii / convocatoare eveniment",
];

// Event Activities keywords (for detecting if activity is an event)
export const EVENT_ACTS = [
  "organizare eveniment",
  "activitate business hub",
  "centru regional",
  "forum",
  "atelier",
  "conferinta",
  "sesiune informare",
  "participare eveniment",
  "eveniment anual",
  "dialog pentru dezvoltare",
  "schimb experienta",
  "sedinta",
  "masa rotunda",
  "dezbatere",
  "vizita de studiu",
  "workshop",
  "webinar",
];

// Exception activities (don't require deliverables, but require description)
export const EXCEPTIONS = [
  "Elaborare RA / OPIS",
  "Sedinta interna de status",
  "Verificare planning"
];

// Month names in Romanian
export const MONTHS = [
  "Ianuarie", "Februarie", "Martie", "Aprilie", "Mai", "Iunie",
  "Iulie", "August", "Septembrie", "Octombrie", "Noiembrie", "Decembrie"
];

// Day names in Romanian
export const DAY_NAMES = ["Lun", "Mar", "Mie", "Joi", "Vin", "Sam", "Dum"];

// Status colors and labels
export const STATUS_CONFIG = {
  complete: { label: "Complet", bg: "#EAF3DE", txt: "#3B6D11", bd: "#97C459" },
  exception: { label: "Exceptie OK", bg: "#EAF3DE", txt: "#3B6D11", bd: "#97C459" },
  exc_desc: { label: "Descriere lipsa", bg: "#FAEEDA", txt: "#633806", bd: "#EF9F27" },
  common_wait: { label: "Comun — lipsa", bg: "#FAEEDA", txt: "#633806", bd: "#EF9F27" },
  missing: { label: "Fara livrabil", bg: "#FCEBEB", txt: "#791F1F", bd: "#F09595" },
  name_mismatch: { label: "Denumire neconcordanta", bg: "#FAEEDA", txt: "#633806", bd: "#EF9F27" },
  title_mismatch: { label: "Titlu prima pagina gresit", bg: "#FAEEDA", txt: "#633806", bd: "#EF9F27" },
  draft: { label: "Draft", bg: "#F1F5F9", txt: "#64748B", bd: "#E2E8F0" },
  leave: { label: "CO / CM", bg: "#EFF6FF", txt: "#1E40AF", bd: "#BFDBFE" },
};

// Calendar cell colors
export const CALENDAR_COLORS = {
  nonworking: { bg: "#F1F5F9", txt: "#94A3B8", bd: "#E2E8F0" },
  co: { bg: "#EFF6FF", txt: "#1E40AF", bd: "#BFDBFE" },
  cm: { bg: "#F0F9FF", txt: "#0369A1", bd: "#BAE6FD" },
  empty_past: { bg: "#FFF5F5", txt: "#FCA5A5", bd: "#FEE2E2" },
  empty: { bg: "#fff", txt: "#CBD5E1", bd: "#E2E8F0" },
  exceeds: { bg: "#FAEEDA", txt: "#92400E", bd: "#FCD34D" },
  issue: { bg: "#FCEBEB", txt: "#991B1B", bd: "#FCA5A5" },
  ok: { bg: "#EAF3DE", txt: "#3B6D11", bd: "#97C459" },
};

// Project knowledge for AI prompts
export const PROJECT_KNOWLEDGE = `PROIECT: PEO 302141 - Consolidarea capacitatii Concordia pentru dialog social

=== SA3.2 — Servicii Afaceri Publice — Infrastructura si Servicii Regionale ===

S1 — Monitorizare si informare legislativa regionala:
Activitati eligibile: monitorizare initiative legislative, elaborare note informare periodice, sinteze legislative, colectare pozitii membri regionali.
Livrabile acceptate: Nota de informare periodica (cu data, destinatari, acte normative monitorizate), Sinteza legislativa cu impact regional/sectorial (min. 1 pag., referinte legislative), Raport de monitorizare legislativa.
Cerinte calitate: nota de informare sa contina act normativ, stadiu legislativ, impact pentru membrii CPC, recomandari.

S2 — Organizare evenimente si workshop-uri regionale:
Activitati eligibile: conferinte, ateliere, webinarii, networking in centrele regionale sau BH.
REGULA EVENIMENT FIZIC: MOM cu semnaturi olografe ale participantilor = obligatoriu. SAU: Raport de activitate per eveniment (agenda+participanti+concluzii) + Fotografii.
Livrabile acceptate: MOM/Minut cu semnaturi, Raport de activitate post-eveniment (agenda, participanti, concluzii), Material suport eveniment (prezentare, sinteza), Fotografii + link eveniment, Agenda eveniment, Lista de prezenta.
Cerinte: Raportul de activitate trebuie sa contina: data, locatie, numar participanti, agenda, concluzii si actiuni ulterioare.

=== REGULI GENERALE ELIGIBILITATE PEO ===
1. EVENIMENT FIZIC = obligatoriu MOM cu semnaturi olografe SAU (Raport post-eveniment complet + Fotografii). Fara acestea = NEELIGIBIL.
2. Titlul de pe prima pagina a documentului trebuie sa corespunda cu denumirea standardizata declarata in pontaj.
3. Toate documentele publice: logo UE + FSE+, mentiunea "Co-finantat din FSE+", cod SMIS 302141.
4. Documentele de pozitie: sa contina referinte legislative, argumente structurate, recomandari concrete, semnaturi.
5. Notele de informare: sa fie datate, sa identifice actele normative monitorizate, sa indice impactul pentru membrii CPC.
6. Rapoartele de participare la evenimente europene: obligatoriu sa contina organizatorul, tema, concluzii + recomandari pentru Concordia.
7. Vizitele de studiu (S4 SA3.5): raport de schimb de experienta obligatoriu, 1 per an de implementare.`;

// Check if activity is an event activity
export function isEventActivity(activity: string): boolean {
  if (!activity) return false;
  const actLow = activity.toLowerCase();
  return EVENT_ACTS.some(ea => actLow.includes(ea));
}

// Check if activity is an exception (doesn't require deliverable)
export function isExceptionActivity(activity: string): boolean {
  return EXCEPTIONS.includes(activity);
}

// Get deliverable options for expert category
export function getDeliverableOptions(category: string): string[] {
  return DELIVS[category] || ALL_DELIVS;
}

// Get activity options for sub-activity
export function getActivityOptions(saCode: string): string[] {
  return ACTS[saCode] || [];
}

// Check event mandatory rule
export interface EventCheckResult {
  ok: boolean;
  msg: string;
}

export function checkEventMandatoryRule(
  activity: string,
  deliverables: Array<{ uploaded?: boolean; type?: string; isPhoto?: boolean; category?: string }>
): EventCheckResult | null {
  if (!activity || !deliverables?.length) return null;
  
  const actLow = activity.toLowerCase();
  const isEvent = EVENT_ACTS.some(ea => actLow.includes(ea));
  if (!isEvent) return null;
  
  const hasMOM = deliverables.some(d => 
    d.uploaded && d.type && (
      d.type.toLowerCase().includes("mom") || 
      d.type.toLowerCase().includes("proces verbal")
    )
  );
  
  const hasPhoto = deliverables.some(d => 
    d.uploaded && (
      d.isPhoto || 
      d.type?.toLowerCase().includes("foto") || 
      d.type?.toLowerCase().includes("fotografii")
    )
  );
  
  const hasReport = deliverables.some(d => 
    d.uploaded && d.type && (
      d.type.toLowerCase().includes("raport") && (
        d.type.toLowerCase().includes("eveniment") || 
        d.type.toLowerCase().includes("activitate") || 
        d.type.toLowerCase().includes("participare")
      )
    )
  );
  
  if (hasMOM) return { ok: true, msg: "MOM cu semnaturi prezent" };
  if (hasReport && hasPhoto) return { ok: true, msg: "Raport + Fotografii prezente" };
  if (!hasMOM && !hasPhoto && !hasReport) {
    return { ok: false, msg: "OBLIGATORIU: MOM cu semnaturi olografe SAU Raport eveniment + Fotografii" };
  }
  if (hasPhoto && !hasMOM && !hasReport) {
    return { ok: false, msg: "Fotografii prezente dar lipseste MOM sau Raport eveniment" };
  }
  if (hasReport && !hasPhoto && !hasMOM) {
    return { ok: false, msg: "Raport prezent dar lipsesc fotografiile obligatorii" };
  }
  
  return { ok: false, msg: "OBLIGATORIU: MOM cu semnaturi olografe SAU Raport eveniment + Fotografii" };
}

// Extract date from document text
export function extractEventDate(text: string): string | null {
  if (!text) return null;
  
  // Search format DD.MM.YYYY or DD/MM/YYYY
  const m1 = text.match(/\b(\d{1,2})[.\/-](\d{1,2})[.\/-](20\d{2})\b/);
  if (m1) {
    const [, d, mo, y] = m1;
    const dt = new Date(`${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`);
    if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  }
  
  // Search format "DD luna YYYY" in Romanian
  const luni: Record<string, number> = {
    ianuarie: 1, februarie: 2, martie: 3, aprilie: 4, mai: 5, iunie: 6,
    iulie: 7, august: 8, septembrie: 9, octombrie: 10, noiembrie: 11, decembrie: 12
  };
  
  const m2 = text.toLowerCase().match(
    /\b(\d{1,2})\s+(ianuarie|februarie|martie|aprilie|mai|iunie|iulie|august|septembrie|octombrie|noiembrie|decembrie)\s+(20\d{2})\b/
  );
  if (m2) {
    const [, d, mo, y] = m2;
    const dt = new Date(`${y}-${String(luni[mo]).padStart(2, "0")}-${d.padStart(2, "0")}`);
    if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  }
  
  return null;
}

// Title similarity check
export function titleSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
  const wa = norm(a).split(/\s+/).filter(w => w.length > 3);
  const wb = norm(b).split(/\s+/).filter(w => w.length > 3);
  if (!wa.length || !wb.length) return 0;
  const common = wa.filter(w => wb.includes(w)).length;
  return common / Math.max(wa.length, wb.length);
}
