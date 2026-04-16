import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { LanguageService } from '../../core/language.service';
@Component({
  selector: 'app-loading',
  standalone: true,
  imports: [CommonModule, NgOptimizedImage],
  templateUrl: './loading.html',
  styleUrl: './loading.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoadingComponent {
  constructor(readonly lang: LanguageService) {}
}
