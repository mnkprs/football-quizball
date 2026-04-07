# Changelog

All notable changes to Stepover will be documented in this file.

## [0.1.0.0] - 2026-04-08

### Changed
- Redesigned ELO system with 7 tiers (Iron/Bronze/Silver/Gold/Platinum/Diamond/Challenger) using expanding tier gaps for gradual progression
- Added EXPERT difficulty level for 1800+ ELO players with 20s time limit and elite-level questions
- Updated K-factor bands to 40/32/24/16 aligned with 4 difficulty zones (EASY/MEDIUM/HARD/EXPERT)
- Raised ELO floor from 100 to 500 so players can't fall into an unrecoverable hole
- Shortened provisional multiplier period (1.5x for first 30 questions, 1.25x for 30-99, settled at 100+)
- Aligned bot skill thresholds to the 7-tier system (0.20-0.70 range)
- Aligned minority scale and difficulty ranges to new ELO breakpoints
- Updated frontend tier display with Platinum tier and new thresholds (500/750/1000/1300/1650/2000/2400)

### Added
- New ELO tier achievements (Bronze 750, Silver 1000, Gold 1300, Platinum 1650, Challenger 2400)
- EXPERT difficulty scoring threshold in question difficulty scorer (raw score 0.62+)
- ELO service unit tests (12 tests covering difficulty mapping, K-factors, provisional multiplier, floor)
- ELO floor migration bumping all existing players below 500 to the new floor
