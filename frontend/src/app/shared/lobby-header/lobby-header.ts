import { Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';

@Component({
  selector: 'app-lobby-header',
  standalone: true,
  templateUrl: './lobby-header.html',
  styleUrl: './lobby-header.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LobbyHeaderComponent {
  private location = inject(Location);

  title = input<string>('');
  back = output<void>();

  onBack(): void {
    if (window.history.length > 1) {
      this.location.back();
    } else {
      this.back.emit();
    }
  }
}
