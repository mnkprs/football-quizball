import { Component, ChangeDetectionStrategy } from '@angular/core';
import { Location } from '@angular/common';
import { RouterLink } from '@angular/router';
import { LobbyHeaderComponent } from '../../shared/lobby-header/lobby-header';

@Component({
  selector: 'app-terms',
  standalone: true,
  imports: [RouterLink, LobbyHeaderComponent],
  templateUrl: './terms.html',
  styleUrl: './legal.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TermsComponent {
  constructor(private location: Location) {}
  goBack(): void { this.location.back(); }
}
