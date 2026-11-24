# 세대별 규칙과 배틀 옵션 (배틀 데모)

배틀은 엔진(= Pokémon Showdown 시뮬레이터 `@pkmn/sim`)이 그 세대 규칙으로 돌립니다: `new BattleEngine({ gen, options })`.
설정 화면의 "이 세대 규칙" 표는 `src/battle/lib/genRules.ts`, 값은 `genRules.test.ts` 가 엔진 데이터(`getTypeChart({ gen })`, `getMove(…, { gen })`, `getSpecies(…, { gen })`, `listItems({ gen })`)로 다시 확인합니다.

## 이 세대 규칙

| 세대 | 게임 | 기믹 | 타입 | 물리/특수 | 능력치 | 특성 | 도구 | 급소 (확률 · 배율) | 날씨 · 필드 | 마비 스피드 |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 레드·그린·피카츄 | — | 15 (악·강철·페어리 없음) | 타입으로 | DV · 능력치 경험치, **특수 하나** | 없음 | 없음 | 스피드 기반 · ×2 | 없음 | 1/4 |
| 2 | 금·은·크리스탈 | — | 17 (+악·강철) | 타입으로 | DV · 능력치 경험치 | 없음 | 있음 | 17/256 · ×2 | 비·쾌청·모래바람 (기술로만) | 1/4 |
| 3 | 루비·사파이어·에메랄드 | — | 17 | 타입으로 | 개체값·노력치·성격 | 있음 | 있음 | 1/16 · ×2 | + 싸라기눈, 특성 날씨는 끝없이 | 1/4 |
| 4 | 다이아몬드·펄·Pt | — | 17 | **기술마다** | 〃 | 있음 | 있음 | 1/16 · ×2 | 〃 | 1/4 |
| 5 | 블랙·화이트 | — | 17 | 기술마다 | 〃 | + 숨겨진 특성 | 있음 | 1/16 · ×2 | 〃 | 1/4 |
| 6 | X·Y | 메가진화 | 18 (+페어리, 강철의 고스트·악 반감 없어짐) | 기술마다 | 〃 | 〃 | 있음 | 1/16 · ×1.5 | 날씨 5턴, 필드(일렉트릭·그래스·미스트) | 1/4 |
| 7 | 썬·문 | 메가진화 · Z기술 · 울트라버스트 | 18 | 기술마다 | 〃 | 〃 | 있음 | 1/24 · ×1.5 | + 사이코필드 | 1/2 |
| 8 | 소드·실드 | 다이맥스 · 거다이맥스 | 18 | 기술마다 | 〃 | 〃 | 있음 | 1/24 · ×1.5 | 〃 | 1/2 |
| 9 | 스칼렛·바이올렛 | 테라스탈 | 18 | 기술마다 | 〃 | 〃 | 있음 | 1/24 · ×1.5 | 싸라기눈 대신 설경(눈) | 1/2 |

출처 (Showdown): 타입·강철 내성 `data/mods/genN/typechart`, 분류 3세대까지 타입으로 (`getMove('crunch', { gen: 3 })` = 특수), 1세대 특수 하나 (`mods/gen1/pokedex`: spa = spd),
1·2세대 특성·성격 없음 (`sim/team-validator.ts`: 'No Ability', 성격 지움), 1세대 도구 없음 (Obtainable Misc), 급소 `sim/battle-actions.ts` getDamage (`gen <= 5` ×2, 6세대 [0,16,…], 7세대부터 [0,24,…]),
`mods/gen1/scripts.ts` (스피드 기반), `mods/gen2/scripts.ts` (17/256), 특성 날씨 `data/conditions.ts` (`gen <= 5` 이면 끝없이), 마비 `mods/gen6/conditions.ts` (1/4) / `data/conditions.ts` (1/2).
팀 프리뷰는 게임(5세대부터)과 Showdown `genNcustomgame` 기본값이 같지만, 데모는 기본으로 끄고 배틀 옵션에서 켭니다.

### 엔진이 1·2세대 세트를 정리한다

Showdown 시뮬레이터는 세트를 그대로 믿기 때문에(검증기가 정리), 엔진이 1·2세대 배틀 전에 검증기처럼 정리합니다 (`adaptSetToGen`):
특성 없음, 성격 없음, 특방 DV·능력치 경험치 = 특공, HP DV 는 다른 DV 로 정해짐, 1세대는 도구 없음. 예전에는 1·2세대 배틀에서도 위협(특성)·고집(성격)·먹다남은음식(1세대)이 적용됐습니다.
데모 팀 빌더도 1·2세대에서 특성·성격·노력치 칸을 숨기고 능력치 경험치를 모두 최대(252, Showdown 팀 빌더 기본)로 둡니다.

## 배틀 옵션 → 엔진 규칙

| 옵션 | 엔진 `options` | Showdown 규칙 | 언제 |
|---|---|---|---|
| 팀 프리뷰 (순서만) | `teamPreview: true` | Team Preview | 배틀 시작 |
| 팀 프리뷰 (k마리) | `pickedTeamSize: k` | Picked Team Size = k (+ Team Preview) | 배틀 시작 |
| 레벨 50 / 100 | `level` | Adjust Level | 시작할 때 세트에 |
| 랜덤배틀 레벨 | (없음) 세트마다 `getRandomBattleSet(종, gen).level` | — | 팀 빌더 |
| 테라스탈 끔 (9) | `terastal: false` | Terastal Clause | 배틀 중 |
| 다이맥스 끔 (8) | `dynamax: false` | Dynamax Clause | 배틀 중 |
| 메가진화 끔 (6·7) | `megaEvolution: false` | **Mega Evolution Clause** (엔진 규칙, 울트라버스트 포함) | 배틀 중 |
| Z기술 끔 (7) | `zMoves: false` | **Z-Move Clause** (엔진 규칙) | 배틀 중 |
| 같은 종 금지 | `speciesClause` | Species Clause | 시작 전 검사 |
| 같은 도구 금지 (2세대~) | `itemClause` | Item Clause = 1 | 시작 전 검사 |
| 수면 클로즈 | `sleepClause` | Sleep Clause Mod | 배틀 중 |
| 일격기 금지 | `ohkoClause` | OHKO Clause | 시작 전 검사 |
| 회피 금지 | `evasionClause` | Evasion Clause (Abilities + Items + Moves) | 시작 전 검사 |
| 끝없는 배틀 금지 | `endlessBattleClause` | Endless Battle Clause | 배틀 중 |

- Showdown 에는 메가진화 전체·Z기술을 끄는 규칙이 없어(`Mega Rayquaza Clause` 뿐) 엔진이 같은 방식(`onBegin`)의 규칙 둘을 등록합니다 (`src/engine/gimmickrules.ts`). 원시회귀는 도구 효과라 그대로입니다.
- "시작 전 검사" 규칙은 데모가 팀 위에 먼저 보여 주고(같은 목록: `lib/options.ts` `teamRuleIssues`), 엔진도 Showdown 검증기로 다시 검사해 어기면 `BattleError` 를 던집니다(시작 칸에 표시).
- 랜덤 팀·다시 뽑기는 같은 도구 금지에 맞춰 겹치는 도구를 바꿉니다(`fitClauses`). 직접 고른 세트는 바꾸지 않습니다.

### 프리셋

| 프리셋 | 마릿수 | 팀 프리뷰 | 레벨 | 기믹 | 클로즈 |
|---|---|---|---|---|---|
| 자유 (기본) | 3 | 없음 | 50 | 켬 | 없음 |
| 대회식 6→3 | 6 | 3마리 선택 | 50 | 켬 | 같은 종, 같은 도구 (2세대~) — Showdown Flat Rules |
| Smogon 클로즈 | 6 | 5세대부터 순서만 | 100 | 켬 (8세대는 다이맥스 끔 — Smogon OU) | 같은 종·수면·일격기·회피·끝없는 배틀 — Showdown Standard |

## 팀 프리뷰

엔진 `getTeamPreview(player)` → `{ team, pick }`, 행동 `{ type: 'team', order }`. 사람은 프리뷰 화면에서 순서대로 누르고(처음 = 선발), CPU 는 상대 팀 전체와의 타입 상성 합으로 고릅니다 (`lib/frames.ts` `previewPick`, 쉬움은 파티 순서). 리플레이에는 `team` 행동 튜플로 남습니다.
