# Docs site UI/UX pass

Scope: the site shell (`src/App.tsx`), landing (`src/pages/Landing.tsx`), docs (`src/pages/docs.tsx`), `src/components/*` and `src/index.css`. The battle demo (`src/battle/**`) was not edited; it has its own critique at the end.

Screenshots: `docs/screenshots/site/{before,after}-<page>-<d|m>-<ko|en>.png` (d = 1280×900, m = 390×844) for landing, intro, engine and battle; `{before,after}-landing-full-d-en.png` (whole page, half scale); `after-docs-menu-m-ko.png`.

## Audit (before)

User feedback: "디자인이 직관적이지 않고 조잡함" (unintuitive, cluttered) and "차별성 어필이 없음" (doesn't sell what makes it different).

**Clutter, hierarchy**
- Header used two rows (language switch on the left, centred logo, GitHub plus an accent "Install" pill, then a second nav row) above a 2px light rule: 118px of chrome and several things competing for attention before any content.
- Landing had 8 bands, each separated by a heavy 2px rule: hero, 4 number stats, 4 KPI tiles plus bars, a 9-row comparison table, a "built on" logo grid, 4 alternating feature log windows, an install list with 4 "Guide" pills, a guides list and a closing box. Around 6,500px of page, with no single message.
- Hero had three CTAs of equal weight. "Read the docs" also appeared 3 more times further down. Many small secondary pills ("Methodology", "Read the guide", "All docs", 4× "Guide").
- Every example on the docs pages had its own accent-coloured "Run" pill, so the one accent colour lost its meaning.
- Corner radii were mixed (8px and 12px). Section titles used 30, 40 and 62px, with the line breaks forced by `<br>`.

**Differentiation**
- The hero said "faster and simpler". The real proofs (byte-identical logs, CI fuzzing and invariants, rotation that Showdown lacks, deterministic link replays, the demo) were scattered or missing.
- The "0 / 20,000 battles" KPI could not be traced to the README, scripts or CI. The README says 10,000 per push in CI and 10M in sharded runs.

**Navigation, wayfinding**
- Header nav labels "Docs / API / Tools / Integration" were really doc groups. "Battle demo" sat as the 5th item, with nothing to set it apart.
- **Phones had no docs navigation at all** (`mobileNav={false}`, and the side nav hides below 768px). The only ways to move were the header and the prev/next links.
- Long pages (engine, events, damage) had no on-page table of contents.
- Every page had the same `<title>pokebattle-engine</title>`. Only the battle page set its own title.
- The footer repeated all 18 doc links. On phones its bottom row squeezed the trademark note into a 60px column.

**Readability, a11y**
- Body text ran across 832px (about 120 characters per line in English).
- Contrast is fine: body text #c9c9c8 on #0f1012 is 11.5:1, muted #a3a3a2 is 7.5:1, and nav text is 18:1 (all pass AA).
- There was a skip link (from AppShell) and a global `:focus-visible` ring. Keyboard order was correct.
- Code blocks scroll inside themselves, are focusable and have a copy button. No page-level horizontal scroll at 390px on any page checked (landing plus 7 docs pages plus battle, ko and en).
- The "Run" button had no running state. The landing's log windows showed an English-only "running…".

## Changes (after)

**Shell**
- One 60px header row (56px on phones): brand, then `Docs` and `Battle demo` (the current one gets a filled tab), and on the right KO/EN plus GitHub. The bottom rule is 1px. The header "Install" pill is gone (install lives in the hero).
- Phones get a **docs menu**: a `<details>` disclosure at the top of each doc showing the current page, with the full grouped list (shown below 768px, where the side nav disappears).
- **On this page** TOC on docs with 3 or more sections. It is built from the `H2`s in the page body (pure, no DOM effects), and `H2` now gets a stable `id`. Links scroll with JS so the hash router is not disturbed, and focus moves to the section.
- Prev/next links are now two equal bordered cards with arrows.
- Per-page titles: `<Doc title> - pokebattle-engine`, plus a descriptive landing title. The battle routes still set their own (`if (battle) return`).
- Footer: 3 curated columns (Get started / Guides / Project) instead of 18 doc links. The bottom row stacks cleanly on phones.
- Docs prose is capped at 72ch. Each `H2` gets a 1px rule above it to group the page.
- "Run" buttons are secondary (not accent) and show a loading state plus "Running…" while running (`aria-busy`).
- Tokens: 1px rules, 8px radius everywhere, a spacing scale of 4/8/12/16/24/32/48/64/96 and type sizes of 13/14/16/18/30/52, with one accent colour (buttons and the active state only).

**Landing (built around proof)**
1. Hero: one claim, "Byte-for-byte Showdown battles, 1.6–1.9× faster", plus a one-line subline. One primary action ("Try the battle demo"), one secondary ("Read the docs") and the copyable install line.
2. "What makes it different": 6 equal cards, each with a claim, a short explanation, a monospace **proof tag** and a link to where it can be checked:
   - Speed: singles 1.001 → 0.622 ms/turn (`bench:compare`), linking to the in-browser bench.
   - CI: a regression sweep of every move, ability and item, 8 fuzz invariants, `check-dist`, and 10,000 battles per push / 10M sharded.
   - Gen 1–9 with every gimmick, plus rotation (which Showdown never implemented).
   - ko/en/ja logs from one message catalog, with names in 9 languages.
   - Deterministic replays: seed plus choices, link-only replays (`#/battle/replay?d=…`).
   - The battle demo itself.
3. Speed bars (the existing `SpeedBars`) with the method in one sentence.
4. "A full battle in twenty lines": the real `quickstart.ts` source next to its live output, run in the browser.
5. Closing: the demo (primary), the install guide and the install command.

Everything in the hero and cards is from `README.md` (Performance, Fuzz tests, Regression sweep, Rotation) and `.github/workflows/ci.yml`. The unverified "20,000 battles" figure in `Compare.tsx` was replaced with "0, from byte-level log checks (fuzz, bench, CI)".

The docs **Introduction** gained a matching "What makes it different" list (5 points, ko/en).

**Result**: the landing went from about 6,500px to about 3,500px tall at 1280. There is one accent action per screen, and there are no heavy rules.

### Checks
- `npm run build`, `npm run lint` and `npm test` (14 files, 70 tests) pass.
- Playwright on the `vite preview` build: landing, intro, install, engine, damage, data, cli, metronome and battle at 1280 and 390, ko and en. No horizontal scroll anywhere, and the right title on every page.
- Docs menu navigation works, a TOC click scrolls and focuses the section, and Run prints output (7 lines). Tab order: skip link → brand → Docs → Battle demo → language → GitHub → side nav.

## Proof pass: "how can anyone trust it from numbers alone?"

Feedback: the landing stated claims (1.6–1.9× faster, byte-identical to Showdown, CI fuzzing) as static numbers. Each key claim now comes with a check the visitor runs in their own browser, or with a link to the primary source.

**1. Verify it now (right under the hero, primary button).** `src/components/VerifyNow.tsx` starts a web worker (`src/proof/verify.worker.ts`) that runs `src/proof/compare.ts`, a browser port of the singles part of `scripts/bench-compare.ts`:
- It records N battles (10/20/50/100) from random seeds, which are shown on the page, so the results can't be precomputed. The engine plays each battle with the fast path off, and the exact strings passed to `choose()` become the Showdown input log.
- **Showdown directly**: that input log is replayed into Showdown's `Battle`. The default is the `@pkmn/sim` copy in the engine bundle with `fast: false` (`replayInputLog`, the original code path; `check-dist.ts` checks in CI that this bundle matches npm `@pkmn/sim`). The **npm @pkmn/sim** toggle instead lazy-loads the unmodified npm package (about 1 MB gzipped, no engine code involved) and runs a 20-line replay loop over the same input log (`src/proof/upstream.ts`).
- **Engine**: `BattleEngine` with default options runs the same config and the same choices.
- Each protocol log is hashed with SHA-256 through WebCrypto. The page shows `n/n byte-identical`, ms/turn for each side and the ratio measured on this device: one warm-up, then the best of 3 alternating rounds. A fine-print line names the browser, OS and core count, the seeds and the turn count, and says this is not the Node 22 benchmark. Behind a disclosure is a table of every battle's two hashes, plus a side-by-side diff of any battle (line numbers, differing lines highlighted, ←/→ to step through battles). Progress shows the phase and time left, Cancel terminates the worker, and controls are disabled while a run is going.
- Headless Chrome 157 (4 cores) measured 1.33–1.47× here, 20/20 identical every run. That is lower than the Node figure, and the page says the browser number is what it is.

**2. Tests on every push.** There is a live CI badge (`ci.yml/badge.svg?branch=main`) linking to the runs, plus links to `src/tests`, the regression snapshot, `scripts/regression.ts`, the fuzz invariant lines in `scripts/fuzz.ts`, `ci.yml` (whose steps upload the fuzz and regression reports as artifacts) and the manual sharded fuzz workflow. The counts are not hand-written. `vite.config.ts` computes `__REPO_STATS__` at build time: the test count from `vitest list --json` at the repo root (271 tests in 12 files at the time of writing), with a fallback to counting `it(`/`test(` (also used by the dev server), plus snapshot entries, fuzz invariant lines and the commit. The page shows which source and commit were used. Note that the badge is honest: it showed **failing** at the time of writing, because the regression sweep on main reports `request`, `silent` and `untranslated` items for gen8 dynamax heal/damage.

**3. Deterministic replays.** `src/components/ReplayProof.tsx` / `src/proof/replay-proof.ts` use the battle demo's own code (`createEngine`, `controllerAI`, `buildReplayData`, `encodeReplay` → `decodeReplay` → `replaySetup`). One CPU-vs-CPU battle becomes a link, the link alone is re-simulated in a fresh engine with no AI, and the page shows both SHA-256 hashes, the link length and a link that opens the battle in `#/battle/replay`. `|debug|` lines are excluded, and the page says so: the AI's look-ahead appends them only to the live battle (for example "natural status immunity"), and Showdown emits them only in debug mode. Every other line is compared byte for byte.

**4. Multilingual logs.** The quickstart output window has a 한국어 / EN / 日本語 switch that re-runs the same seed-42 battle in that language (Japanese lazy-loads its name pack via `loadNames('ja')`). The code pane changes with it.

**Removed or softened.** The hero no longer puts "1.6–1.9×" in the headline ("…faster, don't take our numbers for it"); the Node figure is kept only as the labelled reference in the fine print and the docs. The landing no longer shows the static speed bars (they are still on the Performance doc page). "10M battles in sharded runs" was dropped, because that workflow is manual and there is no public run to point to; it is linked as a manual workflow instead. The gimmick and format claims shrank to one line that links to `gimmicks.test.ts` / `formats.test.ts` and the demo. The six equal-weight claim cards became one primary check plus three claim cards.

**Tests.** `src/proof/compare.test.ts` checks: a known SHA-256 vector; the same N battles give identical hashes on both sides; re-running the same seeds gives the same hashes; a tampered log is caught; and the npm `@pkmn/sim` reference matches. `src/proof/replay-proof.test.ts` checks that a replay link re-simulates to the same log for 3 seeds.

Screenshots: `docs/screenshots/site/proof-*.png` (hero, result at 1280/390, ko 390, npm mode, hash table, diff at 1280/390, replay card, replay viewer, CI card, ja logs, full pages).

## Battle demo: what feels unintuitive or cluttered (not edited, for the battle agent)

Seen in `before-battle-*` and the live setup and battle screens:

**Setup page**
1. Six segmented controls of equal weight in one card (Rules, Rules (generation), Mode, Team size, Sprites, CPU difficulty). There is no order of importance, and "Sprites" (a cosmetic choice) sits next to the rules. Suggestion: group them as "Battle" (rules/gen/mode/size) and "Display" (sprites, maybe sound), with difficulty only when the mode is vs. CPU.
2. Two labels both start with "Rules" ("Rules" and "Rules (generation)"). Rename them to "Format" (Standard/Metronome) and "Generation".
3. The sticky "Fill the empty slots (0/3) · Start battle" bar overlaps the "Opposing team" heading and its first row while scrolling (visible at 1280×900). It needs bottom padding equal to the bar's height, or the bar should not cover headings.
4. The disabled "Start battle" uses a desaturated accent, so it reads as almost enabled. Use a clearly disabled style plus helper text, or make "Random team" the obvious first action when the slots are empty.
5. "Random team" (filled pill) and "Showdown import/export" (bare text) are styled inconsistently, and the opposing team repeats the same pair.
6. The opposing team's cards are dense: type pills, a tera pill and four saturated, type-coloured move pills per card. That is 12+ strong colours in one row, which is the main "cheap/noisy" impression. Use neutral move chips with a small type dot, and save full type colour for the type badges.
7. Empty slots are dashed boxes with an empty dashed sprite square plus an input, three times over. Use one clear call to action, for example "Add Pokémon or roll random".
8. The credits paragraph under the page is a long wall of mixed links. Collapse it into a "Credits" disclosure, or put it in the footer.

**Battle screen**
1. The toolbar (Sprites 2D/3D, speed select, Sound, Exit) uses equal-weight pills above the scene. Exit has the same look as the toggles. Move the display settings into one "⋯ Settings" menu and keep Exit as a quiet text button with a confirmation.
2. The "Run" button appears in trainer battles, where it can't do anything meaningful. Hide it, or label it "Forfeit".
3. The `•••` indicators under the HP boxes are unexplained (stat-change and status slots?). Use labels, or hide them when empty.
4. On phones the side panels (opposing team, battle status, log) collapse into three closed accordions under the controls. The battle log, the most useful one, starts closed. Open the log by default, or show the last 2–3 lines inline.
5. The type badges on the HP boxes use full saturated fills (Water/Fighting/Ice) next to the green HP bar and the accent "Fight" button, so too many colours compete. Use subtler badges.
6. "Turn 1 · No field effects" takes a full card on its own. Fold it into the log header.
7. The scene is about 230px tall on a 390px phone while the controls plus panels take most of the viewport. Give the scene a larger share, or make the command area compact.
