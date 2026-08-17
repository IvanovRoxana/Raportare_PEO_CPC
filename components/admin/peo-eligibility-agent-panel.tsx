import { Bot, CheckCircle2, Database, FileText, Gauge, Lock, SearchIcon, ShieldCheck, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const knowledgeSources = [
  {
    name: 'getExpertProfile()',
    label: 'Profil expert',
    detail: 'Rol, categorie, norma, SA-uri alocate si instructiuni PM/Admin.',
  },
  {
    name: 'getActivityCatalog()',
    label: 'Catalog activitati',
    detail: 'Activitati, subactivitati, livrabile asteptate si rezultate asumate.',
  },
  {
    name: 'getProjectRules()',
    label: 'Reguli proiect',
    detail: 'Reguli deterministe, reguli Concordia si limite operationale aprobate.',
  },
  {
    name: 'getTimesheet()',
    label: 'Pontaj',
    detail: 'Ore declarate, suprapuneri, zi/luna si consistenta cu norma.',
  },
  {
    name: 'getDeliverableText()',
    label: 'Text livrabil',
    detail: 'Text extras din documentul incarcat, fara presupuneri despre documente lipsa.',
  },
  {
    name: 'findPriorValidatedReports()',
    label: 'Rapoarte validate',
    detail: 'Exemple aprobate anterior, folosite doar ca precedent si stil, nu ca regula noua.',
  },
];

const guardrails = [
  'Agentul nu poate inventa reguli, activitati, livrabile sau exceptii.',
  'Regulile Concordia si regulile proiectului raman surse deterministe.',
  'Verdictul din formular ramane consultativ si nu blocheaza salvarea activitatii.',
  'Feature flag-ul de eligibilitate ramane oprit pana la aprobare explicita.',
];

const agentTools = [
  'getExpertProfile()',
  'getActivityCatalog()',
  'getProjectRules()',
  'getTimesheet()',
  'getDeliverableText()',
  'findPriorValidatedReports()',
  'checkDuplicateDeliverable()',
  'checkHoursConsistency()',
];

const pipelineSteps = [
  {
    title: '1. Document Analyzer',
    detail: 'Extrage ce dovedeste documentul si ce elemente lipsesc.',
  },
  {
    title: '2. Activity Matcher',
    detail: 'Compara documentul cu activitatea, SA-ul si tipurile de livrabile permise.',
  },
  {
    title: '3. Eligibility Rules Engine',
    detail: 'Aplica verificari deterministe si semnaleaza incalcarile fara AI creativ.',
  },
  {
    title: '4. Decision Engine',
    detail: 'Combina analiza, regulile si auditul intr-un verdict consultativ.',
  },
];

const evaluationMetrics = [
  'verdict corect',
  'false positive',
  'false negative',
  'recomandare activitate',
  'halucinatii',
  'elemente lipsa',
  'consistenta intre rulari',
  'cost si timp pe document',
];

export function PeoEligibilityAgentPanel() {
  return (
    <Card className="rounded-2xl border-slate-200">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bot className="h-5 w-5 text-primary" />
              PEO Eligibility Agent
            </CardTitle>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Zona de proiectare si audit pentru agentul de eligibilitate. Agentul poate folosi knowledge administrat
              si instrumente controlate, dar verdictul ramane consultativ pana la validare pe date reale.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-900">
              Consultativ
            </Badge>
            <Badge variant="outline" className="border-slate-300 bg-slate-50 text-slate-700">
              Feature flag oprit
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="grid gap-3 lg:grid-cols-4">
          <StatusTile
            icon={ShieldCheck}
            title="Reguli"
            value="Deterministe"
            detail="AI-ul interpreteaza dovezi, nu creeaza reguli."
          />
          <StatusTile
            icon={Lock}
            title="Salvare formular"
            value="Neblocata"
            detail="Eligibilitatea nu opreste salvarea activitatii."
          />
          <StatusTile
            icon={Database}
            title="Knowledge"
            value="Controlat"
            detail="Surse explicite, administrabile si auditabile."
          />
          <StatusTile
            icon={SearchIcon}
            title="Evaluare"
            value="Necesara"
            detail="Alegem modelul dupa verdict PM pe livrabile reale."
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <section className="rounded-xl border bg-white p-4">
            <div className="mb-3 flex items-center gap-2 font-semibold text-slate-950">
              <FileText className="h-4 w-4 text-primary" />
              Knowledge permis agentului
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {knowledgeSources.map((source) => (
                <div key={source.name} className="rounded-lg border bg-slate-50 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{source.name}</div>
                  <div className="mt-1 font-medium text-slate-950">{source.label}</div>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{source.detail}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border bg-slate-50 p-4">
            <div className="mb-3 flex items-center gap-2 font-semibold text-slate-950">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Guardrails
            </div>
            <ul className="space-y-2 text-sm leading-6 text-slate-700">
              {guardrails.map((rule) => (
                <li key={rule} className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#087a63]" />
                  <span>{rule}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950">
              Activarea in formular ramane separata si necesita aprobare explicita prin feature flag.
            </div>
          </section>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <section className="rounded-xl border bg-white p-4">
            <div className="mb-3 flex items-center gap-2 font-semibold text-slate-950">
              <Gauge className="h-4 w-4 text-primary" />
              Instrumente controlate
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {agentTools.map((tool) => (
                <div key={tool} className="rounded-lg border bg-slate-50 px-3 py-2 font-mono text-xs text-slate-800">
                  {tool}
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border bg-white p-4">
            <div className="mb-3 flex items-center gap-2 font-semibold text-slate-950">
              <Bot className="h-4 w-4 text-primary" />
              Pipeline propus
            </div>
            <div className="grid gap-2">
              {pipelineSteps.map((step) => (
                <div key={step.title} className="rounded-lg border bg-slate-50 p-3">
                  <div className="font-medium text-slate-950">{step.title}</div>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{step.detail}</p>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="rounded-xl border bg-white p-4">
          <div className="mb-3 flex items-center gap-2 font-semibold text-slate-950">
            <Sparkles className="h-4 w-4 text-primary" />
            Evaluation Bench pentru 30-50 livrabile
          </div>
          <div className="flex flex-wrap gap-2">
            {evaluationMetrics.map((metric) => (
              <Badge key={metric} variant="outline" className="border-slate-300 bg-slate-50 text-slate-700">
                {metric}
              </Badge>
            ))}
          </div>
        </section>
      </CardContent>
    </Card>
  );
}

function StatusTile({
  icon: Icon,
  title,
  value,
  detail,
}: {
  icon: typeof ShieldCheck;
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl border bg-slate-50 p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Icon className="h-4 w-4 text-primary" />
        {title}
      </div>
      <div className="mt-2 text-lg font-bold text-slate-950">{value}</div>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{detail}</p>
    </div>
  );
}
