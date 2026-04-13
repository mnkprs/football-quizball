import { Injectable } from '@angular/core';
import { Share } from '@capacitor/share';
import { Clipboard } from '@capacitor/clipboard';

export type ShareMode = 'duel' | 'game' | 'battle-royale' | 'invite';

interface SharePayload {
  title: string;
  text: string;
  url: string;
}

const DEEP_LINK_SCHEME = 'stepovr://';

@Injectable({ providedIn: 'root' })
export class ShareService {
  async shareCode(mode: ShareMode, code: string): Promise<void> {
    const payload = this.buildPayload(mode, code);
    try {
      // Note: only `text` is passed (not `url`) — the deep link is already
      // embedded in `text`. Passing both causes WhatsApp/iMessage to show the
      // URL twice (once in body, once as appended URL preview).
      await Share.share({
        title: payload.title,
        text: payload.text,
        dialogTitle: payload.title,
      });
    } catch (err: unknown) {
      if (this.isUserCancelled(err)) return;
      await this.copyText(payload.text);
    }
  }

  private isUserCancelled(err: unknown): boolean {
    const message = (err as Error)?.message?.toLowerCase() ?? '';
    const name = (err as Error)?.name ?? '';
    return name === 'AbortError'
      || message.includes('cancel')
      || message.includes('dismiss');
  }

  async copyCode(code: string): Promise<boolean> {
    try {
      await Clipboard.write({ string: code });
      return true;
    } catch {
      return false;
    }
  }

  private async copyText(text: string): Promise<void> {
    try {
      await Clipboard.write({ string: text });
    } catch {
      // final fallback: swallow silently — share sheet already handled primary path
    }
  }

  private buildPayload(mode: ShareMode, code: string): SharePayload {
    switch (mode) {
      case 'duel':
        return {
          title: 'StepOvr Duel',
          text: `⚔️ I'm challenging you to a StepOvr duel!\nTap: ${DEEP_LINK_SCHEME}duel/${code}\nOr use code ${code} in the app.`,
          url: `${DEEP_LINK_SCHEME}duel/${code}`,
        };
      case 'game':
        return {
          title: 'StepOvr 1v1',
          text: `🎮 Join my StepOvr game!\nTap: ${DEEP_LINK_SCHEME}game/${code}\nOr use code ${code} in the app.`,
          url: `${DEEP_LINK_SCHEME}game/${code}`,
        };
      case 'battle-royale':
        return {
          title: 'StepOvr Battle Royale',
          text: `👑 Join my Battle Royale on StepOvr!\nTap: ${DEEP_LINK_SCHEME}br/${code}\nOr use code ${code} in the app.`,
          url: `${DEEP_LINK_SCHEME}br/${code}`,
        };
      case 'invite':
        return {
          title: 'StepOvr',
          text: `⚽ Come play StepOvr with me!\nTap: ${DEEP_LINK_SCHEME}invite\nOr sign up and I'll find you.`,
          url: `${DEEP_LINK_SCHEME}invite`,
        };
    }
  }
}
