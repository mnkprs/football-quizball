import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'app-confirm-modal',
  standalone: true,
  imports: [],
  templateUrl: './confirm-modal.html',
  styleUrl: './confirm-modal.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmModalComponent {
  message = input.required<string>();
  confirmLabel = input('End');
  cancelLabel = input('Cancel');

  confirm = output<void>();
  cancel = output<void>();
}
