import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BaseChartDirective } from 'ng2-charts';
import type { ChartConfiguration, ChartData } from 'chart.js';

interface Row { bucket: string; total: number; correct: number; accuracy: number; }

const ORDER = ['tier_1', 'tier_2', 'tier_3', 'tier_4', 'tier_5'];
const LABELS: Record<string, string> = {
  tier_1: 'Top-5 EU',
  tier_2: 'Other EU Top',
  tier_3: 'Other Pro',
  tier_4: 'Lower Divisions',
  tier_5: 'Amateur / Misc',
  unknown: 'Uncategorized',
};

@Component({
  selector: 'app-league-tier-breakdown',
  standalone: true,
  imports: [CommonModule, BaseChartDirective],
  template: `
    <div class="widget">
      <h3>Accuracy by League Tier</h3>
      @if (rows().length === 0) {
        <p class="empty">League tier data arrives as new questions are tagged.</p>
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
export class LeagueTierBreakdownComponent {
  @Input({ required: true }) data!: Row[];

  rows() {
    return this.data
      .filter((r) => r.bucket !== 'unknown')
      .sort((a, b) => ORDER.indexOf(a.bucket) - ORDER.indexOf(b.bucket));
  }

  chartData(): ChartData<'bar'> {
    const ordered = this.rows();
    return {
      labels: ordered.map((r) => LABELS[r.bucket] ?? r.bucket),
      datasets: [
        {
          data: ordered.map((r) => Math.round(r.accuracy * 100)),
          backgroundColor: '#f59e0b',
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
