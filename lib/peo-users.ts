import type { Expert } from './types';

export type PeoUserRole = 'expert' | 'pm' | 'admin';

export type PeoUser = {
  id: string;
  name: string;
  projectRole: string;
  email: string;
  category: string;
  norma: number;
  normType?: string;
  saCodes: string[];
  roles: PeoUserRole[];
};

export const peoUsers: PeoUser[] = [
  {
    id: 'andreea-cojocaru',
    name: 'Andreea Cojocaru',
    projectRole: 'Expert Afaceri Publice',
    email: 'andreea.cojocaru@confederatia-concordia.ro',
    category: 'ap',
    norma: 6,
    saCodes: ['SA3.2', 'SA3.4', 'SA3.5'],
    roles: ['expert'],
  },
  {
    id: 'bianca-toma',
    name: 'Bianca Toma',
    projectRole: 'Expert Afaceri Publice',
    email: 'bianca.toma@confederatia-concordia.ro',
    category: 'ap',
    norma: 4,
    saCodes: ['SA3.2', 'SA3.4', 'SA3.5'],
    roles: ['expert'],
  },
  {
    id: 'alexandru-enache',
    name: 'Alexandru Enache',
    projectRole: 'Coordonator Business Hub',
    email: 'alexandru.enache@confederatia-concordia.ro',
    category: 'bh',
    norma: 8,
    saCodes: ['SA3.2'],
    roles: ['expert'],
  },
  {
    id: 'alexandra-colceru',
    name: 'Alexandra Colceru',
    projectRole: 'Responsabil Informare si Comunicare',
    email: 'alexandra.colceru@confederatia-concordia.ro',
    category: 'com',
    norma: 8,
    saCodes: ['SA3.2', 'SA3.3', 'SA3.4'],
    roles: ['expert'],
  },
  {
    id: 'gabriel-zvinca',
    name: 'Gabriel Zvinca',
    projectRole: 'Responsabil Afaceri Publice',
    email: 'gabriel.zvinca@confederatia-concordia.ro',
    category: 'ap',
    norma: 4,
    saCodes: ['SA3.2', 'SA3.4', 'SA3.5'],
    roles: ['expert'],
  },
  {
    id: 'irina-nicolae',
    name: 'Irina Nicolae',
    projectRole: 'Coordonator Centre Regionale',
    email: 'irina.nicolae@confederatia-concordia.ro',
    category: 'cr',
    norma: 8,
    saCodes: ['SA3.2', 'SA3.3', 'SA3.4'],
    roles: ['expert'],
  },
  {
    id: 'liviu-neagu',
    name: 'Liviu Neagu',
    projectRole: 'Expert Cercetare si Analize',
    email: 'liviu.neagu@confederatia-concordia.ro',
    category: 'cercetare',
    norma: 8,
    saCodes: ['SA2.1', 'SA2.2'],
    roles: ['expert'],
  },
  {
    id: 'radu-ianos',
    name: 'Radu Ianos',
    projectRole: 'Expert Afaceri Publice',
    email: 'radu.ianos@confederatia-concordia.ro',
    category: 'ap',
    norma: 6,
    saCodes: ['SA3.2', 'SA3.4', 'SA3.5'],
    roles: ['expert'],
  },
  {
    id: 'roxana-ivanov',
    name: 'Roxana Ivanov',
    projectRole: 'Expert Recrutare si Selectie GT',
    email: 'roxana.ivanov@confederatia-concordia.ro',
    category: 'gt',
    norma: 8,
    saCodes: ['SA1.1'],
    roles: ['expert', 'pm', 'admin'],
  },
  {
    id: 'dan-zaharia',
    name: 'Dan Zaharia',
    projectRole: 'Responsabil Centre Regionale',
    email: 'dan.zaharia@confederatia-concordia.ro',
    category: 'cr',
    norma: 8,
    saCodes: ['SA3.2', 'SA3.3', 'SA3.4'],
    roles: ['expert'],
  },
  {
    id: 'simona-khamissi',
    name: 'Simona Khamissi',
    projectRole: 'Expert Protectia Datelor',
    email: 'simona.khamissi@confederatia-concordia.ro',
    category: 'gdpr',
    norma: 4,
    saCodes: ['SA1.1'],
    roles: ['expert'],
  },
  {
    id: 'nida-halit',
    name: 'Nida Halit',
    projectRole: 'Expert Informare si Comunicare',
    email: 'nida.halit@confederatia-concordia.ro',
    category: 'com',
    norma: 8,
    saCodes: ['SA3.2', 'SA3.3', 'SA3.4'],
    roles: ['expert'],
  },
  {
    id: 'mihaela-grigoras',
    name: 'Mihaela Grigoras',
    projectRole: 'Manager Proiect',
    email: 'mihaela.grigoras@confederatia-concordia.ro',
    category: 'PM',
    norma: 8,
    saCodes: ['SA6.1'],
    roles: ['pm'],
  },
];

export const peoExpertUsers = peoUsers.filter((user) => user.roles.includes('expert'));

export function peoUsersAsExperts(): Expert[] {
  const now = new Date().toISOString();

  return peoExpertUsers.map((user) => ({
    id: user.id,
    name: user.name,
    role: user.roles.includes('expert') && user.roles.includes('pm') ? 'Expert/PM' : user.roles.includes('pm') ? 'PM' : 'Expert',
    email: user.email,
    category: user.category,
    norma: user.norma,
    normType: user.normType ?? 'normă calculată din zile lucrătoare × ore/zi',
    oreZi: user.norma,
    dailyHours: user.norma,
    positionInProject: user.projectRole,
    projectCode: '302141',
    projectTitle: 'Consolidarea capacității Concordia pentru dialog social',
    saCodes: user.saCodes,
    hasPmAccess: user.roles.includes('pm') || user.roles.includes('admin'),
    cognitoGroups: user.roles,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  }));
}
