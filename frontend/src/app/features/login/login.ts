import { Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthModalService } from '../../core/auth-modal.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [],
  template: ``,
})
export class LoginComponent implements OnInit {
  private authModal = inject(AuthModalService);
  private router = inject(Router);

  ngOnInit(): void {
    this.authModal.open();
    this.router.navigate(['/'], { replaceUrl: true });
  }
}
