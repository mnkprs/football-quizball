import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BaseChartDirective } from 'ng2-charts';
import type { ChartConfiguration, ChartData } from 'chart.js';

interface Row { bucket: string; total: number; correct: number; accuracy: number; }

const ORDER = ['easy', 'medium', 'hard', 'expert'];
const COLORS: Record<string, string> = {
  easy: '#4ade80', medium: '#facc15', hard: '#fb923c', expert: '#f87171',
};

@Component({
  selector: 'app-difficulty-breakdown',
  standalone: true,
  imports: [CommonModule, BaseChartDirective],
  template: `
    <div class="widget">
      <h3>Accuracy by Difficulty</h3>
      @if (data.length === 0) {
        <p class="empty">No data yet.</p>
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
export class DifficultyBreakdownComponent {
  @Input({ required: true }) data!: Row[];

  chartData(): ChartData<'bar'> {
    const ordered = [...this.data].sort(
      (a, b) => ORDER.indexOf(a.bucket) - ORDER.indexOf(b.bucket),
    );
    return {
      labels: ordered.map((r) => r.bucket.toUpperCase()),
      datasets: [
        {
          data: ordered.map((r) => Math.round(r.accuracy * 100)),
          backgroundColor: ordered.map((r) => COLORS[r.bucket] ?? '#60a5fa'),
          borderRadius: 6,
        },
      ],
    };
  }

  options: ChartConfiguration<'bar'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: (ctx) => `${ctx.parsed.y}% accuracy` } },
    },
    scales: {
      y: {
        min: 0, max: 100,
        ticks: { callback: (v) => `${v}%`, color: '#94a3b8' },
        grid: { color: 'rgba(255,255,255,0.06)' },
      },
      x: { grid: { display: false }, ticks: { color: '#cbd5e1' } },
    },
  };
}
