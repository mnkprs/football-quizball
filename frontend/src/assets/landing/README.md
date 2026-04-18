# Landing page assets

Placeholder SVGs and `.TODO` sentinels live here until launch.

Before flipping `environment.prod.ts` `landingMode` to `true`:
- Replace every `.svg` with the real branded asset (logomark, 6 mode icons, 2 store badges).
- Add real PNGs for `hero-phone.png` and `screenshot-{1..5}.png` at 1080×2400 (approx).
- Remove all `.TODO` sentinel files.

Run `ls frontend/src/assets/landing/*.TODO` — if that command finds anything, the landing page is not ready for launch.
