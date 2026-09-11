import { Injectable } from '@angular/core';
import { OrgChartNode } from '../models/org-chart.models';

export abstract class ProfilePhotoProvider {
  abstract getPhotoUrl(identity: OrgChartNode): string | undefined;
}

/**
 * Default provider for photo URLs already present in authorized ISC data.
 * A Graph-backed provider can replace this service later without changing UI.
 */
@Injectable({ providedIn: 'root' })
export class ProfilePhotoService extends ProfilePhotoProvider {
  getPhotoUrl(identity: OrgChartNode): string | undefined {
    const value = identity.photoUrl?.trim();
    if (!value) {
      return undefined;
    }

    try {
      const url = new URL(value);
      return url.protocol === 'https:' ? url.toString() : undefined;
    } catch {
      return undefined;
    }
  }

  getInitials(identity: Pick<OrgChartNode, 'firstName' | 'lastName' | 'name'>): string {
    const explicit = [identity.firstName, identity.lastName]
      .filter((part): part is string => Boolean(part?.trim()))
      .map((part) => part.trim().charAt(0));

    if (explicit.length > 0) {
      return explicit.slice(0, 2).join('').toUpperCase();
    }

    return identity.name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0))
      .join('')
      .toUpperCase();
  }
}
