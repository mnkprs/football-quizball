import { Component, ChangeDetectionStrategy } from '@angular/core';
import { Location } from '@angular/common';
import { RouterLink } from '@angular/router';
import { LobbyHeaderComponent } from '../../shared/lobby-header/lobby-header';

@Component({
  selector: 'app-privacy',
  standalone: true,
  imports: [RouterLink, LobbyHeaderComponent],
  templateUrl: './privacy.html',
  styleUrl: './legal.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrivacyComponent {
  constructor(private location: Location) {}
  goBack(): void { this.location.back(); }
}
