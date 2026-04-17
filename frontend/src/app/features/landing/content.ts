export interface FeatureCard {
  name: string;
  description: string;
  iconPath: string;
}

export interface HowItWorksStep {
  n: number;
  title: string;
  description: string;
}

export const HERO_HEADLINE = 'Football trivia, head-to-head.';
export const HERO_SUBHEAD = 'Duel friends, climb ELO, master the badges.';
export const FINAL_CTA_HEADLINE = 'Ready to play?';
export const FOOTER_TAGLINE = 'Football trivia, head-to-head.';
export const CONTACT_EMAIL = 'support@stepover.app';

export const FEATURE_CARDS: readonly FeatureCard[] = [
  { name: 'Logo Quiz',     description: 'Guess the club from the crest.',         iconPath: 'assets/landing/icon-logo-quiz.svg' },
  { name: 'Duel',          description: 'Head-to-head ELO trivia matches.',       iconPath: 'assets/landing/icon-duel.svg' },
  { name: 'Battle Royale', description: 'Last player standing wins.',             iconPath: 'assets/landing/icon-battle-royale.svg' },
  { name: 'Solo ELO',      description: 'Climb the ranked ladder alone.',         iconPath: 'assets/landing/icon-solo.svg' },
  { name: 'Mayhem',        description: 'Chaotic multi-topic sprints.',           iconPath: 'assets/landing/icon-mayhem.svg' },
  { name: 'Blitz',         description: '60-second rapid-fire rounds.',           iconPath: 'assets/landing/icon-blitz.svg' },
];

export const HOW_IT_WORKS: readonly HowItWorksStep[] = [
  { n: 1, title: 'Download', description: 'Tap the store badge for your device.' },
  { n: 2, title: 'Sign up',  description: 'Create a free StepOver profile in seconds.' },
  { n: 3, title: 'Play',     description: 'Pick a mode and start climbing.' },
];

export const SCREENSHOTS: readonly string[] = [
  'assets/landing/screenshot-1.png',
  'assets/landing/screenshot-2.png',
  'assets/landing/screenshot-3.png',
  'assets/landing/screenshot-4.png',
  'assets/landing/screenshot-5.png',
];
