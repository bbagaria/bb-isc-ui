import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { OrgChartNode } from './models/org-chart.models';
import { OrganizationChartComponent } from './organization-chart.component';
import { IdentityDataService } from './services/identity-data.service';

describe('OrganizationChartComponent', () => {
  let fixture: ComponentFixture<OrganizationChartComponent>;
  let component: OrganizationChartComponent;
  let people: OrgChartNode[];

  beforeEach(async () => {
    people = [
      {
        id: 'ceo',
        name: 'Chief Executive',
        reportCount: 0,
        children: [],
      },
      {
        id: 'manager',
        name: 'Engineering Manager',
        managerId: 'ceo',
        reportCount: 0,
        children: [],
      },
      {
        id: 'employee',
        name: 'Priya Sharma',
        managerId: 'manager',
        reportCount: 0,
        children: [],
      },
    ];

    await TestBed.configureTestingModule({
      imports: [OrganizationChartComponent],
      providers: [{
        provide: IdentityDataService,
        useValue: {
          loadedCount$: of(people.length),
          loadIdentities: () => Promise.resolve(people),
        },
      }],
    }).compileComponents();

    fixture = TestBed.createComponent(OrganizationChartComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('renders managers before reports in keyboard and DOM order', () => {
    const names = [...fixture.nativeElement.querySelectorAll('.node-content strong')]
      .map((element: Element) => element.textContent?.trim());

    expect(names).toEqual(['Chief Executive', 'Engineering Manager']);
  });

  it('expands and collapses reporting branches', () => {
    const managerExpand = fixture.nativeElement
      .querySelectorAll('.node-footer button')[1] as HTMLButtonElement;

    managerExpand.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.org-node').length).toBe(3);

    managerExpand.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.org-node').length).toBe(2);
  });

  it('opens and closes the contact details panel', () => {
    const identityButton = fixture.nativeElement.querySelector(
      '.identity-button'
    ) as HTMLButtonElement;
    identityButton.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.details-panel')).toBeTruthy();

    const closeButton = fixture.nativeElement.querySelector(
      'app-identity-contact-card mat-card-header button'
    ) as HTMLButtonElement;
    closeButton.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.details-panel')).toBeFalsy();
  });

  it('expands the full ancestor path when focusing a search result', () => {
    component.focusIdentity(people[2], true);
    fixture.detectChanges();

    expect(component.layoutNodes.map((item) => item.node.id)).toEqual([
      'ceo',
      'manager',
      'employee',
    ]);
    expect(component.selected?.id).toBe('employee');
  });
});
