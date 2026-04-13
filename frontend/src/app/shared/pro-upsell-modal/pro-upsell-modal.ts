import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-pro-upsell-modal',
  standalone: true,
  templateUrl: './pro-upsell-modal.html',
  styleUrls: ['./pro-upsell-modal.css'],
})
export class ProUpsellModalComponent {
  @Input() open = false;
  @Input() title = 'Unlock Pro';
  @Input() body = 'See every question you played — upgrade to Pro.';
  @Output() dismiss = new EventEmitter<void>();

  private router = inject(Router);

  upgrade(): void {
    this.dismiss.emit();
    this.router.navigate([this.proRoute()]);
  }

  private proRoute(): string {
    // Use the existing subscription / pro page route.
    return '/pro';
  }
}
