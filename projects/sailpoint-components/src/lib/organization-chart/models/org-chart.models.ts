export type OrgChartFieldSource = 'topLevel' | 'attribute';
export type OrgChartFieldTarget =
  | 'firstName'
  | 'lastName'
  | 'title'
  | 'department'
  | 'location'
  | 'email'
  | 'phone'
  | 'photoUrl'
  | 'teamsUrl';

export interface OrgChartFieldConfig {
  key: string;
  label: string;
  source: OrgChartFieldSource;
  visible: boolean;
  target?: OrgChartFieldTarget;
}

export interface OrgChartNode {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  title?: string;
  department?: string;
  location?: string;
  email?: string;
  phone?: string;
  managerId?: string;
  status?: string;
  photoUrl?: string;
  teamsUrl?: string;
  reportCount: number;
  children: OrgChartNode[];
}

export interface OrganizationHierarchy {
  roots: OrgChartNode[];
  orphaned: OrgChartNode[];
  invalid: OrgChartNode[];
}

export interface OrgChartLayoutNode {
  node: OrgChartNode;
  x: number;
  y: number;
}

export interface OrgChartConnector {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

export const DEFAULT_ORG_CHART_FIELDS: ReadonlyArray<OrgChartFieldConfig> = [
  { key: 'firstname', label: 'First name', source: 'attribute', visible: true, target: 'firstName' },
  { key: 'lastname', label: 'Last name', source: 'attribute', visible: true, target: 'lastName' },
  { key: 'jobTitle', label: 'Job title', source: 'attribute', visible: true, target: 'title' },
  { key: 'department', label: 'Department', source: 'attribute', visible: true, target: 'department' },
  { key: 'location', label: 'Location', source: 'attribute', visible: true, target: 'location' },
  { key: 'email', label: 'Email', source: 'attribute', visible: true, target: 'email' },
  { key: 'phone', label: 'Phone', source: 'attribute', visible: true, target: 'phone' },
  { key: 'photoUrl', label: 'Photo', source: 'attribute', visible: true, target: 'photoUrl' },
  { key: 'teamsUrl', label: 'Microsoft Teams', source: 'attribute', visible: true, target: 'teamsUrl' },
];
