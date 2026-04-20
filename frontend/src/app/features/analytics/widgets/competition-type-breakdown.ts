import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BaseChartDirective } from 'ng2-charts';
import type { ChartConfiguration, ChartData } from 'chart.js';

interface Row { bucket: string; total: number; correct: number; accuracy: number; }

/**
 * Presentation labels for competition-type buckets. Backend values come from
 * `question_pool.competition_type` (set at seed time). Unknown values fall
 * through to a humanised label but should no longer appear in this list —
 * the analytics service strips `'unknown'` before handing us the data.
 */
const LABELS: Record<string, string> = {
  club: 'Club',
  national_team: 'National Team',
  youth: 'Youth',
  continental: 'Continental',
  international: 'International',
};

@Component({
  selector: 'app-competition-type-breakdown',
  standalone: true,
  imports: [CommonModule, BaseChartDirective],
  template: `
    <div class="widget">
      <h3>Accuracy by Competition</h3>
      @if (rows().length === 0) {
        <p class="empty">Competition data arrives as new questions are tagged.</p>
      } @else {
        <canvas baseChart [data]="chartData()" [options]="options" type="bar"></canvas>
      }
    </div>
  `,
  styles: [
    `.widget { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 0.75rem; padding: 1rem; }`,
    `.widget h3 { font-size: 0.95rem; font-weight: 600; margin-bottom: 0.75rem; }`,
    `.empty { color: #94a3b8; font-size: 0.85rem; }`,
    `canvas { max-height: 220px; }`,
  ],
})
export class CompetitionTypeBreakdownComponent {
  @Input({ required: true }) data!: Row[];

  rows() {
    return [...this.data].sort((a, b) => b.accuracy - a.accuracy);
  }

  chartData(): ChartData<'bar'> {
    const ordered = this.rows();
    return {
      labels: ordered.map((r) => LABELS[r.bucket] ?? prettify(r.bucket)),
      datasets: [
        {
          data: ordered.map((r) => Math.round(r.accuracy * 100)),
          backgroundColor: '#22d3ee',
          borderRadius: 6,
        },
      ],
    };
  }

  options: ChartConfiguration<'bar'>['options'] = {
    indexAxis: 'y' as const,
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { min: 0, max: 100, ticks: { callback: (v) => `${v}%`, color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.06)' } },
      y: { grid: { display: false }, ticks: { color: '#cbd5e1' } },
    },
  };
}

function prettify(raw: string): string {
  return raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
