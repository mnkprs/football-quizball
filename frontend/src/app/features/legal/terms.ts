import { Component, ChangeDetectionStrategy } from '@angular/core';
import { Location } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-terms',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './terms.html',
  styleUrl: './legal.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TermsComponent {
  constructor(private location: Location) {}
  goBack(): void { this.location.back(); }
}
