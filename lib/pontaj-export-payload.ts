import type { ExportPayload } from './pontaj-excel-export';
import type { Activity, ConcurrentProject, ConcurrentProjectTimesheetEntry, Expert } from './types';

type BuildPontajExportPayloadInput = {
  kind: ExportPayload['kind'];
  expert: Expert;
  activities: Activity[];
  concurrentProjects?: ConcurrentProject[];
  concurrentTimesheetEntries?: ConcurrentProjectTimesheetEntry[];
  month: number;
  year: number;
};

export function buildPontajExportPayload({
  kind,
  expert,
  activities,
  concurrentProjects = [],
  concurrentTimesheetEntries = [],
  month,
  year,
}: BuildPontajExportPayloadInput): ExportPayload {
  return {
    kind,
    expert: {
      id: expert.id,
      name: expert.name,
      role: expert.role,
      category: expert.category,
      norma: expert.norma,
      normType: expert.normType,
      oreZi: expert.oreZi,
      dailyHours: expert.dailyHours,
      positionInProject: expert.positionInProject,
      projectCode: expert.projectCode,
      projectTitle: expert.projectTitle,
      beneficiary: expert.beneficiary,
      saCodes: expert.saCodes,
    },
    activities: activities.map((activity) => ({
      id: activity.id,
      date: activity.date,
      hours: activity.hours,
      activityType: limitText(activity.activityType, 300),
      saCode: activity.saCode,
      title: limitText(activity.title, 300),
      description: limitText(activity.description, 2000),
      status: activity.status,
      deliverables: activity.deliverables?.map((deliverable) => ({
        id: deliverable.id,
        fileName: limitText(deliverable.fileName, 300),
        fileType: deliverable.fileType,
        fileSize: deliverable.fileSize,
        declaredTitle: limitText(deliverable.declaredTitle, 300),
        docTitle: limitText(deliverable.docTitle, 300),
      })),
    })),
    concurrentProjects: concurrentProjects.map((project) => ({
      id: project.id,
      projectName: project.projectName,
      projectCode: project.projectCode,
      dailyHours: project.dailyHours,
      startDate: project.startDate,
      endDate: project.endDate,
      isActive: project.isActive,
    })),
    concurrentTimesheetEntries: concurrentTimesheetEntries.map((entry) => ({
      id: entry.id,
      concurrentProjectId: entry.concurrentProjectId,
      expertId: entry.expertId,
      date: entry.date,
      month: entry.month,
      year: entry.year,
      wp: limitText(entry.wp, 100),
      hours: entry.hours,
      taskName: limitText(entry.taskName, 500),
      relevantDeliverable: limitText(entry.relevantDeliverable, 500),
      dayType: entry.dayType,
      status: entry.status,
      source: entry.source,
    })),
    month,
    year,
  };
}

function limitText(value: string | undefined, maxLength: number) {
  if (!value) return value;
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}
