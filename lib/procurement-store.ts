'use client';

import { getAwsDataClient } from '@/lib/aws/client';
import { getSignedInUser } from '@/lib/aws/auth';
import { resolveDashboardAccess } from '@/lib/pm-dashboard';
import {
  getContractedProcurementProjects,
  getProcurementAttentionLevel,
  PROCUREMENT_ATTENTION_LABELS,
  type ProcurementAttentionLevel,
  type ProcurementProject,
  type ProcurementStatus,
} from '@/lib/procurement';

type ModelListResult<T> = { data?: T[] | null; errors?: unknown; nextToken?: string | null };

function assertNoErrors<T>(result: ModelListResult<T>, action: string) {
  if (result.errors) {
    throw new Error(`${action} failed: ${JSON.stringify(result.errors)}`);
  }
}

async function listAll<T>(
  listFn: (args?: { filter?: Record<string, unknown>; limit?: number; nextToken?: string | null }) => Promise<ModelListResult<T>>,
  filter?: Record<string, unknown>,
): Promise<T[]> {
  const items: T[] = [];
  let nextToken: string | null | undefined = null;

  do {
    const result = await listFn({ filter, limit: 1000, nextToken });
    assertNoErrors(result, 'AWS list procurement');
    items.push(...(result.data ?? []));
    nextToken = result.nextToken;
  } while (nextToken);

  return items;
}

async function assertCanAccessProcurement() {
  const user = await getSignedInUser();
  const access = resolveDashboardAccess({ roles: user?.roles ?? [] });
  if (!access.canUseAchizitii) {
    throw new Error('Acces interzis: modulul Achiziții este disponibil pentru PM și Admin.');
  }
}

function mapProcurementProject(item: any): ProcurementProject {
  const currentStatus = (item.currentStatus ?? 'PLANIFICATA') as ProcurementStatus;
  const plannedEndYear = item.plannedEndYear ?? undefined;
  const attentionLevel = (item.attentionLevel ?? getProcurementAttentionLevel({ plannedEndYear, currentStatus })) as ProcurementAttentionLevel;

  return {
    id: item.id,
    code: item.code,
    title: item.title,
    description: item.description ?? undefined,
    category: item.category ?? '',
    projectId: item.projectId ?? undefined,
    projectCode: item.projectCode ?? undefined,
    mysmisCode: item.mysmisCode ?? undefined,
    subactivity: item.subactivity ?? undefined,
    procurementType: item.procurementType,
    procedureType: item.procedureType,
    responsibleUserId: item.responsibleUserId ?? undefined,
    department: item.department ?? undefined,
    currentStatus,
    estimatedValueWithoutVat: item.estimatedValueWithoutVat ?? 0,
    estimatedVatValue: item.estimatedVatValue ?? 0,
    estimatedValueWithVat: item.estimatedValueWithVat ?? 0,
    currency: item.currency ?? 'RON',
    budgetLine: item.budgetLine ?? undefined,
    fundingSource: item.fundingSource ?? undefined,
    plannedPeriod: item.plannedPeriod ?? '',
    plannedStartYear: item.plannedStartYear ?? undefined,
    plannedEndYear,
    attentionLevel,
    attentionLabel: item.attentionLabel ?? PROCUREMENT_ATTENTION_LABELS[attentionLevel],
    sourceRowNumber: item.sourceRowNumber ?? undefined,
    sourceFileName: item.sourceFileName ?? undefined,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function sortProcurementProjects(projects: ProcurementProject[]) {
  return [...projects].sort((a, b) => (a.sourceRowNumber ?? 9999) - (b.sourceRowNumber ?? 9999) || a.title.localeCompare(b.title));
}

export const procurementProjectsService = {
  async getAll(): Promise<ProcurementProject[]> {
    await assertCanAccessProcurement();
    const client = getAwsDataClient() as any;
    if (!client.models.ProcurementProject) return getContractedProcurementProjects();

    const data = await listAll<any>((args) => client.models.ProcurementProject.list(args));
    const projects = data.map(mapProcurementProject);
    return projects.length ? sortProcurementProjects(projects) : getContractedProcurementProjects();
  },
};
