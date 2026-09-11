import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  Output,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { OrgChartNode } from '../../models/org-chart.models';
import { ProfilePhotoService } from '../../services/profile-photo.service';
import { TeamsLinkService } from '../../services/teams-link.service';

@Component({
  selector: 'app-identity-contact-card',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatCardModule,
    MatDividerModule,
    MatIconModule,
  ],
  templateUrl: './identity-contact-card.component.html',
  styleUrl: './identity-contact-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IdentityContactCardComponent implements OnChanges {
  @Input({ required: true }) identity!: OrgChartNode;
  @Input() manager?: OrgChartNode;
  @Input() managerUnavailable = false;
  @Output() readonly closed = new EventEmitter<void>();
  @Output() readonly managerSelected = new EventEmitter<OrgChartNode>();

  photoUrl?: string;
  teamsUrl?: string;
  imageFailed = false;

  constructor(
    private readonly photos: ProfilePhotoService,
    private readonly teams: TeamsLinkService
  ) {}

  ngOnChanges(): void {
    this.photoUrl = this.photos.getPhotoUrl(this.identity);
    this.teamsUrl = this.teams.getTeamsUrl(this.identity);
    this.imageFailed = false;
  }

  get initials(): string {
    return this.photos.getInitials(this.identity);
  }

  get phoneUrl(): string | undefined {
    const phone = this.identity.phone?.replace(/[^\d+*#,;]/g, '');
    return phone && /\d/.test(phone) ? `tel:${phone}` : undefined;
  }

  get emailUrl(): string | undefined {
    const email = this.identity.email?.trim();
    return email && !/[\r\n]/.test(email) && email.includes('@')
      ? `mailto:${encodeURI(email)}`
      : undefined;
  }

  get hasContactActions(): boolean {
    return Boolean(this.phoneUrl || this.emailUrl || this.teamsUrl);
  }

  @HostListener('keydown.escape')
  closeOnEscape(): void {
    this.closed.emit();
  }
}
