import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { LanguageService } from '../../core/language.service';
import { ShareService } from '../../core/share.service';

@Component({
  selector: 'app-invite',
  standalone: true,
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './invite.html',
  styleUrl: './invite.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InviteComponent {
  lang = inject(LanguageService);
  private shareService = inject(ShareService);
  copied = signal(false);

  get inviteUrl(): string {
    return 'stepovr://invite';
  }

  canShare(): boolean {
    return true;
  }

  async copyLink(): Promise<void> {
    await this.shareService.copyCode(this.inviteUrl);
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2000);
  }

  async share(): Promise<void> {
    await this.shareService.shareCode('invite', '');
  }
}
