import {
  Component,
  inject,
  signal,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { BattleRoyaleStore } from './battle-royale.store';

@Component({
  selector: 'app-battle-royale-play',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './battle-royale-play.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BattleRoyalePlayComponent implements OnInit, OnDestroy {
  protected store = inject(BattleRoyaleStore);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  selectedChoice = signal<string | null>(null);
  answerFeedback = signal<'correct' | 'wrong' | null>(null);

  ngOnInit(): void {
    const roomId = this.route.snapshot.paramMap.get('id');
    if (!roomId) {
      this.router.navigate(['/battle-royale']);
      return;
    }
    this.store.reset();
    this.store.loadRoom(roomId).then(() => {
      this.store.subscribeRealtime(roomId);
    });
  }

  ngOnDestroy(): void {
    this.store.unsubscribeRealtime();
  }

  async startGame(): Promise<void> {
    await this.store.startRoom();
  }

  async selectAndSubmit(choice: string): Promise<void> {
    if (this.store.submitting() || this.store.phase() === 'answered') return;
    this.selectedChoice.set(choice);
    await this.store.submitAnswer(choice);

    const last = this.store.lastAnswer();
    if (last) {
      this.answerFeedback.set(last.correct ? 'correct' : 'wrong');
      setTimeout(() => {
        this.answerFeedback.set(null);
        this.selectedChoice.set(null);
      }, 1500);
    }
  }

  goHome(): void {
    this.router.navigate(['/']);
  }

  trackByUserId(_: number, p: { userId: string }): string {
    return p.userId;
  }

  get progress(): number {
    const total = this.store.roomView()?.questionCount ?? 20;
    return Math.round((this.store.myIndex() / total) * 100);
  }
}
