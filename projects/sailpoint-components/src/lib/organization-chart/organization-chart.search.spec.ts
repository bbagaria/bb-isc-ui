import { OrgChartNode } from './models/org-chart.models';
import { searchOrganizationIdentities } from './organization-chart.component';

const people: OrgChartNode[] = [
  {
    id: '1',
    name: 'Priya Sharma',
    firstName: 'Priya',
    lastName: 'Sharma',
    title: 'VP, Engineering',
    department: 'Technology',
    email: 'priya@example.com',
    reportCount: 0,
    children: [],
  },
  {
    id: '2',
    name: 'Michael Brown',
    firstName: 'Michael',
    lastName: 'Brown',
    title: 'Finance Director',
    department: 'Finance',
    reportCount: 0,
    children: [],
  },
];

describe('searchOrganizationIdentities', () => {
  it('matches first name', () => {
    expect(searchOrganizationIdentities(people, 'Priya')[0].id).toBe('1');
  });

  it('matches last name', () => {
    expect(searchOrganizationIdentities(people, 'brown')[0].id).toBe('2');
  });

  it('matches a full name regardless of case', () => {
    expect(searchOrganizationIdentities(people, 'PRIYA SHARMA')[0].id).toBe('1');
  });

  it('matches title and department', () => {
    expect(searchOrganizationIdentities(people, 'engineering technology')[0].id)
      .toBe('1');
    expect(searchOrganizationIdentities(people, 'finance director')[0].id)
      .toBe('2');
  });

  it('returns no results for an unmatched query', () => {
    expect(searchOrganizationIdentities(people, 'legal')).toEqual([]);
  });
});
