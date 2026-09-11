import { Injectable } from '@angular/core';
import { OrgChartNode } from '../models/org-chart.models';

export abstract class TeamsLinkProvider {
  abstract getTeamsUrl(identity: OrgChartNode): string | undefined;
}

/**
 * Uses only an explicitly supplied Microsoft Teams URL. It intentionally does
 * not infer an Entra identity from an ISC id or email address.
 */
@Injectable({ providedIn: 'root' })
export class TeamsLinkService extends TeamsLinkProvider {
  getTeamsUrl(identity: OrgChartNode): string | undefined {
    const value = identity.teamsUrl?.trim();
    if (!value) {
      return undefined;
    }

    try {
      const url = new URL(value);
      const isTeamsHost =
        url.hostname === 'teams.microsoft.com' ||
        url.hostname.endsWith('.teams.microsoft.com');
      return url.protocol === 'https:' && isTeamsHost
        ? url.toString()
        : undefined;
    } catch {
      return undefined;
    }
  }
}
