import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-page-header',
  standalone: true,
  imports: [NgOptimizedImage],
  templateUrl: './page-header.html',
  styleUrl: './page-header.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PageHeaderComponent {
  readonly version = environment.appVersion;
  title = input.required<string>();
  titlePart1 = input<string>();
  titlePart2 = input<string>();
  subtitle = input<string>();
  emoji = input<string>('⚽');
  logo = input<string>();
}
