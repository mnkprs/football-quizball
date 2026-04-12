import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'app-lobby-header',
  standalone: true,
  templateUrl: './lobby-header.html',
  styleUrl: './lobby-header.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LobbyHeaderComponent {
  title = input<string>('');
  back = output<void>();

  onBack(): void {
    this.back.emit();
  }
}
