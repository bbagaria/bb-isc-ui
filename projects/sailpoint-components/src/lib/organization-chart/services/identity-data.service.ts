import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import type { Identity } from 'sailpoint-api-client/dist/identities/api';
import { SailPointSDKService } from '../../sailpoint-sdk.service';
import {
  DEFAULT_ORG_CHART_FIELDS,
  OrgChartFieldConfig,
  OrgChartFieldTarget,
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
      const all = [...this.readIdentityBatch(firstResponse)];
      this.loadedCountSubject.next(all.length);

      const totalCount = this.getTotalCount(firstResponse.headers);
      if (totalCount !== undefined) {
        let nextOffset = this.batchSize;
        while (nextOffset < totalCount) {
          const offsets: number[] = [];
          for (
            let index = 0;
            index < this.parallelRequests && nextOffset < totalCount;
            index++, nextOffset += this.batchSize
          ) {
            offsets.push(nextOffset);
          }
          const responses = await Promise.all(
            offsets.map((offset) =>
              this.sdk.listIdentitiesV1({
                limit: this.batchSize,
                offset,
                count: false,
              })
            )
          );
          responses.forEach((response) =>
            all.push(...this.readIdentityBatch(response))
          );
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
    const configured = new Map<OrgChartFieldTarget, unknown>();
    const hidden = new Set<OrgChartFieldTarget>();
    fields.forEach((field) => {
      const target = field.target ?? this.inferTarget(field);
      if (!target) {
        return;
      }
      if (field.visible) {
        configured.set(target, this.readField(identity, attributes, field));
        hidden.delete(target);
      } else if (!configured.has(target)) {
        hidden.add(target);
      }
    });

    const firstName = this.mappedString('firstName', configured, hidden,
      configured.get('firstName'),
      identity.firstName,
      attributes['firstname'],
      attributes['firstName'],
      attributes['givenName']
    );
    const lastName = this.mappedString('lastName', configured, hidden,
      configured.get('lastName'),
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
      title: this.mappedString('title', configured, hidden,
        configured.get('title'),
        identity.title,
        attributes['jobTitle'],
        attributes['title']
      ),
      department: this.mappedString('department', configured, hidden,
        configured.get('department'),
        identity.department,
        attributes['department']
      ),
      location: this.mappedString('location', configured, hidden,
        configured.get('location'),
        identity.location,
        attributes['location'],
        attributes['city']
      ),
      email: this.mappedString('email', configured, hidden,
        configured.get('email'),
        identity.emailAddress,
        attributes['email'],
        attributes['emailAddress']
      ),
      phone: this.mappedString('phone', configured, hidden,
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
      photoUrl: this.mappedString('photoUrl', configured, hidden,
        configured.get('photoUrl'),
        identity.photoUrl,
        attributes['photoUrl']
      ),
      teamsUrl: this.mappedString('teamsUrl', configured, hidden,
        configured.get('teamsUrl'),
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

    while (hasMore) {
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
      const batches = responses.map((response) =>
        this.readIdentityBatch(response)
      );
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

  private inferTarget(field: OrgChartFieldConfig): OrgChartFieldTarget | undefined {
    const value = `${field.key} ${field.label}`.toLowerCase().replace(/[^a-z]/g, '');
    const aliases: Array<[OrgChartFieldTarget, string[]]> = [
      ['firstName', ['firstname', 'givenname']],
      ['lastName', ['lastname', 'surname']],
      ['title', ['title', 'jobtitle', 'position']],
      ['department', ['department', 'businessunit']],
      ['location', ['location', 'city', 'office']],
      ['email', ['email', 'emailaddress']],
      ['phone', ['phone', 'phonenumber', 'telephone', 'mobile']],
      ['photoUrl', ['photo', 'photourl', 'avatar']],
      ['teamsUrl', ['teams', 'teamsurl', 'microsoftteams']],
    ];
    return aliases.find(([, names]) => names.some((name) => value.includes(name)))?.[0];
  }

  private firstString(...values: unknown[]): string | undefined {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
    return undefined;
  }

  private mappedString(
    target: OrgChartFieldTarget,
    configured: ReadonlyMap<OrgChartFieldTarget, unknown>,
    hidden: ReadonlySet<OrgChartFieldTarget>,
    ...fallbacks: unknown[]
  ): string | undefined {
    if (hidden.has(target) && !configured.has(target)) {
      return undefined;
    }
    return this.firstString(...fallbacks);
  }

  private readIdentityBatch(response: {
    data?: unknown;
    status?: number;
    statusText?: string;
  }): Identity[] {
    if (
      typeof response.status === 'number' &&
      (response.status < 200 || response.status >= 300)
    ) {
      throw new Error(
        response.statusText || `Identity request failed (${response.status})`
      );
    }
    if (!Array.isArray(response.data)) {
      throw new Error('Identity request returned an invalid response');
    }
    return response.data as Identity[];
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
