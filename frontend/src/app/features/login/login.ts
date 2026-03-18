import { Component, inject, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { Router } from '@angular/router';
import { AuthModalService } from '../../core/auth-modal.service';

@Component({
  selector: 'app-login',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: './login.html',
})
export class LoginComponent implements OnInit {
  private authModal = inject(AuthModalService);
  private router = inject(Router);

  ngOnInit(): void {
    this.authModal.open();
    this.router.navigate(['/'], { replaceUrl: true });
  }
}
