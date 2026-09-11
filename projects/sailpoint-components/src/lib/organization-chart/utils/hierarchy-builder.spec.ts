import { OrgChartNode } from '../models/org-chart.models';
import { buildOrganizationHierarchy } from './hierarchy-builder';

const identity = (
  id: string,
  managerId?: string,
  extra: Partial<OrgChartNode> = {}
): OrgChartNode => ({
  id,
  name: id,
  managerId,
  reportCount: 0,
  children: [],
  ...extra,
});

describe('buildOrganizationHierarchy', () => {
  it('builds a simple hierarchy and direct report counts', () => {
    const result = buildOrganizationHierarchy([
      identity('ceo'),
      identity('vp', 'ceo'),
      identity('employee', 'vp'),
    ]);

    expect(result.roots.map((node) => node.id)).toEqual(['ceo']);
    expect(result.roots[0].children.map((node) => node.id)).toEqual(['vp']);
    expect(result.roots[0].children[0].children[0].id).toBe('employee');
    expect(result.roots[0].reportCount).toBe(1);
  });

  it('supports multiple roots', () => {
    const result = buildOrganizationHierarchy([
      identity('second-root'),
      identity('first-root'),
    ]);

    expect(result.roots.map((node) => node.id)).toEqual([
      'first-root',
      'second-root',
    ]);
  });

  it('classifies an identity whose manager is missing as orphaned', () => {
    const result = buildOrganizationHierarchy([
      identity('employee', 'not-returned'),
    ]);

    expect(result.orphaned.map((node) => node.id)).toEqual(['employee']);
    expect(result.roots).toEqual([]);
  });

  it('classifies a self-managed identity as invalid', () => {
    const result = buildOrganizationHierarchy([identity('person', 'person')]);

    expect(result.invalid.map((node) => node.id)).toEqual(['person']);
    expect(result.invalid[0].reportCount).toBe(0);
  });

  it('detects every member of a circular manager relationship', () => {
    const result = buildOrganizationHierarchy([
      identity('a', 'b'),
      identity('b', 'c'),
      identity('c', 'a'),
    ]);

    expect(result.invalid.map((node) => node.id)).toEqual(['a', 'b', 'c']);
    expect(result.invalid.every((node) => node.reportCount === 1)).toBe(true);
    expect(result.roots).toEqual([]);
  });

  it('handles missing optional attributes without changing the input', () => {
    const source = identity('person');
    const result = buildOrganizationHierarchy([source]);

    expect(result.roots[0].id).toBe('person');
    expect(result.roots[0].name).toBe('person');
    expect(result.roots[0].children).toEqual([]);
    expect(source.children).toEqual([]);
  });
});
