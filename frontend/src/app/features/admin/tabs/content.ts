import { Component, ChangeDetectionStrategy } from '@angular/core';
import { AdminLegacyComponent } from '../admin-legacy';

/**
 * Content tab — wraps the legacy admin component to preserve all existing
 * question-pool management functionality immediately during the dashboard migration.
 */
@Component({
  selector: 'admin-content',
  standalone: true,
  imports: [AdminLegacyComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-admin-legacy />`,
})
export class ContentTabComponent {}
