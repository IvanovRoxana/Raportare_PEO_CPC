import type { GTEntity, Organization } from './types.ts';

export function getCpcAffiliatedOrganizations(organizations: Organization[]) {
  return organizations
    .filter((organization) => organization.sourceSheet === 'CPC ALL')
    .sort((a, b) => a.name.localeCompare(b.name, 'ro'));
}

export function getChildOrganizations(parent: Organization | undefined, organizations: Organization[]) {
  if (!parent) return [];
  const parentName = parent.name;
  const normalizedParentName = parent.normalizedName;

  return organizations
    .filter((organization) => {
      if (organization.id === parent.id) return false;
      if (organization.parentOrganizationId === parent.id) return true;
      if (organization.federationName === parentName || organization.patronalOrganizationName === parentName) return true;
      return (
        organization.federationName && organization.federationName.toLowerCase() === normalizedParentName
      ) || (
        organization.patronalOrganizationName && organization.patronalOrganizationName.toLowerCase() === normalizedParentName
      );
    })
    .sort((a, b) => String(a.kind).localeCompare(String(b.kind), 'ro') || a.name.localeCompare(b.name, 'ro'));
}

export function getGTEntityForOrganization(organizationId: string | undefined, entities: GTEntity[]) {
  if (!organizationId) return undefined;
  return entities.find((entity) => entity.organizationId === organizationId);
}

export function canCreateGTEntityFromOrganization(organization: Organization | undefined, entities: GTEntity[]) {
  return Boolean(organization && !getGTEntityForOrganization(organization.id, entities));
}
