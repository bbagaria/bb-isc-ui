import { SailPointSDKService } from '../../sailpoint-sdk.service';
import { OrgChartFieldConfig } from '../models/org-chart.models';
import { IdentityDataService } from './identity-data.service';

describe('IdentityDataService', () => {
  it('normalizes optional identity fields and manager references', () => {
    const service = new IdentityDataService({} as SailPointSDKService);
    const normalized = service.normalizeIdentity({
      id: 'person',
      name: 'Priya Sharma',
      emailAddress: 'priya@example.com',
      managerRef: { id: 'manager', type: 'IDENTITY', name: 'Manager' },
      attributes: {
        firstname: 'Priya',
        lastname: 'Sharma',
        jobTitle: 'VP Engineering',
        department: 'Technology',
      },
    });

    expect(normalized?.id).toBe('person');
    expect(normalized?.firstName).toBe('Priya');
    expect(normalized?.lastName).toBe('Sharma');
    expect(normalized?.title).toBe('VP Engineering');
    expect(normalized?.department).toBe('Technology');
    expect(normalized?.email).toBe('priya@example.com');
    expect(normalized?.managerId).toBe('manager');
  });

  it('supports tenant-specific top-level field mapping', () => {
    const service = new IdentityDataService({} as SailPointSDKService);
    const fields: OrgChartFieldConfig[] = [
      {
        key: 'officeName',
        label: 'Office',
        source: 'topLevel',
        target: 'location',
        visible: true,
      },
    ];
    const normalized = service.normalizeIdentity(
      {
        id: 'person',
        name: 'Priya Sharma',
        officeName: 'Chicago',
      } as never,
      fields
    );

    expect(normalized?.location).toBe('Chicago');
  });

  it('does not expose a field explicitly hidden by tenant configuration', () => {
    const service = new IdentityDataService({} as SailPointSDKService);
    const normalized = service.normalizeIdentity(
      {
        id: 'person',
        name: 'Priya Sharma',
        emailAddress: 'priya@example.com',
        attributes: { email: 'fallback@example.com' },
      },
      [{
        key: 'email',
        label: 'Email',
        source: 'attribute',
        target: 'email',
        visible: false,
      }]
    );

    expect(normalized?.email).toBeUndefined();
  });

  it('paginates identities in bulk and de-duplicates ids', async () => {
    let calls = 0;
    const sdk = {
      listIdentitiesV1: ({ offset }: { offset: number }) => {
        calls += 1;
        return Promise.resolve({
          data:
            offset === 0
              ? [{ id: 'one', name: 'One' }]
              : [{ id: 'one', name: 'Duplicate' }, { id: 'two', name: 'Two' }],
          headers: offset === 0 ? { 'x-total-count': '251' } : {},
        });
      },
    } as unknown as SailPointSDKService;
    const service = new IdentityDataService(sdk);

    const identities = await service.loadIdentities();

    expect(identities.map((identity) => identity.id).sort()).toEqual([
      'one',
      'two',
    ]);
    expect(calls).toBe(2);
  });

  it('rejects structured non-success responses from the generated SDK bridge', async () => {
    const sdk = {
      listIdentitiesV1: () =>
        Promise.resolve({
          data: [],
          status: 500,
          statusText: 'ISC unavailable',
          headers: {},
        }),
    } as unknown as SailPointSDKService;
    const service = new IdentityDataService(sdk);
    let message = '';

    try {
      await service.loadIdentities();
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toBe('ISC unavailable');
  });
});
