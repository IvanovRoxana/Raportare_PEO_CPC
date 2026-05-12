'use client';

import { getAwsDataClient, isAwsAvailable } from '@/lib/aws/client';
import { peoUsersAsExperts } from '@/lib/peo-users';
import type {
  Activity,
  ActivityCatalog,
  AppSettings,
  ConcurrentProject,
  Deliverable,
  Expert,
  GrupTintaEntry,
  Neconformitate,
  ReportStatus,
  VerificationData,
  VerificationNote,
  WorkingGroup,
} from './types';

export { isAwsAvailable };
export {
  calculateWorkingDays,
  formatDate,
  formatDateRo,
  generateId,
  getMonthName,
} from './app-utils';

type ModelResult<T> = { data?: T | null; errors?: unknown };
type ModelListResult<T> = { data?: T[] | null; errors?: unknown; nextToken?: string | null };

function assertNoErrors<T>(result: ModelResult<T> | ModelListResult<T>, action: string) {
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
    assertNoErrors(result, 'AWS list');
    items.push(...(result.data ?? []));
    nextToken = result.nextToken;
  } while (nextToken);

  return items;
}

function listModel<T>(
  model: { list: (args?: { filter?: Record<string, unknown>; limit?: number; nextToken?: string | null }) => Promise<ModelListResult<T>> },
  filter?: Record<string, unknown>,
) {
  return listAll<T>((args) => model.list(args), filter);
}

function monthFromDate(date: string) {
  return new Date(`${date}T00:00:00`).getMonth();
}

function yearFromDate(date: string) {
  return new Date(`${date}T00:00:00`).getFullYear();
}

function mapExpert(item: any): Expert {
  return {
    id: item.id,
    name: item.name,
    role: item.role,
    email: item.email ?? undefined,
    phone: item.phone ?? undefined,
    category: item.category ?? undefined,
    norma: item.norma ?? 8,
    saCodes: item.saCodes ?? [],
    hasPmAccess: item.hasPmAccess ?? false,
    isActive: item.isActive ?? true,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function mapDeliverable(item: any): Deliverable {
  return {
    id: item.id,
    activityId: item.activityId,
    fileName: item.fileName,
    fileType: item.fileType,
    fileSize: item.fileSize,
    filePath: item.filePath ?? undefined,
    uploadedAt: item.uploadedAt ?? undefined,
  };
}

function mapGrupTinta(item: any): GrupTintaEntry {
  return {
    id: item.id,
    expertId: item.expertId,
    activityId: item.activityId ?? undefined,
    date: item.date,
    year: item.year,
    month: item.month,
    activityType: item.activityType,
    organizations: item.organizations ?? [],
    participantsCount: item.participantsCount ?? 0,
    notes: item.notes ?? undefined,
    createdAt: item.createdAt,
  };
}

async function attachActivityChildren(activity: any): Promise<Activity> {
  const client = getAwsDataClient() as any;
  const [deliverables, grupTinta] = await Promise.all([
    listModel<any>(client.models.Deliverable, { activityId: { eq: activity.id } }),
    listModel<any>(client.models.GrupTintaEntry, { activityId: { eq: activity.id } }),
  ]);

  return {
    id: activity.id,
    expertId: activity.expertId,
    expertName: activity.expertName ?? undefined,
    date: activity.date,
    hours: activity.hours ?? 0,
    activityType: activity.activityType,
    saCode: activity.saCode ?? undefined,
    catalogActivityId: activity.catalogActivityId ?? undefined,
    title: activity.title,
    description: activity.description ?? undefined,
    location: activity.location ?? undefined,
    dayType: activity.dayType ?? undefined,
    workingGroupId: activity.workingGroupId ?? undefined,
    status: activity.status ?? 'draft',
    pmNotes: activity.pmNotes ?? undefined,
    deliverables: deliverables.map(mapDeliverable),
    grupTinta: grupTinta.map(mapGrupTinta),
    createdAt: activity.createdAt,
    updatedAt: activity.updatedAt,
  };
}

export const expertsService = {
  async getAll(): Promise<Expert[]> {
    const client = getAwsDataClient() as any;
    const data = await listModel<any>(client.models.Expert, { isActive: { ne: false } });
    const experts = data.map(mapExpert);
    const fallbackExperts = peoUsersAsExperts();
    const merged = new Map(fallbackExperts.map((expert) => [expert.email?.toLowerCase() ?? expert.id, expert]));

    experts.forEach((expert) => {
      merged.set(expert.email?.toLowerCase() ?? expert.id, expert);
    });

    return Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name));
  },

  async getById(id: string): Promise<Expert | null> {
    const client = getAwsDataClient() as any;
    const result = await client.models.Expert.get({ id });
    assertNoErrors(result, 'AWS get expert');
    return result.data ? mapExpert(result.data) : peoUsersAsExperts().find((expert) => expert.id === id) ?? null;
  },

  async create(expert: Omit<Expert, 'id'>): Promise<Expert> {
    const client = getAwsDataClient() as any;
    const result = await client.models.Expert.create({
      name: expert.name,
      role: expert.role,
      email: expert.email,
      phone: expert.phone,
      category: expert.category,
      norma: expert.norma ?? 8,
      saCodes: expert.saCodes ?? [],
      hasPmAccess: expert.hasPmAccess ?? false,
      isActive: expert.isActive ?? true,
    });
    assertNoErrors(result, 'AWS create expert');
    return mapExpert(result.data);
  },

  async update(id: string, updates: Partial<Expert>): Promise<void> {
    const client = getAwsDataClient() as any;
    const result = await client.models.Expert.update({
      id,
      name: updates.name,
      role: updates.role,
      email: updates.email,
      phone: updates.phone,
      category: updates.category,
      norma: updates.norma,
      saCodes: updates.saCodes,
      hasPmAccess: updates.hasPmAccess,
      isActive: updates.isActive,
    });
    assertNoErrors(result, 'AWS update expert');
  },

  async delete(id: string): Promise<void> {
    await expertsService.update(id, { isActive: false });
  },
};

export const activitiesService = {
  async getAll(): Promise<Activity[]> {
    const client = getAwsDataClient() as any;
    const data = await listModel<any>(client.models.Activity);
    const mapped = await Promise.all(data.map(attachActivityChildren));
    return mapped.sort((a, b) => b.date.localeCompare(a.date));
  },

  async getByExpert(expertId: string): Promise<Activity[]> {
    const client = getAwsDataClient() as any;
    const data = await listModel<any>(client.models.Activity, { expertId: { eq: expertId } });
    const mapped = await Promise.all(data.map(attachActivityChildren));
    return mapped.sort((a, b) => b.date.localeCompare(a.date));
  },

  async getByMonth(month: number, year: number): Promise<Activity[]> {
    const client = getAwsDataClient() as any;
    const data = await listModel<any>(client.models.Activity, {
      month: { eq: month },
      year: { eq: year },
    });
    const mapped = await Promise.all(data.map(attachActivityChildren));
    return mapped.sort((a, b) => a.date.localeCompare(b.date));
  },

  async getByDateRange(startDate: string, endDate: string): Promise<Activity[]> {
    const client = getAwsDataClient() as any;
    const data = await listModel<any>(client.models.Activity, {
      date: { between: [startDate, endDate] },
    });
    const mapped = await Promise.all(data.map(attachActivityChildren));
    return mapped.sort((a, b) => a.date.localeCompare(b.date));
  },

  async create(activity: Omit<Activity, 'id' | 'createdAt' | 'updatedAt'>): Promise<Activity> {
    const client = getAwsDataClient() as any;
    const created = await client.models.Activity.create({
      expertId: activity.expertId,
      expertName: activity.expertName,
      date: activity.date,
      year: yearFromDate(activity.date),
      month: monthFromDate(activity.date),
      hours: activity.hours,
      activityType: activity.activityType,
      saCode: activity.saCode,
      catalogActivityId: activity.catalogActivityId,
      title: activity.title,
      description: activity.description,
      location: activity.location,
      dayType: activity.dayType,
      workingGroupId: activity.workingGroupId,
      status: activity.status ?? 'draft',
      pmNotes: activity.pmNotes,
    });
    assertNoErrors(created, 'AWS create activity');

    const activityId = created.data.id;
    await Promise.all([
      ...(activity.deliverables ?? []).map((deliverable) =>
        client.models.Deliverable.create({
          activityId,
          fileName: deliverable.fileName,
          fileType: deliverable.fileType,
          fileSize: deliverable.fileSize,
          filePath: deliverable.filePath,
          uploadedAt: deliverable.uploadedAt ?? new Date().toISOString(),
        }),
      ),
      ...(activity.grupTinta ?? []).map((entry) =>
        client.models.GrupTintaEntry.create({
          expertId: activity.expertId,
          activityId,
          date: entry.date,
          year: entry.year,
          month: entry.month,
          activityType: entry.activityType,
          organizations: entry.organizations ?? [],
          participantsCount: entry.participantsCount ?? 0,
          notes: entry.notes,
        }),
      ),
    ]);

    return attachActivityChildren(created.data);
  },

  async createBatch(activities: Omit<Activity, 'id' | 'createdAt' | 'updatedAt'>[]): Promise<Activity[]> {
    const created: Activity[] = [];
    for (const activity of activities) {
      created.push(await activitiesService.create(activity));
    }
    return created;
  },

  async update(id: string, updates: Partial<Activity>): Promise<void> {
    const client = getAwsDataClient() as any;
    const result = await client.models.Activity.update({
      id,
      hours: updates.hours,
      activityType: updates.activityType,
      saCode: updates.saCode,
      title: updates.title,
      description: updates.description,
      location: updates.location,
      dayType: updates.dayType,
      status: updates.status,
      pmNotes: updates.pmNotes,
    });
    assertNoErrors(result, 'AWS update activity');
  },

  async delete(id: string): Promise<void> {
    const client = getAwsDataClient() as any;
    const result = await client.models.Activity.delete({ id });
    assertNoErrors(result, 'AWS delete activity');
  },

  async deleteByDates(expertId: string, dates: string[]): Promise<void> {
    const entries = await activitiesService.getByExpert(expertId);
    await Promise.all(entries.filter((entry) => dates.includes(entry.date)).map((entry) => activitiesService.delete(entry.id)));
  },
};

export const verificationsService = {
  async getAll(): Promise<VerificationData[]> {
    const client = getAwsDataClient() as any;
    const data = await listModel<any>(client.models.Verification);
    return data.map(mapVerification);
  },

  async getByExpertAndMonth(expertId: string, month: string, year: string): Promise<VerificationData | null> {
    const client = getAwsDataClient() as any;
    const data = await listModel<any>(client.models.Verification, {
      expertId: { eq: expertId },
      month: { eq: month },
      year: { eq: year },
    });
    return data[0] ? mapVerification(data[0]) : null;
  },

  async create(verification: Omit<VerificationData, 'id'>): Promise<VerificationData> {
    const client = getAwsDataClient() as any;
    const result = await client.models.Verification.create({
      expertId: verification.expertId,
      expertName: verification.expertName,
      month: verification.month,
      year: verification.year,
      status: verification.status,
      notes: verification.notes,
    });
    assertNoErrors(result, 'AWS create verification');
    return mapVerification(result.data);
  },

  async update(id: string, updates: Partial<VerificationData>): Promise<void> {
    const client = getAwsDataClient() as any;
    const result = await client.models.Verification.update({
      id,
      status: updates.status,
      notes: updates.notes,
    });
    assertNoErrors(result, 'AWS update verification');
  },

  async delete(id: string): Promise<void> {
    const client = getAwsDataClient() as any;
    const result = await client.models.Verification.delete({ id });
    assertNoErrors(result, 'AWS delete verification');
  },
};

function mapVerification(item: any): VerificationData {
  return {
    id: item.id,
    expertId: item.expertId,
    expertName: item.expertName ?? undefined,
    month: item.month,
    year: item.year,
    status: item.status ?? 'pending',
    notes: item.notes ?? undefined,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export const neconformitatiService = {
  async getByVerification(verificationId: string): Promise<Neconformitate[]> {
    const client = getAwsDataClient() as any;
    const data = await listModel<any>(client.models.Neconformitate, { verificationId: { eq: verificationId } });
    return data.map(mapNeconformitate);
  },

  async create(neconformitate: Omit<Neconformitate, 'id' | 'createdAt'>): Promise<Neconformitate> {
    const client = getAwsDataClient() as any;
    const result = await client.models.Neconformitate.create({
      verificationId: neconformitate.verificationId,
      type: neconformitate.type,
      severity: neconformitate.severity,
      description: neconformitate.description,
      affectedDate: neconformitate.affectedDate,
      affectedExpertId: neconformitate.affectedExpertId,
      resolved: false,
    });
    assertNoErrors(result, 'AWS create neconformitate');
    return mapNeconformitate(result.data);
  },

  async resolve(id: string, resolution: string): Promise<void> {
    const client = getAwsDataClient() as any;
    const result = await client.models.Neconformitate.update({
      id,
      resolved: true,
      resolution,
      resolvedAt: new Date().toISOString(),
    });
    assertNoErrors(result, 'AWS resolve neconformitate');
  },

  async delete(id: string): Promise<void> {
    const client = getAwsDataClient() as any;
    const result = await client.models.Neconformitate.delete({ id });
    assertNoErrors(result, 'AWS delete neconformitate');
  },
};

function mapNeconformitate(item: any): Neconformitate {
  return {
    id: item.id,
    verificationId: item.verificationId ?? undefined,
    type: item.type,
    severity: item.severity,
    description: item.description,
    affectedDate: item.affectedDate ?? undefined,
    affectedExpertId: item.affectedExpertId ?? undefined,
    resolved: item.resolved ?? false,
    resolution: item.resolution ?? undefined,
    resolvedAt: item.resolvedAt ?? undefined,
    createdAt: item.createdAt,
  };
}

export const notesService = {
  async getByVerification(verificationId: string): Promise<VerificationNote[]> {
    const client = getAwsDataClient() as any;
    const data = await listModel<any>(client.models.VerificationNote, { verificationId: { eq: verificationId } });
    return data.map(mapVerificationNote);
  },

  async create(note: Omit<VerificationNote, 'id' | 'createdAt' | 'updatedAt'>): Promise<VerificationNote> {
    const client = getAwsDataClient() as any;
    const result = await client.models.VerificationNote.create({
      verificationId: note.verificationId,
      content: note.content,
      category: note.category,
      authorId: note.authorId,
      authorName: note.authorName,
    });
    assertNoErrors(result, 'AWS create note');
    return mapVerificationNote(result.data);
  },

  async update(id: string, content: string): Promise<void> {
    const client = getAwsDataClient() as any;
    const result = await client.models.VerificationNote.update({ id, content });
    assertNoErrors(result, 'AWS update note');
  },

  async delete(id: string): Promise<void> {
    const client = getAwsDataClient() as any;
    const result = await client.models.VerificationNote.delete({ id });
    assertNoErrors(result, 'AWS delete note');
  },
};

function mapVerificationNote(item: any): VerificationNote {
  return {
    id: item.id,
    verificationId: item.verificationId ?? undefined,
    content: item.content,
    category: item.category ?? '',
    authorId: item.authorId ?? undefined,
    authorName: item.authorName ?? undefined,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

const localSettings = {
  get(key: string) {
    if (typeof window === 'undefined') return '';
    return window.localStorage.getItem(`peo_setting_${key}`) ?? '';
  },
  set(key: string, value: string) {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(`peo_setting_${key}`, value);
    }
  },
};

export const settingsService = {
  async get(): Promise<AppSettings> {
    return {
      claudeApiKey: localSettings.get('claude_api_key'),
      projectCode: localSettings.get('project_code') || '302141',
      projectTitle: localSettings.get('project_title') || 'Proiect PEO',
      contractNumber: localSettings.get('contract_number'),
      experts: [],
    };
  },

  async save(key: string, value: string): Promise<void> {
    localSettings.set(key, value);
  },

  async setApiKey(apiKey: string): Promise<void> {
    localSettings.set('claude_api_key', apiKey);
  },

  async getApiKey(): Promise<string> {
    return localSettings.get('claude_api_key');
  },
};

export const activityCatalogService = {
  async getAll(): Promise<ActivityCatalog[]> {
    const client = getAwsDataClient() as any;
    const data = await listModel<any>(client.models.ActivityCatalog);
    return data.map(mapActivityCatalog).sort((a, b) => `${a.saCode}-${a.activityNumber}`.localeCompare(`${b.saCode}-${b.activityNumber}`));
  },

  async getBySaCode(saCode: string): Promise<ActivityCatalog[]> {
    const client = getAwsDataClient() as any;
    const data = await listModel<any>(client.models.ActivityCatalog, { saCode: { eq: saCode } });
    return data.map(mapActivityCatalog).sort((a, b) => (a.activityNumber ?? 0) - (b.activityNumber ?? 0));
  },
};

function mapActivityCatalog(item: any): ActivityCatalog {
  return {
    id: item.id,
    category: item.category,
    saCode: item.saCode,
    serviceCategory: item.serviceCategory ?? '',
    activityNumber: item.activityNumber ?? 0,
    activityName: item.activityName,
    description: item.description ?? undefined,
    objectives: item.objectives ?? undefined,
    serviceComponent: item.serviceComponent ?? undefined,
    beneficiaries: item.beneficiaries ?? undefined,
    expectedResults: item.expectedResults ?? undefined,
    deliverables: item.deliverables ?? undefined,
    indicators: item.indicators ?? undefined,
    createdAt: item.createdAt,
  };
}

export const workingGroupsService = {
  async getAll(): Promise<WorkingGroup[]> {
    const client = getAwsDataClient() as any;
    const data = await listModel<any>(client.models.WorkingGroup, { isActive: { ne: false } });
    return data.map(mapWorkingGroup).sort((a, b) => `${a.type}-${a.name}`.localeCompare(`${b.type}-${b.name}`));
  },

  async getByType(type: string): Promise<WorkingGroup[]> {
    const client = getAwsDataClient() as any;
    const data = await listModel<any>(client.models.WorkingGroup, {
      type: { eq: type },
      isActive: { ne: false },
    });
    return data.map(mapWorkingGroup).sort((a, b) => a.name.localeCompare(b.name));
  },
};

function mapWorkingGroup(item: any): WorkingGroup {
  return {
    id: item.id,
    name: item.name,
    type: item.type,
    email: item.email ?? undefined,
    isActive: item.isActive ?? true,
    saCode: item.saCode ?? undefined,
    notes: item.notes ?? undefined,
    createdAt: item.createdAt,
  };
}

export const concurrentProjectsService = {
  async getByExpert(expertId: string): Promise<ConcurrentProject[]> {
    const client = getAwsDataClient() as any;
    const data = await listModel<any>(client.models.ConcurrentProject, {
      expertId: { eq: expertId },
      isActive: { ne: false },
    });
    return data.map(mapConcurrentProject);
  },

  async create(project: Omit<ConcurrentProject, 'id'>): Promise<ConcurrentProject> {
    const client = getAwsDataClient() as any;
    const result = await client.models.ConcurrentProject.create({
      expertId: project.expertId,
      projectName: project.projectName,
      projectCode: project.projectCode,
      fundingSource: project.fundingSource,
      dailyHours: project.dailyHours,
      startDate: project.startDate,
      endDate: project.endDate,
      isActive: project.isActive ?? true,
      notes: project.notes,
    });
    assertNoErrors(result, 'AWS create concurrent project');
    return mapConcurrentProject(result.data);
  },

  async delete(id: string): Promise<void> {
    const client = getAwsDataClient() as any;
    const result = await client.models.ConcurrentProject.delete({ id });
    assertNoErrors(result, 'AWS delete concurrent project');
  },
};

function mapConcurrentProject(item: any): ConcurrentProject {
  return {
    id: item.id,
    expertId: item.expertId,
    projectName: item.projectName,
    projectCode: item.projectCode ?? undefined,
    fundingSource: item.fundingSource ?? undefined,
    dailyHours: item.dailyHours,
    startDate: item.startDate,
    endDate: item.endDate ?? undefined,
    isActive: item.isActive ?? true,
    notes: item.notes ?? undefined,
    createdAt: item.createdAt,
  };
}

export const reportStatusService = {
  async getByExpertAndMonth(expertId: string, month: number, year: number): Promise<ReportStatus | null> {
    const client = getAwsDataClient() as any;
    const data = await listModel<any>(client.models.ReportStatus, {
      expertId: { eq: expertId },
      month: { eq: month },
      year: { eq: year },
    });
    return data[0] ? mapReportStatus(data[0]) : null;
  },

  async getAllByMonth(month: number, year: number): Promise<ReportStatus[]> {
    const client = getAwsDataClient() as any;
    const data = await listModel<any>(client.models.ReportStatus, {
      month: { eq: month },
      year: { eq: year },
    });
    return data.map(mapReportStatus);
  },

  async upsert(status: Omit<ReportStatus, 'id'>): Promise<ReportStatus> {
    const client = getAwsDataClient() as any;
    const existing = await reportStatusService.getByExpertAndMonth(status.expertId, status.month, status.year);
    const payload = {
      expertId: status.expertId,
      year: status.year,
      month: status.month,
      status: status.status,
      sentDate: status.sentDate,
      approvalDate: status.approvalDate,
      pmNotes: status.pmNotes,
    };
    const result = existing
      ? await client.models.ReportStatus.update({ id: existing.id, ...payload })
      : await client.models.ReportStatus.create(payload);
    assertNoErrors(result, 'AWS upsert report status');
    return mapReportStatus(result.data);
  },
};

function mapReportStatus(item: any): ReportStatus {
  return {
    id: item.id,
    expertId: item.expertId,
    year: item.year,
    month: item.month,
    status: item.status,
    sentDate: item.sentDate ?? undefined,
    approvalDate: item.approvalDate ?? undefined,
    pmNotes: item.pmNotes ?? undefined,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export const grupTintaService = {
  async getByExpertAndMonth(expertId: string, month: number, year: number): Promise<GrupTintaEntry[]> {
    const client = getAwsDataClient() as any;
    const data = await listModel<any>(client.models.GrupTintaEntry, {
      expertId: { eq: expertId },
      month: { eq: month },
      year: { eq: year },
    });
    return data.map(mapGrupTinta);
  },

  async create(entry: Omit<GrupTintaEntry, 'id'>): Promise<GrupTintaEntry> {
    const client = getAwsDataClient() as any;
    const result = await client.models.GrupTintaEntry.create({
      expertId: entry.expertId,
      activityId: entry.activityId,
      date: entry.date,
      year: entry.year,
      month: entry.month,
      activityType: entry.activityType,
      organizations: entry.organizations ?? [],
      participantsCount: entry.participantsCount ?? 0,
      notes: entry.notes,
    });
    assertNoErrors(result, 'AWS create grup tinta entry');
    return mapGrupTinta(result.data);
  },

  async delete(id: string): Promise<void> {
    const client = getAwsDataClient() as any;
    const result = await client.models.GrupTintaEntry.delete({ id });
    assertNoErrors(result, 'AWS delete grup tinta entry');
  },

  async getMonthlyStats(month: number, year: number): Promise<{ expertId: string; totalParticipants: number; sessionsCount: number }[]> {
    const client = getAwsDataClient() as any;
    const data = await listModel<any>(client.models.GrupTintaEntry, {
      month: { eq: month },
      year: { eq: year },
    });
    const stats = new Map<string, { totalParticipants: number; sessionsCount: number }>();
    data.forEach((entry) => {
      const existing = stats.get(entry.expertId) ?? { totalParticipants: 0, sessionsCount: 0 };
      existing.totalParticipants += entry.participantsCount ?? 0;
      existing.sessionsCount += 1;
      stats.set(entry.expertId, existing);
    });
    return Array.from(stats.entries()).map(([expertId, stat]) => ({ expertId, ...stat }));
  },
};
