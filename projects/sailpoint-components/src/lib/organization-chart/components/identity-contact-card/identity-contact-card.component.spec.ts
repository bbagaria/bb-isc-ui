import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OrgChartNode } from '../../models/org-chart.models';
import { IdentityContactCardComponent } from './identity-contact-card.component';

describe('IdentityContactCardComponent', () => {
  let fixture: ComponentFixture<IdentityContactCardComponent>;
  let component: IdentityContactCardComponent;

  const selected: OrgChartNode = {
    id: 'person',
    name: 'Priya Sharma',
    firstName: 'Priya',
    lastName: 'Sharma',
    email: 'priya@example.com',
    phone: '+1 312 555 1234',
    teamsUrl: 'https://teams.microsoft.com/l/chat/0/0?users=priya%40example.com',
    reportCount: 2,
    children: [],
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IdentityContactCardComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(IdentityContactCardComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('identity', selected);
    fixture.detectChanges();
  });

  it('renders available contact actions and direct reports', () => {
    const text = fixture.nativeElement.textContent as string;
    const links = fixture.nativeElement.querySelectorAll('a');

    expect(text).toContain('Call');
    expect(text).toContain('Email');
    expect(text).toContain('Microsoft Teams');
    expect(text).toContain('2 Direct Reports');
    expect(links.length).toBe(3);
  });

  it('omits unavailable contact actions', () => {
    fixture.componentRef.setInput('identity', {
      id: 'no-contact',
      name: 'No Contact',
      reportCount: 0,
      children: [],
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.contact-actions a').length)
      .toBe(0);
    expect(fixture.nativeElement.textContent).toContain(
      'No contact actions are available'
    );
  });

  it('uses initials when no photo is available', () => {
    expect(fixture.nativeElement.querySelector('.avatar-large').textContent.trim())
      .toBe('PS');
  });

  it('does not render malformed phone or email actions', () => {
    fixture.componentRef.setInput('identity', {
      id: 'malformed-contact',
      name: 'Malformed Contact',
      phone: 'extension only',
      email: 'not-an-email\r\nbcc:other@example.com',
      reportCount: 0,
      children: [],
    });
    fixture.detectChanges();

    expect(component.hasContactActions).toBe(false);
    expect(fixture.nativeElement.querySelectorAll('.contact-actions a').length)
      .toBe(0);
  });

  it('emits close and manager selection actions', () => {
    const manager: OrgChartNode = {
      id: 'manager',
      name: 'Michael Brown',
      reportCount: 1,
      children: [],
    };
    fixture.componentRef.setInput('manager', manager);
    fixture.detectChanges();
    let closed = false;
    let emittedManager: OrgChartNode | undefined;
    component.closed.subscribe(() => {
      closed = true;
    });
    component.managerSelected.subscribe((value) => {
      emittedManager = value;
    });

    fixture.nativeElement.querySelector('mat-card-header button').click();
    fixture.nativeElement.querySelector('.manager-button').click();

    expect(closed).toBe(true);
    expect(emittedManager).toBe(manager);
  });

  it('closes when Escape is pressed', () => {
    let closed = false;
    component.closed.subscribe(() => {
      closed = true;
    });

    fixture.nativeElement
      .querySelector('.contact-card')
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(closed).toBe(true);
  });

  it('explains when a referenced manager is unavailable', () => {
    fixture.componentRef.setInput('managerUnavailable', true);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(
      'Referenced manager is not available'
    );
  });
});
