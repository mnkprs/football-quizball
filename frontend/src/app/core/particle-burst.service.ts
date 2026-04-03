import { Injectable } from '@angular/core';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  alpha: number;
}

@Injectable({ providedIn: 'root' })
export class ParticleBurstService {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private particles: Particle[] = [];
  private animFrame = 0;

  private ensureCanvas(): void {
    if (this.canvas) return;
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText =
      'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999';
    document.body.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private resize(): void {
    if (!this.canvas) return;
    this.canvas.width = window.innerWidth * devicePixelRatio;
    this.canvas.height = window.innerHeight * devicePixelRatio;
    this.ctx?.scale(devicePixelRatio, devicePixelRatio);
  }

  burst(originEl?: HTMLElement): void {
    this.ensureCanvas();
    if (!this.ctx || !this.canvas) return;

    // Show canvas
    this.canvas.style.display = '';
    this.resize();

    // Find origin point — center of the element or screen center
    let cx = window.innerWidth / 2;
    let cy = window.innerHeight / 2;
    if (originEl) {
      const rect = originEl.getBoundingClientRect();
      cx = rect.left + rect.width / 2;
      cy = rect.top + rect.height / 2;
    }

    const colors = [
      'rgba(0, 122, 255, 1)',    // iOS Blue
      'rgba(77, 163, 255, 1)',   // Light blue
      'rgba(255, 255, 255, 0.9)', // White spark
      'rgba(0, 180, 255, 1)',    // Cyan-blue
    ];

    // Spawn 30 particles
    for (let i = 0; i < 30; i++) {
      const angle = (Math.PI * 2 * i) / 30 + (Math.random() - 0.5) * 0.5;
      const speed = 2 + Math.random() * 5;
      const life = 30 + Math.random() * 25;
      this.particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.5, // slight upward bias
        life,
        maxLife: life,
        size: 2 + Math.random() * 3,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 1,
      });
    }

    if (!this.animFrame) this.tick();
  }

  private tick = (): void => {
    if (!this.ctx || !this.canvas) return;

    this.ctx.clearRect(0, 0, this.canvas.width / devicePixelRatio, this.canvas.height / devicePixelRatio);

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.12; // gravity
      p.vx *= 0.98; // drag
      p.life--;
      p.alpha = p.life / p.maxLife;

      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      this.ctx.save();
      this.ctx.globalAlpha = p.alpha;
      this.ctx.fillStyle = p.color;
      this.ctx.shadowColor = p.color;
      this.ctx.shadowBlur = 8;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size * p.alpha, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.restore();
    }

    if (this.particles.length > 0) {
      this.animFrame = requestAnimationFrame(this.tick);
    } else {
      this.animFrame = 0;
      // Hide canvas when done
      if (this.canvas) this.canvas.style.display = 'none';
    }
  };
}
