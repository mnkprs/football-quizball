import { Injectable, signal } from '@angular/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

export type SoundName =
  | 'correct'
  | 'wrong'
  | 'tick'
  | 'timeout'
  | 'achievement'
  | 'streak'
  | 'matchFound'
  | 'victory';

/** Sprite definition: start offset (s) + duration (s) for each named sound. */
interface SpriteEntry {
  start: number;
  duration: number;
}

const SPRITE_MAP: Record<SoundName, SpriteEntry> = {
  correct:     { start: 0.0,  duration: 0.5 },
  wrong:       { start: 0.6,  duration: 0.5 },
  tick:        { start: 1.2,  duration: 0.15 },
  timeout:     { start: 1.4,  duration: 0.8 },
  achievement: { start: 2.3,  duration: 1.2 },
  streak:      { start: 3.6,  duration: 0.7 },
  matchFound:  { start: 4.4,  duration: 0.6 },
  victory:     { start: 5.1,  duration: 1.5 },
};

@Injectable({ providedIn: 'root' })
export class FeedbackService {
  private readonly SOUND_KEY = 'stepover_sound';
  private readonly HAPTIC_KEY = 'stepover_haptic';

  readonly soundEnabled = signal<boolean>(this.readPref(this.SOUND_KEY));
  readonly hapticEnabled = signal<boolean>(this.readPref(this.HAPTIC_KEY));

  private audioCtx: AudioContext | null = null;
  private spriteBuffer: AudioBuffer | null = null;
  private spriteLoading: Promise<AudioBuffer | null> | null = null;

  // ─── Preference helpers ───────────────────────────────────────────────────

  private readPref(key: string): boolean {
    try {
      const stored = localStorage.getItem(key);
      return stored === null ? true : stored === 'true';
    } catch {
      return true;
    }
  }

  toggleSound(): void {
    const next = !this.soundEnabled();
    this.soundEnabled.set(next);
    try {
      localStorage.setItem(this.SOUND_KEY, String(next));
    } catch { /* iOS WKWebView SecurityError — preference not persisted */ }
  }

  toggleHaptic(): void {
    const next = !this.hapticEnabled();
    this.hapticEnabled.set(next);
    try {
      localStorage.setItem(this.HAPTIC_KEY, String(next));
    } catch { /* iOS WKWebView SecurityError — preference not persisted */ }
  }

  // ─── Haptic primitives ────────────────────────────────────────────────────

  tapLight(): void {
    this.haptic(() => Haptics.impact({ style: ImpactStyle.Light }));
  }

  tapMedium(): void {
    this.haptic(() => Haptics.impact({ style: ImpactStyle.Medium }));
  }

  tapHeavy(): void {
    this.haptic(() => Haptics.impact({ style: ImpactStyle.Heavy }));
  }

  tapError(): void {
    this.haptic(() => Haptics.notification({ type: NotificationType.Error }));
  }

  tapSuccess(): void {
    this.haptic(() => Haptics.notification({ type: NotificationType.Success }));
  }

  tapWarning(): void {
    this.haptic(() => Haptics.notification({ type: NotificationType.Warning }));
  }

  // ─── Sound primitives ─────────────────────────────────────────────────────

  playSound(name: SoundName): void {
    if (!this.soundEnabled()) return;

    this.ensureAudioCtx().then(buffer => {
      if (!buffer || !this.audioCtx) return;

      const entry = SPRITE_MAP[name];
      const source = this.audioCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(this.audioCtx.destination);
      source.start(0, entry.start, entry.duration);
    }).catch(() => { /* audio unavailable */ });
  }

  // ─── Combo methods ────────────────────────────────────────────────────────

  correctAnswer(): void {
    this.tapSuccess();
    this.playSound('correct');
  }

  wrongAnswer(): void {
    this.tapError();
    this.playSound('wrong');
  }

  timerTick(): void {
    this.tapWarning();
    this.playSound('tick');
  }

  timerExpired(): void {
    this.tapError();
    this.playSound('timeout');
  }

  achievementUnlock(): void {
    this.tapHeavy();
    this.playSound('achievement');
  }

  streakMilestone(): void {
    this.tapHeavy();
    this.playSound('streak');
  }

  matchFound(): void {
    this.tapMedium();
    this.playSound('matchFound');
  }

  victory(): void {
    this.tapHeavy();
    this.playSound('victory');
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private haptic(fn: () => Promise<void>): void {
    if (!this.hapticEnabled()) return;
    fn().catch(() => { /* Haptics unavailable on web */ });
  }

  private ensureAudioCtx(): Promise<AudioBuffer | null> {
    if (this.spriteBuffer) return Promise.resolve(this.spriteBuffer);
    if (this.spriteLoading) return this.spriteLoading;

    this.spriteLoading = (async (): Promise<AudioBuffer | null> => {
      try {
        this.audioCtx = new AudioContext();
        if (this.audioCtx.state === 'suspended') {
          await this.audioCtx.resume();
        }
        const response = await fetch('/assets/audio/sfx-sprite.webm');
        if (!response.ok) {
          this.spriteLoading = null;
          return null;
        }
        const arrayBuffer = await response.arrayBuffer();
        this.spriteBuffer = await this.audioCtx.decodeAudioData(arrayBuffer);
        return this.spriteBuffer;
      } catch {
        this.spriteLoading = null;
        return null;
      }
    })();

    return this.spriteLoading;
  }
}
