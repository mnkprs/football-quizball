# Age Rating — Store Submission Answers

StepOver is taking **Path A**: rate the app 13+ on both stores, disclose "must be 13+" in ToS (already done in `terms.html` section 3), show it during signup (added to auth modal), and let device-level parental controls do the enforcement. No in-app age gate needed.

This doc has the exact answers to give during App Store Connect and Play Console submission questionnaires so you land at a Teen / 13+ rating without over- or under-disclosing.

---

## Apple App Store — Age Rating Questionnaire

App Store Connect → Your app → App Information → Age Rating → **Edit**.

Apple asks ~20 yes/no questions. Answer honestly based on StepOver's content:

| Question | Answer | Why |
|---|---|---|
| Cartoon or Fantasy Violence | **None** | No violence in the app |
| Realistic Violence | **None** | Same |
| Prolonged Graphic or Sadistic Realistic Violence | **None** | Same |
| Profanity or Crude Humor | **None** | All prompts are AI-generated football trivia, no profanity |
| Mature/Suggestive Themes | **None** | Same |
| Horror/Fear Themes | **None** | — |
| Medical/Treatment Information | **None** | — |
| Alcohol, Tobacco, or Drug Use or References | **None** | Avoid generating questions about sponsorship names that include alcohol brands (Heineken Champions League → use "UEFA Champions League" instead) |
| Simulated Gambling | **None** | ELO is a skill rating, not gambling. No loot boxes, no wagering |
| Sexual Content or Nudity | **None** | — |
| Graphic Sexual Content and Nudity | **None** | — |
| **Unrestricted Web Access** | **No** | App does NOT open arbitrary URLs in an in-app browser. Only opens store URLs and your support mailto: |
| **Gambling and Contests** | **No** | Again, ELO is skill, not gambling |
| **Made for Kids** | **No** | Critical answer. Do NOT tick this. The app is for general audience, not directed at children under 13 |
| **Age Assurance** (new 2025 question) | **I have a reasonable belief that my app is not intended for use by children under 13** | This paired with ToS + Age Verification disclaimer is the Path A posture |

**Expected result:** Apple rates the app **12+** (because of the infrequent mild references football content can have — transfer scandals, historical controversies — Apple tends to land football trivia at 12+). This is acceptable and matches our 13+ ToS requirement.

If you want to push for 9+: you will likely be rejected once the reviewer sees user-generated usernames (UGC). UGC historically forces a 12+ minimum.

---

## Google Play — Content Rating (IARC)

Play Console → App content → Content rating → **Start questionnaire**.

Google uses IARC (International Age Rating Coalition) which routes the same answers to multiple regional bodies (ESRB, PEGI, USK, etc.). Google's questionnaire is ~30 questions grouped by category.

### Category: Violence
- All questions → **No**

### Category: Sexuality
- All questions → **No**

### Category: Language
- All questions → **No**

### Category: Controlled Substances
- All → **No** (unless you decide to include brand-sponsor questions — then flag "Alcohol references" for transfer/sponsorship history)

### Category: Gambling
- Does your app contain real-money gambling? → **No**
- Does your app contain simulated gambling? → **No** (ELO / leaderboards don't count)
- Does your app contain loot boxes or random in-app rewards? → **No**

### Category: User-Generated Content & Social
- **Does the app allow users to interact with each other?** → **Yes** (multiplayer, duels, leaderboard)
- **Does the app share user-generated content?** → **Yes** (usernames visible in leaderboards, duels)
- **Does the app share user location?** → **No**
- **Does the app allow purchases?** → **Yes** (Pro subscription via Google Play Billing)

### Category: Miscellaneous
- **Does the app provide unrestricted access to the internet?** → **No**
- **Does the app allow users to access a web browser within the app?** → **No**

**Expected result:** Google gives **Teen (13+)** for PEGI-region markets and **Everyone 10+** or **Teen** for ESRB. The UGC + "allows interaction" answers push this to Teen globally, which matches our 13+ policy.

---

## Privacy / Data Safety disclosures (both stores)

Declare honestly. These questions are separate from age rating but reviewers cross-check against the app's actual behavior.

### Apple — App Privacy Nutrition Labels

Data collected and linked to user identity:
- **Email Address** — App Functionality (auth)
- **Name** — App Functionality (optional display name / username)
- **User ID** — App Functionality (Supabase auth UUID)
- **Purchase History** — App Functionality (Pro subscription status)
- **Product Interaction** — Analytics (Firebase Analytics)
- **Crash Data** — Analytics (when Sentry is wired)
- **Performance Data** — Analytics (same)
- **Other Diagnostic Data** — Analytics (same)

Data collected and NOT linked to user identity:
- None typically. If AdMob serves ads, declare Advertising Data (Coarse Location, Device ID) but be aware this bumps Apple's privacy label accordingly.

Tracking: **No** (unless you later add attribution SDKs).

### Google — Data Safety

Same categories. Play Console walks you through a structured form. Answer honestly — any mismatch between declaration and observed behavior triggers a suspension later.

---

## ToS / Privacy Policy URLs (required by both stores)

These must be public, reachable URLs before you submit. Current status:

- `https://football-quizball.vercel.app/terms` — ✓ (Angular route exists)
- `https://football-quizball.vercel.app/privacy` — ✓ (Angular route exists)

Once you move to a custom domain (`stepovr.com`), update the store listings.

---

## If a reviewer pushes back on Age Rating

Most common rejection reasons for a 13+ rating:

1. **"App contains UGC without a reporting mechanism"** → Add a "Report this user" button to the leaderboard + duel results. Takes ~2 hours. You already have `reports` module on the backend; hook the frontend.
2. **"App has social features without moderation"** → Point to `username-moderation.ts` (now exists) and the fact that all gameplay chat is preset emoji/reactions (no free-text). If you later add free-text chat, you will need a 17+ rating OR an active moderation queue.
3. **"App requests age but does not enforce it"** → Path A does NOT ask for age in-app. The acknowledgement in the signup modal is disclosure, not enforcement. If Apple wants enforcement, escalate to Path B (see `age-gate-path-b-notes.md` — to be written if needed).

---

## Quick verification checklist before submission

- [ ] ToS section 3 states 13+ requirement (already done)
- [ ] Privacy Policy explicitly says app is not directed at children under 13 — **verify this in `privacy.html`**
- [ ] Auth modal shows the age notice near the CTA (just done)
- [ ] Apple Age Rating questionnaire answered per table above → result: 12+ or higher
- [ ] Google IARC questionnaire answered per table above → result: Teen (13+)
- [ ] Privacy labels / Data Safety forms match what the app actually collects
- [ ] ToS + Privacy URLs are publicly reachable on Vercel

If all checked, you have a defensible Path A posture. No in-app age gate required.
