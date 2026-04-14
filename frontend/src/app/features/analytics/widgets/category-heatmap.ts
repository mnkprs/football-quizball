import { Component, Input } from '@angular/core';
import { AccuracyBreakdown } from '../../../core/analytics-api.service';

@Component({
  selector: 'app-category-heatmap',
  standalone: true,
  template: '<div>Category heatmap placeholder</div>',
})
export class CategoryHeatmapComponent {
  @Input() data: AccuracyBreakdown[] = [];
  @Input() strongest: AccuracyBreakdown | null = null;
  @Input() weakest: AccuracyBreakdown | null = null;
}
