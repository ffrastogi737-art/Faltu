# WHAT IF? Offline decision simulator

Explore hypothetical decisions (start a business, learn a skill, change any numeric assumption) and compare their outcomes before you act. Every number comes from a deterministic engine on the device. AI is optional and is never used for calculations.

## Run, test, build

```bash
cd whatif
npm start                 # http://127.0.0.1:8090  (HOST=0.0.0.0 npm start to open it from a phone on your LAN)
npm test                  # 49 unit/integration tests (node:test, no install needed)
npm run e2e               # full acceptance run in Chromium (Playwright); uses .models/stories260K.gguf if present
node scripts/ai-e2e.js    # optional: real Qwen2.5-0.5B through the UI (slow; needs the model in .models/)
```

Test models for the e2e scripts are not committed. Fetch them with:

```bash
mkdir -p .models && cd .models
curl -LO https://huggingface.co/ggml-org/models/resolve/main/tinyllamas/stories260K.gguf
curl -LO https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf
```

**Android APK.** Requires an Android SDK with `platforms;android-35` and `build-tools;35.0.0`:

```bash
export ANDROID_HOME=/path/to/android-sdk
cd whatif/android && ./gradlew assembleRelease     # -> app/build/outputs/apk/release/app-release.apk
```

The APK (about 3.7 MB) bundles the web app and the llama.cpp WebAssembly runtime, but no model weights. It is signed with the committed sideload key `android/app/whatif-sideload.jks`, so newer builds install over older ones without losing data. Use a private key before publishing to a store. Requires Android 8.0+ with an up-to-date Android System WebView.

## Architecture

The repository root held a different project (LIFE RPG) and there was no existing WHAT IF? code, so this app lives in `whatif/`. It reuses the stack already proven in this repo: zero-dependency ES modules, IndexedDB, a service worker for offline use, a native WebView shell for the APK, and node:test plus Playwright for testing.

```
src/engine/     deterministic simulation (no AI, no DOM)
  business.js     monthly revenue, costs, tax with loss carry-forward, payment delays, launch delay, cash, break-even, runway
  career.js       hours, weeks, cost, finish date, milestones
  custom.js       user variables + formulas via expr.js, a safe parser (no eval)
  analysis.js     comparisons, safe % change, one-at-a-time sensitivity, what-if changes
  montecarlo.js   seeded mulberry32 PRNG, uniform/triangular/normal, percentiles, histogram, correlations
  tree.js         decision trees with expected values, probability validation, links to scenario results
  scenario.js     one adapter per type, input provenance, readiness checks
  report.js       Markdown report + CSV projections
src/ai/
  provider.js     LocalAIProvider interface: RuleProvider (always available) and LlamaProvider (llama.cpp)
  schema.js       strict JSON schema + validator for AI drafts; unknowns stay null
  rules.js        rule-based interpreter (₹/$/€, lakh/crore/k, durations, hours/week)
  gguf.js         GGUF v2/v3 header reader, compatibility and memory estimate
  models.js       model catalog, import/download into the app-private file system (OPFS)
  explain.js      template explanations (no AI) and the fact sheet the model may talk about
src/data/store.js IndexedDB, one transaction per change, schema migrations, export/import/wipe
src/ui/           12 screens: Home, Create, Business/Career/Custom simulators, Results, Lab, Compare,
                  Decision trees, History, Model manager, Settings, Export
```

**Provenance.** Every input is tagged as *your fact*, *your assumption*, *example value* or *AI suggestion*. The engine refuses to run while any AI suggestion is unconfirmed. Results list the inputs grouped by tag, separately from the calculated outputs. Every result shows its formulas with your numbers substituted in.

**AI workflow.** Text → interpreter (local model if loaded, otherwise rules) → JSON constrained by the schema (grammar-based sampling) → `validateDraft` (types, ranges, allowed fields; missing inputs are recomputed, never taken from the model) → user confirmation → deterministic engine → optional AI explanation, generated only from a fact sheet of calculated numbers and labelled as AI-written.

## Local AI: findings

- **Runtime.** llama.cpp, via [wllama](https://github.com/ngxson/wllama) 3.8.1 (MIT, pinned and vendored in `vendor/wllama`). It runs the same GGUF models as native llama.cpp, inside the WebView, so I could actually test it in this environment. A native JNI build could not be tested here: there is no device or emulator (no hardware virtualisation).
- **Models (verified on Hugging Face).** The default is Qwen2.5-0.5B-Instruct Q4_K_M (491 MB, Apache-2.0); Qwen2.5-1.5B-Instruct Q4_K_M (1.1 GB, Apache-2.0) is offered for phones with 6 GB+ RAM. Neither is bundled; you download one on request, or import a GGUF file you already have.
- **Measured here** (container CPU, 2 WASM threads): Qwen 0.5B import 4.8 s, load 10.9 s, interpretation of the example sentence 91.5 s. It correctly extracted ₹50,000 cash, ₹400 price, 30 sales/month and 12 months, and left the unstated costs null. It also invented `initialInvestment: 0`, which the UI holds for confirmation. Phone speed will differ, and on many phones it will be slower. That's why the rule-based interpreter (instant) is the default and AI runs show streaming progress and a Cancel button.
- **Reusing another app's model.** Android sandboxing keeps other apps' files private. No AI app I know of exposes its model or a documented local inference service to third-party apps, so the app does not try to reach into them. The supported reuse path is **Import .gguf**: pick a model file you already have (e.g. in Downloads) through the system file picker, so you don't download it twice. Google's Gemini Nano (AICore) is reachable only through its own SDK on specific phones; it would be a second runtime and is not integrated.

## Privacy

No account and no analytics. Data lives in IndexedDB plus the app-private file system. The only network request is a model download you start yourself (straight from huggingface.co); the content security policy allows nothing else. Exports never include model files. *Delete everything* also removes downloaded models.

## Verification status (actually run)

- `npm test`: 49 tests pass. They cover hand-calculated business, break-even, tax, payment-delay and runway cases; career dates and costs; expression parsing and safety; % change edge cases; sensitivity ordering; decision trees; Monte Carlo reproducibility and statistics (checked against analytic values); schema validation; rule parsing; the GGUF reader on the real Qwen file; persistence, rollback, migrations and export/import.
- `npm run e2e`: passes in Chromium with a Pixel 7 viewport. It walks through all 17 acceptance criteria, including a real local-model import and load, interpretation, cancelling an explanation, removing the model, a corrupted-file error, offline mode, restart persistence, export, delete and restore.
- `scripts/ai-e2e.js` with real Qwen2.5-0.5B: passes (numbers above).
- APK: builds and the signature verifies. **Not run on a phone**: no device or emulator is available here. On low-memory phones the WebView may not have enough memory for a 0.5B model; the app reports the load failure and keeps working without AI.
