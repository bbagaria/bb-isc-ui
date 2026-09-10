import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import type { Identity } from 'sailpoint-api-client/dist/identities/api';
import { SailPointSDKService } from '../../sailpoint-sdk.service';
import {
  DEFAULT_ORG_CHART_FIELDS,
  OrgChartFieldConfig,
  OrgChartNode,
} from '../models/org-chart.models';

type IdentityRecord = Identity & {
  firstName?: string;
  lastName?: string;
  title?: string;
  department?: string;
  location?: string;
  phone?: string;
  phoneNumber?: string;
  photoUrl?: string;
  teamsUrl?: string;
};

@Injectable({ providedIn: 'root' })
export class IdentityDataService {
  private readonly batchSize = 250;
  private readonly parallelRequests = 4;
  private readonly loadingSubject = new BehaviorSubject(false);
  private readonly errorSubject = new BehaviorSubject<string | null>(null);
  private readonly loadedCountSubject = new BehaviorSubject(0);

  readonly loading$ = this.loadingSubject.asObservable();
  readonly error$ = this.errorSubject.asObservable();
  readonly loadedCount$ = this.loadedCountSubject.asObservable();

  constructor(private readonly sdk: SailPointSDKService) {}

  async loadIdentities(
    fields: ReadonlyArray<OrgChartFieldConfig> = DEFAULT_ORG_CHART_FIELDS
  ): Promise<OrgChartNode[]> {
    this.loadingSubject.next(true);
    this.errorSubject.next(null);
    this.loadedCountSubject.next(0);

    try {
      const firstResponse = await this.sdk.listIdentitiesV1({
        limit: this.batchSize,
        offset: 0,
        count: true,
      });
      const all = [...(firstResponse.data ?? [])];
      this.loadedCountSubject.next(all.length);

      const totalCount = this.getTotalCount(firstResponse.headers);
      if (totalCount !== undefined) {
        const requests: number[] = [];
        for (
          let offset = this.batchSize;
          offset < totalCount;
          offset += this.batchSize
        ) {
          requests.push(offset);
        }

        for (
          let start = 0;
          start < requests.length;
          start += this.parallelRequests
        ) {
          const offsets = requests.slice(start, start + this.parallelRequests);
          const responses = await Promise.all(
            offsets.map((offset) =>
              this.sdk.listIdentitiesV1({
                limit: this.batchSize,
                offset,
                count: false,
              })
            )
          );
          responses.forEach((response) => all.push(...(response.data ?? [])));
          this.loadedCountSubject.next(all.length);
        }
      } else if (all.length === this.batchSize) {
        await this.loadUntilComplete(all);
      }

      const unique = new Map<string, OrgChartNode>();
      for (const identity of all) {
        const normalized = this.normalizeIdentity(identity, fields);
        if (normalized) {
          unique.set(normalized.id, normalized);
        }
      }
      return [...unique.values()];
    } catch (error) {
      console.error('Unable to load organization identities', error);
      this.errorSubject.next('Unable to load organization data.');
      throw error;
    } finally {
      this.loadingSubject.next(false);
    }
  }

  normalizeIdentity(
    identity: IdentityRecord,
    fields: ReadonlyArray<OrgChartFieldConfig> = DEFAULT_ORG_CHART_FIELDS
  ): OrgChartNode | undefined {
    if (!identity.id) {
      return undefined;
    }

    const attributes = (identity.attributes ?? {}) as Record<string, unknown>;
    const configured = new Map(
      fields
        .filter((field) => field.visible)
        .map((field) => [field.label.toLowerCase(), this.readField(identity, attributes, field)])
    );

    const firstName = this.firstString(
      configured.get('first name'),
      identity.firstName,
      attributes['firstname'],
      attributes['firstName'],
      attributes['givenName']
    );
    const lastName = this.firstString(
      configured.get('last name'),
      identity.lastName,
      attributes['lastname'],
      attributes['lastName'],
      attributes['sn']
    );
    const name =
      this.firstString(identity.name, [firstName, lastName].filter(Boolean).join(' ')) ??
      identity.id;

    return {
      id: identity.id,
      name,
      firstName,
      lastName,
      title: this.firstString(
        configured.get('job title'),
        identity.title,
        attributes['jobTitle'],
        attributes['title']
      ),
      department: this.firstString(
        configured.get('department'),
        identity.department,
        attributes['department']
      ),
      location: this.firstString(
        configured.get('location'),
        identity.location,
        attributes['location'],
        attributes['city']
      ),
      email: this.firstString(
        configured.get('email'),
        identity.emailAddress,
        attributes['email'],
        attributes['emailAddress']
      ),
      phone: this.firstString(
        configured.get('phone'),
        identity.phone,
        identity.phoneNumber,
        attributes['phone'],
        attributes['telephoneNumber'],
        attributes['mobile']
      ),
      managerId: identity.managerRef?.id || undefined,
      status: this.firstString(
        identity.identityStatus,
        identity.lifecycleState?.stateName,
        attributes['cloudLifecycleState']
      ),
      photoUrl: this.firstString(
        configured.get('photo'),
        identity.photoUrl,
        attributes['photoUrl']
      ),
      teamsUrl: this.firstString(
        configured.get('microsoft teams'),
        identity.teamsUrl,
        attributes['teamsUrl']
      ),
      reportCount: 0,
      children: [],
    };
  }

  private async loadUntilComplete(all: Identity[]): Promise<void> {
    let offset = this.batchSize;
    let hasMore = true;

    while (hasMore && offset < this.batchSize * 1000) {
      const offsets = Array.from(
        { length: this.parallelRequests },
        (_, index) => offset + index * this.batchSize
      );
      const responses = await Promise.all(
        offsets.map((batchOffset) =>
          this.sdk.listIdentitiesV1({
            limit: this.batchSize,
            offset: batchOffset,
            count: false,
          })
        )
      );
      const batches = responses.map((response) => response.data ?? []);
      batches.forEach((batch) => all.push(...batch));
      this.loadedCountSubject.next(all.length);
      hasMore = batches.every((batch) => batch.length === this.batchSize);
      offset += this.batchSize * this.parallelRequests;
    }
  }

  private readField(
    identity: IdentityRecord,
    attributes: Record<string, unknown>,
    field: OrgChartFieldConfig
  ): unknown {
    return field.source === 'topLevel'
      ? (identity as unknown as Record<string, unknown>)[field.key]
      : attributes[field.key];
  }

  private firstString(...values: unknown[]): string | undefined {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
    return undefined;
  }

  private getTotalCount(headers: unknown): number | undefined {
    if (!headers || typeof headers !== 'object') {
      return undefined;
    }
    const candidate = headers as {
      get?: (name: string) => string | null;
      [key: string]: unknown;
    };
    const value =
      candidate.get?.('X-Total-Count') ??
      candidate.get?.('x-total-count') ??
      candidate['x-total-count'];
    const count = Number(value);
    return Number.isFinite(count) && count >= 0 ? count : undefined;
  }
}
