import { signal } from '@angular/core';

export interface GameTimer {
  readonly timeLeft: ReturnType<typeof signal<number>>;
  start(seconds: number, onExpire: () => void): void;
  stop(): void;
  destroy(): void;
}

export function createGameTimer(): GameTimer {
  const timeLeft = signal(0);
  let interval: ReturnType<typeof setInterval> | null = null;

  function stop(): void {
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
  }

  return {
    timeLeft,
    start(seconds: number, onExpire: () => void): void {
      stop();
      timeLeft.set(seconds);
      interval = setInterval(() => {
        const left = timeLeft() - 1;
        timeLeft.set(left);
        if (left <= 0) {
          stop();
          onExpire();
        }
      }, 1000);
    },
    stop,
    destroy(): void {
      stop();
    },
  };
}
