import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  Input,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subject, takeUntil } from 'rxjs';
import { IdentityContactCardComponent } from './components/identity-contact-card/identity-contact-card.component';
import {
  DEFAULT_ORG_CHART_FIELDS,
  OrgChartConnector,
  OrgChartFieldConfig,
  OrgChartLayoutNode,
  OrgChartNode,
  OrganizationHierarchy,
} from './models/org-chart.models';
import { IdentityDataService } from './services/identity-data.service';
import { ProfilePhotoService } from './services/profile-photo.service';
import { buildOrganizationHierarchy } from './utils/hierarchy-builder';

const NODE_WIDTH = 244;
const NODE_HEIGHT = 142;
const HORIZONTAL_GAP = 32;
const VERTICAL_GAP = 82;
const CANVAS_PADDING = 48;
const MAX_DEFAULT_VISIBLE_REPORTS = 50;

export function searchOrganizationIdentities(
  identities: ReadonlyArray<OrgChartNode>,
  query: string,
  limit = 20
): OrgChartNode[] {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) {
    return [];
  }

  return identities
    .filter((identity) => {
      const haystack = [
        identity.firstName,
        identity.lastName,
        identity.name,
        identity.title,
        identity.department,
        identity.location,
        identity.email,
        identity.status,
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase();
      return terms.every((term) => haystack.includes(term));
    })
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, limit);
}

@Component({
  selector: 'app-organization-chart',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatAutocompleteModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    IdentityContactCardComponent,
  ],
  templateUrl: './organization-chart.component.html',
  styleUrl: './organization-chart.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganizationChartComponent implements OnInit, OnDestroy {
  @Input() fieldConfig: ReadonlyArray<OrgChartFieldConfig> =
    DEFAULT_ORG_CHART_FIELDS;
  @ViewChild('viewport') viewport?: ElementRef<HTMLDivElement>;

  readonly searchControl = new FormControl<string | OrgChartNode>('', {
    nonNullable: true,
  });

  identities: OrgChartNode[] = [];
  hierarchy: OrganizationHierarchy = { roots: [], orphaned: [], invalid: [] };
  layoutNodes: OrgChartLayoutNode[] = [];
  connectors: OrgChartConnector[] = [];
  searchResults: OrgChartNode[] = [];
  selected?: OrgChartNode;
  highlightedId?: string;
  loading = false;
  loadedCount = 0;
  errorMessage = '';
  zoom = 1;
  panX = 0;
  panY = 0;
  canvasWidth = 0;
  canvasHeight = 0;

  private readonly nodesById = new Map<string, OrgChartNode>();
  private readonly expandedIds = new Set<string>();
  private readonly failedPhotos = new Set<string>();
  private readonly destroy$ = new Subject<void>();
  isPanning = false;
  private pointerStartX = 0;
  private pointerStartY = 0;
  private panStartX = 0;
  private panStartY = 0;

  constructor(
    private readonly identityData: IdentityDataService,
    private readonly photos: ProfilePhotoService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.identityData.loadedCount$
      .pipe(takeUntil(this.destroy$))
      .subscribe((count) => {
        this.loadedCount = count;
        this.cdr.markForCheck();
      });

    this.searchControl.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe((value) => {
        this.searchResults =
          typeof value === 'string'
            ? searchOrganizationIdentities(this.identities, value)
            : [];
        this.cdr.markForCheck();
      });

    void this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  async load(): Promise<void> {
    this.loading = true;
    this.errorMessage = '';
    this.closeDetails();
    this.cdr.markForCheck();

    try {
      this.identities = await this.identityData.loadIdentities(this.fieldConfig);
      this.hierarchy = buildOrganizationHierarchy(this.identities);
      this.nodesById.clear();
      this.identities = [
        ...this.hierarchy.roots,
        ...this.hierarchy.orphaned,
        ...this.hierarchy.invalid,
      ].flatMap((root) => this.flatten(root));
      this.identities.forEach((node) => this.nodesById.set(node.id, node));

      this.expandedIds.clear();
      this.displayRoots.forEach((root) => {
        if (
          root.children.length > 0 &&
          root.children.length <= MAX_DEFAULT_VISIBLE_REPORTS
        ) {
          this.expandedIds.add(root.id);
        }
      });
      this.rebuildLayout();
      queueMicrotask(() => this.fitToView());
    } catch {
      this.errorMessage = 'Unable to load organization data.';
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  get displayRoots(): OrgChartNode[] {
    return [
      ...this.hierarchy.roots,
      ...this.hierarchy.orphaned,
      ...this.hierarchy.invalid,
    ];
  }

  get manager(): OrgChartNode | undefined {
    return this.selected?.managerId
      ? this.nodesById.get(this.selected.managerId)
      : undefined;
  }

  get transform(): string {
    return `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
  }

  displayIdentity(value: string | OrgChartNode): string {
    return typeof value === 'string' ? value : value.name;
  }

  selectSearchResult(event: MatAutocompleteSelectedEvent): void {
    const identity = event.option.value as OrgChartNode;
    this.focusIdentity(identity, true);
    this.searchControl.setValue(identity.name, { emitEvent: false });
    this.searchResults = [];
  }

  selectIdentity(identity: OrgChartNode): void {
    this.selected = identity;
    this.highlightedId = identity.id;
  }

  focusIdentity(identity: OrgChartNode, openDetails = false): void {
    const seen = new Set<string>();
    let current: OrgChartNode | undefined = identity;
    while (current?.managerId && !seen.has(current.id)) {
      seen.add(current.id);
      const manager = this.nodesById.get(current.managerId);
      if (!manager) {
        break;
      }
      this.expandedIds.add(manager.id);
      current = manager;
    }

    this.rebuildLayout();
    this.highlightedId = identity.id;
    if (openDetails) {
      this.selected = identity;
    }
    queueMicrotask(() => this.centerNode(identity.id));
  }

  closeDetails(): void {
    this.selected = undefined;
  }

  toggleExpanded(identity: OrgChartNode, event: Event): void {
    event.stopPropagation();
    if (this.expandedIds.has(identity.id)) {
      this.expandedIds.delete(identity.id);
    } else {
      this.expandedIds.add(identity.id);
    }
    this.rebuildLayout();
  }

  isExpanded(identity: OrgChartNode): boolean {
    return this.expandedIds.has(identity.id);
  }

  zoomIn(): void {
    this.setZoom(this.zoom + 0.15);
  }

  zoomOut(): void {
    this.setZoom(this.zoom - 0.15);
  }

  fitToView(): void {
    const viewport = this.viewport?.nativeElement;
    if (!viewport || this.canvasWidth === 0 || this.canvasHeight === 0) {
      return;
    }
    const availableWidth = viewport.clientWidth - 32;
    const availableHeight = viewport.clientHeight - 32;
    this.zoom = Math.min(
      1,
      Math.max(
        0.3,
        Math.min(availableWidth / this.canvasWidth, availableHeight / this.canvasHeight)
      )
    );
    this.panX = (viewport.clientWidth - this.canvasWidth * this.zoom) / 2;
    this.panY = Math.max(16, (viewport.clientHeight - this.canvasHeight * this.zoom) / 2);
    this.cdr.markForCheck();
  }

  onWheel(event: WheelEvent): void {
    event.preventDefault();
    const viewport = this.viewport?.nativeElement;
    if (!viewport) {
      return;
    }
    const rect = viewport.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    const worldX = (pointerX - this.panX) / this.zoom;
    const worldY = (pointerY - this.panY) / this.zoom;
    const nextZoom = this.clampZoom(this.zoom + (event.deltaY < 0 ? 0.1 : -0.1));
    this.panX = pointerX - worldX * nextZoom;
    this.panY = pointerY - worldY * nextZoom;
    this.zoom = nextZoom;
  }

  startPan(event: PointerEvent): void {
    const target = event.target as HTMLElement;
    if (target.closest('.org-node') || target.closest('button') || event.button !== 0) {
      return;
    }
    this.isPanning = true;
    this.pointerStartX = event.clientX;
    this.pointerStartY = event.clientY;
    this.panStartX = this.panX;
    this.panStartY = this.panY;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  pan(event: PointerEvent): void {
    if (!this.isPanning) {
      return;
    }
    this.panX = this.panStartX + event.clientX - this.pointerStartX;
    this.panY = this.panStartY + event.clientY - this.pointerStartY;
  }

  endPan(): void {
    this.isPanning = false;
  }

  photoUrl(identity: OrgChartNode): string | undefined {
    return this.failedPhotos.has(identity.id)
      ? undefined
      : this.photos.getPhotoUrl(identity);
  }

  photoFailed(identity: OrgChartNode): void {
    this.failedPhotos.add(identity.id);
  }

  initials(identity: OrgChartNode): string {
    return this.photos.getInitials(identity);
  }

  trackNode(_index: number, item: OrgChartLayoutNode): string {
    return item.node.id;
  }

  private rebuildLayout(): void {
    const layout: OrgChartLayoutNode[] = [];
    const connections: Array<{ parent: OrgChartNode; child: OrgChartNode }> = [];
    let nextLeaf = 0;

    const visit = (node: OrgChartNode, depth: number): number => {
      const visibleChildren = this.expandedIds.has(node.id) ? node.children : [];
      let center: number;

      if (visibleChildren.length === 0) {
        center = nextLeaf * (NODE_WIDTH + HORIZONTAL_GAP);
        nextLeaf += 1;
      } else {
        const childCenters = visibleChildren.map((child) => {
          connections.push({ parent: node, child });
          return visit(child, depth + 1);
        });
        center =
          (childCenters[0] + childCenters[childCenters.length - 1]) / 2;
      }

      layout.push({
        node,
        x: center + CANVAS_PADDING,
        y: depth * (NODE_HEIGHT + VERTICAL_GAP) + CANVAS_PADDING,
      });
      return center;
    };

    this.displayRoots.forEach((root, index) => {
      if (index > 0) {
        nextLeaf += 0.35;
      }
      visit(root, 0);
    });

    const layoutById = new Map(layout.map((item) => [item.node.id, item]));
    this.connectors = connections.flatMap(({ parent, child }) => {
      const from = layoutById.get(parent.id);
      const to = layoutById.get(child.id);
      return from && to
        ? [{
            fromX: from.x + NODE_WIDTH / 2,
            fromY: from.y + NODE_HEIGHT,
            toX: to.x + NODE_WIDTH / 2,
            toY: to.y,
          }]
        : [];
    });
    this.layoutNodes = layout;
    this.canvasWidth =
      Math.max(0, ...layout.map((item) => item.x + NODE_WIDTH)) + CANVAS_PADDING;
    this.canvasHeight =
      Math.max(0, ...layout.map((item) => item.y + NODE_HEIGHT)) + CANVAS_PADDING;
    this.cdr.markForCheck();
  }

  private flatten(root: OrgChartNode): OrgChartNode[] {
    const result: OrgChartNode[] = [];
    const stack = [root];
    const visited = new Set<string>();
    while (stack.length > 0) {
      const node = stack.pop();
      if (!node || visited.has(node.id)) {
        continue;
      }
      visited.add(node.id);
      result.push(node);
      stack.push(...node.children);
    }
    return result;
  }

  private centerNode(id: string): void {
    const viewport = this.viewport?.nativeElement;
    const item = this.layoutNodes.find((layoutNode) => layoutNode.node.id === id);
    if (!viewport || !item) {
      return;
    }
    this.panX = viewport.clientWidth / 2 - (item.x + NODE_WIDTH / 2) * this.zoom;
    this.panY = viewport.clientHeight / 2 - (item.y + NODE_HEIGHT / 2) * this.zoom;
    this.cdr.markForCheck();
  }

  private setZoom(nextZoom: number): void {
    const viewport = this.viewport?.nativeElement;
    const centerX = (viewport?.clientWidth ?? 0) / 2;
    const centerY = (viewport?.clientHeight ?? 0) / 2;
    const worldX = (centerX - this.panX) / this.zoom;
    const worldY = (centerY - this.panY) / this.zoom;
    this.zoom = this.clampZoom(nextZoom);
    this.panX = centerX - worldX * this.zoom;
    this.panY = centerY - worldY * this.zoom;
  }

  private clampZoom(value: number): number {
    return Math.min(2, Math.max(0.3, value));
  }
}
