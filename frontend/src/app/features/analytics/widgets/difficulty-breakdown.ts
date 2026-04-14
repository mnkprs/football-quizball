import { Component, Input } from '@angular/core';
import { AccuracyBreakdown } from '../../../core/analytics-api.service';

@Component({
  selector: 'app-difficulty-breakdown',
  standalone: true,
  template: '<div>Difficulty breakdown placeholder</div>',
})
export class DifficultyBreakdownComponent {
  @Input() data: AccuracyBreakdown[] = [];
}
