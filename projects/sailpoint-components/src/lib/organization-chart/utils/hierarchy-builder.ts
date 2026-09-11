import {
  OrgChartNode,
  OrganizationHierarchy,
} from '../models/org-chart.models';

/**
 * Builds an organization hierarchy without mutating the normalized records.
 * Cycles and self-managed identities are excluded from the valid tree.
 */
export function buildOrganizationHierarchy(
  records: ReadonlyArray<OrgChartNode>
): OrganizationHierarchy {
  const nodes = new Map<string, OrgChartNode>();

  for (const record of records) {
    if (!record.id || nodes.has(record.id)) {
      continue;
    }
    nodes.set(record.id, { ...record, children: [] });
  }

  const invalidIds = findInvalidRelationshipIds(nodes);
  const directReportCounts = new Map<string, number>();
  for (const node of nodes.values()) {
    if (
      node.managerId &&
      node.managerId !== node.id &&
      nodes.has(node.managerId)
    ) {
      directReportCounts.set(
        node.managerId,
        (directReportCounts.get(node.managerId) ?? 0) + 1
      );
    }
  }
  const roots: OrgChartNode[] = [];
  const orphaned: OrgChartNode[] = [];
  const invalid: OrgChartNode[] = [];

  for (const node of nodes.values()) {
    if (invalidIds.has(node.id)) {
      invalid.push(node);
      continue;
    }

    if (!node.managerId) {
      roots.push(node);
      continue;
    }

    const manager = nodes.get(node.managerId);
    if (!manager) {
      orphaned.push(node);
      continue;
    }

    if (invalidIds.has(manager.id)) {
      orphaned.push(node);
      continue;
    }

    manager.children.push(node);
  }

  const byName = (a: OrgChartNode, b: OrgChartNode) =>
    a.name.localeCompare(b.name);
  for (const node of nodes.values()) {
    node.children.sort(byName);
    node.reportCount = directReportCounts.get(node.id) ?? 0;
  }

  roots.sort(byName);
  orphaned.sort(byName);
  invalid.sort(byName);

  return { roots, orphaned, invalid };
}

function findInvalidRelationshipIds(
  nodes: ReadonlyMap<string, OrgChartNode>
): Set<string> {
  const invalid = new Set<string>();
  const processed = new Set<string>();

  for (const id of nodes.keys()) {
    if (processed.has(id)) {
      continue;
    }

    const path: string[] = [];
    const pathIndex = new Map<string, number>();
    let currentId: string | undefined = id;

    while (currentId && nodes.has(currentId) && !processed.has(currentId)) {
      const cycleStart = pathIndex.get(currentId);
      if (cycleStart !== undefined) {
        for (let index = cycleStart; index < path.length; index++) {
          invalid.add(path[index]);
        }
        break;
      }

      pathIndex.set(currentId, path.length);
      path.push(currentId);
      currentId = nodes.get(currentId)?.managerId;
    }

    path.forEach((pathId) => processed.add(pathId));
  }

  return invalid;
}
