import { Component, Input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

interface Row { bucket: string; total: number; correct: number; accuracy: number; }

@Component({
  selector: 'app-category-heatmap',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="widget">
      <h3>Category Strengths</h3>
      @if (highlight().strongest; as s) {
        <p class="callout callout-good">
          💪 Strongest: <strong>{{ s.bucket }}</strong> ({{ (s.accuracy * 100) | number:'1.0-0' }}%)
        </p>
      }
      @if (highlight().weakest; as w) {
        <p class="callout callout-warn">
          📚 Needs work: <strong>{{ w.bucket }}</strong> ({{ (w.accuracy * 100) | number:'1.0-0' }}%)
        </p>
      }
      <ul class="rows">
        @for (row of data; track row.bucket) {
          <li>
            <span class="name">{{ row.bucket }}</span>
            <span class="bar">
              <span class="fill" [style.width.%]="row.accuracy * 100"
                    [style.background]="color(row.accuracy)"></span>
            </span>
            <span class="pct">{{ (row.accuracy * 100) | number:'1.0-0' }}%</span>
            <span class="n">n={{ row.total }}</span>
          </li>
        }
      </ul>
    </div>
  `,
  styles: [
    `.widget { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 0.75rem; padding: 1rem; }`,
    `.widget h3 { font-size: 0.95rem; font-weight: 600; margin-bottom: 0.75rem; }`,
    `.callout { font-size: 0.85rem; padding: 0.5rem 0.75rem; border-radius: 0.5rem; margin-bottom: 0.5rem; }`,
    `.callout-good { background: rgba(74, 222, 128, 0.1); color: #4ade80; }`,
    `.callout-warn { background: rgba(251, 146, 60, 0.1); color: #fb923c; }`,
    `.rows { list-style: none; padding: 0; margin: 0.75rem 0 0; display: flex; flex-direction: column; gap: 0.4rem; }`,
    `li { display: grid; grid-template-columns: 96px 1fr 48px 48px; gap: 0.5rem; align-items: center; font-size: 0.8rem; }`,
    `.name { color: #cbd5e1; text-transform: capitalize; }`,
    `.bar { background: rgba(255,255,255,0.06); border-radius: 999px; height: 8px; overflow: hidden; }`,
    `.fill { display: block; height: 100%; border-radius: 999px; transition: width 0.4s ease; }`,
    `.pct { color: #e2e8f0; font-weight: 600; text-align: right; }`,
    `.n { color: #64748b; font-size: 0.75rem; text-align: right; }`,
  ],
})
export class CategoryHeatmapComponent {
  @Input({ required: true }) data!: Row[];
  @Input() strongest: Row | null = null;
  @Input() weakest: Row | null = null;

  highlight = computed(() => ({ strongest: this.strongest, weakest: this.weakest }));

  color(acc: number): string {
    if (acc >= 0.75) return '#4ade80';
    if (acc >= 0.5) return '#facc15';
    if (acc >= 0.3) return '#fb923c';
    return '#f87171';
  }
}
