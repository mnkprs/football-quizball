import { Component, Input } from '@angular/core';
import { AccuracyBreakdown } from '../../../core/analytics-api.service';

@Component({
  selector: 'app-era-breakdown',
  standalone: true,
  template: '<div>Era breakdown placeholder</div>',
})
export class EraBreakdownComponent {
  @Input() data: AccuracyBreakdown[] = [];
}
