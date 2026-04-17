import { Component, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { environment } from '../../../environments/environment';
import { detectPlatform, Platform } from './platform-detector';
import {
  HERO_HEADLINE, HERO_SUBHEAD, FINAL_CTA_HEADLINE, FOOTER_TAGLINE, CONTACT_EMAIL,
  FEATURE_CARDS, HOW_IT_WORKS, SCREENSHOTS,
} from './content';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [],
  templateUrl: './landing.html',
  styleUrl: './landing.scss',
})
export class LandingComponent {
  private doc = inject(DOCUMENT);

  readonly heroHeadline = HERO_HEADLINE;
  readonly heroSubhead = HERO_SUBHEAD;
  readonly finalCtaHeadline = FINAL_CTA_HEADLINE;
  readonly footerTagline = FOOTER_TAGLINE;
  readonly contactEmail = CONTACT_EMAIL;
  readonly features = FEATURE_CARDS;
  readonly steps = HOW_IT_WORKS;
  readonly screenshots = SCREENSHOTS;
  readonly stores = environment.stores;
  readonly year = new Date().getFullYear();

  readonly platform: Platform = detectPlatform(
    this.doc.defaultView?.navigator?.userAgent ?? ''
  );
}
