import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-elo-trajectory',
  standalone: true,
  template: '<div>ELO trajectory placeholder</div>',
})
export class EloTrajectoryComponent {
  @Input() data: Array<{ t: string; elo: number }> = [];
}
