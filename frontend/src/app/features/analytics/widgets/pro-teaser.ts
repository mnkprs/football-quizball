import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProService } from '../../../core/pro.service';

@Component({
  selector: 'app-pro-teaser',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="teaser">
      <div class="preview">
        <div class="fake-chart"></div>
        <div class="fake-row"></div>
        <div class="fake-row short"></div>
        <div class="lock">🔒</div>
      </div>
      <h2>Your performance, unlocked.</h2>
      <ul class="bullets">
        <li>📈 ELO trajectory — every game, every tier</li>
        <li>🎯 Category strengths + weaknesses with sample sizes</li>
        <li>📚 Accuracy by era, league tier, and difficulty</li>
        <li>💪 Auto-detected coaching suggestions</li>
      </ul>
      <button class="cta" (click)="upgrade()">Unlock with Pro →</button>
    </section>
  `,
  styles: [
    `.teaser { text-align: center; padding: 1.5rem; }`,
    `.preview { position: relative; margin: 0 auto 1.5rem; max-width: 360px; height: 160px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 0.75rem; overflow: hidden; filter: blur(6px) brightness(0.7); }`,
    `.fake-chart { height: 60%; background: linear-gradient(135deg, rgba(167,139,250,0.6), rgba(129,140,248,0.3)); }`,
    `.fake-row { height: 12px; margin: 8px; border-radius: 6px; background: rgba(255,255,255,0.15); }`,
    `.fake-row.short { width: 60%; }`,
    `.lock { position: absolute; inset: 0; display: grid; place-items: center; font-size: 2.5rem; filter: blur(0); }`,
    `h2 { font-size: 1.25rem; font-weight: 700; margin-bottom: 0.75rem; }`,
    `.bullets { list-style: none; padding: 0; margin: 0 0 1.25rem; text-align: left; max-width: 360px; margin-inline: auto; display: flex; flex-direction: column; gap: 0.4rem; color: #cbd5e1; font-size: 0.9rem; }`,
    `.cta { background: linear-gradient(135deg, #a78bfa, #818cf8); color: white; border: 0; padding: 0.75rem 1.5rem; font-weight: 700; border-radius: 999px; font-size: 1rem; cursor: pointer; }`,
    `.cta:hover { transform: translateY(-1px); }`,
  ],
})
export class ProTeaserComponent {
  private readonly pro = inject(ProService);
  upgrade(): void { this.pro.showUpgradeModal.set(true); }
}
