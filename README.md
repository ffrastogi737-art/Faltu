> This repository contains three apps: **LIFE RPG** (below), **WHAT IF?**, an offline decision simulator in [`whatif/`](whatif/README.md), and **E.D.I.T.H.**, a terminal coding agent with a multi-provider router in [`codeagent/`](codeagent/README.md).

# LIFE RPG

Turn real-life goals into an RPG: quests, skill trees, XP and levels, milestone boss battles, achievements and honest statistics. Offline-first, private, no account.

## Why this stack

The repository was empty and this environment has no Android SDK, so a native APK could not be built or tested here. LIFE RPG is an **installable Progressive Web App**: Android-first layout, installs to the home screen from Chrome, runs fully offline through a service worker, and stores data in IndexedDB. There are **zero runtime dependencies** and no build step: plain ES modules that run directly in the browser and in Node for tests.

## Run it

```bash
npm start            # http://127.0.0.1:8080  (HOST=0.0.0.0 npm start to reach it from a phone on your LAN)
npm test             # 48 unit/integration tests (node:test, no install needed)
npm run e2e          # full browser journey in Chromium (needs Playwright; preinstalled here)
```

**Install on Android:** serve over HTTPS (any static host such as GitHub Pages or Netlify, or `localhost`), open it in Chrome, then choose *menu → Install app*. Service workers need HTTPS, so offline mode does not work over plain-http LAN addresses.

**Android APK:** `android/` is a native WebView shell (Java, one dependency: `androidx.webkit`). At build time it copies the web app into the APK and serves it from `https://appassets.androidplatform.net`, so everything runs offline on the device. Export opens Android's save dialog, and Import opens the file picker.

```bash
export ANDROID_HOME=/path/to/android-sdk   # needs platforms;android-35 and build-tools;35.0.0
cd android && ./gradlew assembleRelease    # -> app/build/outputs/apk/release/app-release.apk
```

The APK is signed with `android/app/liferpg-sideload.jks`. The key is committed so that newer builds install over older ones without uninstalling, because uninstalling would wipe your progress. Use your own private key before publishing to a store. Gradle uses Google's mirror of Maven Central (configured in `settings.gradle`). Requires Android 7.0+ with an up-to-date Android System WebView. Browser notifications aren't available inside the APK.

## Architecture

```
src/core/      pure business logic (no DOM, no storage)
  engine.js        every state change: quests, skills, goals, bosses, achievements, rollover
  progression.js   XP curve, levels, quest/stage/boss rewards, daily taper
  achievements.js  metrics + unlock rules       recommender.js  adaptive difficulty with reasons
  analytics.js     stats from stored records    planner.js      local goal planner + draft validation
  migrations.js    schema migrations + ledger reconciliation
src/data/store.js   IndexedDB adapter, serialized dispatch, export/import/wipe
src/ai/provider.js  optional Anthropic provider; falls back to the local planner on any failure
src/ui/             views (escaped templating), SVG icon set, controller, styles
fonts/              Chakra Petch + Inter (SIL Open Font License), bundled so the UI works offline
sw.js               offline app shell
```

* **Transactions:** `apply(state, action)` runs on a clone and throws on any invalid transition. The store writes the new state in one IndexedDB transaction and only commits it in memory after the write completes. Dispatches are queued, so a double-tap can never award XP twice.
* **Audit trail:** every XP award is a ledger entry keyed by its source (quest, stage, boss, achievement). A source can appear only once. On load, lifetime and skill XP are rebuilt from the ledger, so a corrupted total cannot add or remove XP. Levels are always derived from XP.
* **Versioning:** the IndexedDB structure version and the app schema version (`SCHEMA_VERSION`, with step-wise migrations) are separate. Imports go through the same migration and validation.

## Game rules

* **Level curve:** the XP to go from level *L* to *L+1* is `base × L^exponent` (default 100 × L^1.5). You can configure it in Profile; levels are recalculated and no XP is ever lost.
* **Quest XP:** computed from difficulty (10–80), a time bonus capped at 3 h, and a small step bonus. Long-term objectives earn ×2. Users cannot type XP values.
* **Anti-farming:** each day the first 8 completions earn full XP, the next 4 earn half, and the rest earn none (they still count as completed). Custom achievements grant badges only, never XP. Skills grow only from quests and boss battles in that skill.
* **Quest states:** active → completed | abandoned | expired. Abandoned and expired quests can be restored; completed is final. You can only complete a quest once its steps and prerequisites are done. Postponing is limited to 5 times, then the app suggests making the quest smaller.
* **No punishment:** missed daily and weekly quests expire with no XP loss. Recurring quests simply spawn the next instance. Streaks allow one rest day, and the best streak is kept forever. Overdue custom quests stay active.
* **Bosses:** 2–10 ordered stages; the last one is the final boss. A stage clears only when it is active, all its linked quests are done, and the user confirms the requirement (with an optional evidence note). Defeating the boss pays a bonus.
* **Adaptive difficulty:** the target difficulty comes from the mode (relaxed/balanced/challenging), your 14-day completion rate, missed quests, time since you were last active, focus skills, goals, skills you've neglected, and the minutes still free today. Every suggestion lists its reasons.

## AI (optional)

By default the app uses only local rules. In Profile you can choose *Anthropic Claude* and enter your own API key. The key stays in a separate IndexedDB store; it is never exported, logged or hardcoded. The SDK (`@anthropic-ai/sdk@0.132.0`, pinned) is loaded from jsdelivr only when you request a plan, and the CSP allows only that CDN and `api.anthropic.com`. Requests use structured JSON output, a timeout, and friendly handling for auth, rate-limit, timeout, network and refusal errors. Any failure falls back to the local planner and tells you why. Every AI or planner draft is validated (ranges, lengths, and an unsafe-activity filter), and nothing is added until you tick the quests you want.

## Privacy and control

No account, tracking, ads, purchases or gambling mechanics. Notifications are off by default; when enabled, you get at most one gentle reminder per day, and only if you have open daily quests. Export downloads all data as JSON. Import validates and migrates the file. *Delete all data* requires typing DELETE and removes everything, including the API key.

## Verification status

* `npm test`: 48 tests pass. They cover the XP formula and levels, duplicate-reward prevention, quest completion, editing, invalid input and transitions, prerequisite cycles, the daily taper, rollover and recurrence, skills, boss stage order, achievements, adaptive difficulty, planner and AI fallback and validation, analytics, persistence after restart, failed-write rollback, concurrent taps, export/import, v1→v2 migration, ledger repair, and running with no network.
* `npm run e2e`: passes in Chromium with a Pixel 7 viewport. The run creates a character, a skill (rename and disable) and a goal; accepts a suggestion and creates, edits and completes a multi-step quest (XP awarded once, level-up shown); plans a goal into a 5-stage boss with linked quests and defeats it; checks achievements and stats; reloads with progress intact; goes offline and completes a quest; exports (key excluded), deletes and re-imports. Screenshots go to `e2e-output/`.
* APK: builds and verifies (signature and contents checked). Not run on a device or emulator, because this machine has no hardware virtualisation.
* Not verified: a live Anthropic call (no key) and notifications on a real device.
