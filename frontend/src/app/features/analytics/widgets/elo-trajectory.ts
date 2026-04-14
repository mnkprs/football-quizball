import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BaseChartDirective } from 'ng2-charts';
import type { ChartConfiguration, ChartData } from 'chart.js';

@Component({
  selector: 'app-elo-trajectory',
  standalone: true,
  imports: [CommonModule, BaseChartDirective],
  template: `
    <div class="widget">
      <h3>ELO Trajectory</h3>
      @if (data.length === 0) {
        <p class="empty">No ELO history yet — play a few solo rounds.</p>
      } @else {
        <canvas baseChart [data]="chartData()" [options]="options" type="line"></canvas>
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
export class EloTrajectoryComponent {
  @Input({ required: true }) data!: Array<{ t: string; elo: number }>;

  chartData(): ChartData<'line'> {
    return {
      labels: this.data.map((p) => new Date(p.t).toLocaleDateString()),
      datasets: [
        {
          data: this.data.map((p) => p.elo),
          borderColor: '#a78bfa',
          backgroundColor: 'rgba(167, 139, 250, 0.15)',
          fill: true,
          tension: 0.25,
          pointRadius: 0,
          borderWidth: 2,
        },
      ],
    };
  }

  options: ChartConfiguration<'line'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { display: false },
      y: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#94a3b8' } },
    },
  };
}
