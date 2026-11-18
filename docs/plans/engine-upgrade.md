# 엔진 고도화 계획 — "Showdown 과 같은 결과, 더 빠르고 더 쉽게"

> 상태: 검토용 초안 (2026-11-18) · 대상: `@kyasi/pokebattle-engine`

## 0. 한 줄 포지셔닝

**Pokémon Showdown 과 판정이 100% 같으면서, 더 빠르고, 코드 한 줄로 쓰는 배틀 엔진.**

차별점은 세 가지이고, 셋 다 **숫자나 코드로 증명할 수 있어야** 내세운다.

| 축 | 내세울 문장 | 증명 방법 |
|---|---|---|
| 성능 | "같은 시드 → Showdown 과 같은 로그, 턴당 N배 빠름" | 공개 벤치마크 스크립트 + 로그 동일성 퍼징 |
| 간결성 | "`battle.move('earthquake')` — 인덱스·선택 문자열 없음" | README 의 Showdown 코드 vs 우리 코드 비교 |
| 직관성 | "상태·이벤트·에러가 처음부터 구조화, 한국어 설명" | 타입 정의 + 에러 메시지 예시 |

판정 정확도(메커니즘)는 Showdown 을 그대로 쓰므로 **경쟁하지 않는다**. 이게 우리의 안전판이다:
메커니즘은 Showdown 이 책임지고, 우리는 속도와 사용성만 책임진다.

---

## 1. 현재 실측 (기준선)

같은 무작위 팀 300판, Node 22, 같은 머신.

| 항목 | Showdown(`@pkmn/sim`) 직접 | 우리 엔진 | 비고 |
|---|---|---|---|
| 턴당 시간 | 1.08 ms | 1.45 ms | **우리가 34% 느림** |
| 배틀당 시간 | 45.9 ms | 49.9 ms | |
| 배틀 복제 (`toJSON`→`fromJSON`) | 1.05 ms | 동일 | 턴 하나 처리하는 것과 비슷한 비용 |
| `getState()` | — | 0.01 ms | 이미 충분히 빠름 |
| 모듈 로드 | 467 ms | +649 ms (데이터 포함) | 첫 배틀 생성 56 ms |
| 번들 (ESM) | — | 439 KB (+ sim 의존성) | |

CPU 프로파일 (자기 시간 상위):

| 함수 | 시간 | 소속 |
|---|---|---|
| `getCallback` | 7.5 s | Showdown 이벤트 탐색 |
| `findEventHandlers` | 4.1 s | Showdown 이벤트 탐색 |
| `deepClone` | 2.3 s | Showdown 데이터 복사 |
| `findPokemonEventHandlers` | 1.8 s | Showdown 이벤트 탐색 |
| `runEvent` | 1.3 s | Showdown |
| GC | 1.3 s | |
| `parseLine` / `buildView` | 0.3 / 0.2 s | **우리 코드** |

**결론:** 시간의 대부분은 Showdown 의 이벤트 디스패치(이벤트마다 모든 효과 객체에서
`on${이벤트}` 콜백을 문자열 키로 찾는 부분)에 쓰인다. 우리 래퍼 오버헤드는 몇 % 수준이다.
→ "Showdown 보다 빠르다"는 **Showdown 내부 핫패스를 패치해야만** 가능하다.
로테이션(`src/engine/rotation.ts`)이 이미 런타임 패치 방식을 쓰고 있으므로 같은 방식으로 간다.

---

## 2. 축 1 — 성능

### 2.1 원칙
- **결과 불변:** 패치 전후로 같은 시드의 프로토콜 로그가 바이트 단위로 같아야 한다. 하나라도 다르면 그 패치는 버린다.
- **끄고 켤 수 있음:** `new BattleEngine(config, { fast: false })` 로 원본 Showdown 경로를 쓸 수 있어야 한다 (버그 신고 시 대조용).
- **우리 배틀에만 적용:** 패치는 엔진이 만든 `Battle` 에만 걸리고, 같은 프로세스의 다른 `@pkmn/sim` 사용자에게 새지 않는다.

### 2.2 작업 항목 (효과 큰 순)

| # | 작업 | 내용 | 예상 효과 |
|---|---|---|---|
| P1 | 콜백 존재 인덱스 | 효과(특성·도구·상태·기술·종) 객체마다 "가진 `on*` 콜백 이름 집합"을 한 번 계산해 캐시. `getCallback` 은 집합에 없으면 즉시 `undefined`. 대부분의 조회가 "없음"이라 여기서 크게 준다. | `getCallback` 7.5 s 의 대부분 |
| P2 | 핸들러 수집 단락 | `findEventHandlers` 에서 이번 이벤트 이름을 가진 효과가 배틀 전체에 하나도 없으면(인덱스로 판단) 수집 자체를 건너뜀. `onAlly/onFoe/onAny/onSource` 접두 변형도 같은 인덱스로. | `findEventHandlers` 4.1 s 일부 |
| P3 | 불필요한 복사 제거 | `deepClone` 호출 지점(기술 사용 시 기술 객체 복사, 종 데이터 복사) 중 이후에 변경되지 않는 경우를 얕은 복사 또는 공유로. 각 지점마다 로그 동일성으로 검증. | `deepClone` 2.3 s 일부, GC 감소 |
| P4 | `getByID` 캐시 | 조건·특성·도구 `getByID` 를 배틀 단위 Map 으로. | 1.5 s 일부 |
| P5 | 래퍼 경량화 | `parseLine` 정규식 → 첫 토큰 switch, `buildView` 를 바뀐 포켓몬만 갱신(dirty flag). | 우리 몫 0.5 s |
| P6 | 빠른 복제 `engine.clone()` | AI 탐색(MCTS·미니맥스)용. `toJSON/fromJSON` 대신 구조적 복제 + 정적 데이터 공유. Showdown 에는 없는 기능이라 그 자체로 차별점. | 1.05 ms → 목표 0.2 ms 이하 |
| P7 | 지연 로딩 | 한국어 이름·PokeAPI 매핑을 처음 쓸 때 로드, 서브패스(`/calc`, `/data`) 분리로 계산기만 쓰는 사용자는 sim 을 안 불러오게. | 모듈 로드·번들 |

### 2.3 목표 수치 (README 에 공개할 것)
- 턴당: Showdown 직접 대비 **1.5배 이상 빠름** (현재 0.74배).
- 복제: **5배 이상 빠름**.
- 계산기 단독 import: sim 미포함.
- 측정은 `npm run bench:compare` 로 누구나 재현. 결과 표는 CI 에서 갱신.

### 2.4 검증
- `scripts/fuzz.ts` 에 불변식 8 추가: **fast 경로 로그 == 원본 경로 로그** (모든 포맷, 표본이 아니라 전수).
- 기존 불변식(HP 재구성, 기절 수, 결정성) 전부 유지.
- `@pkmn/sim` 버전을 고정하고, 버전 올릴 때마다 퍼징 100만 판을 통과해야 반영.

### 2.5 위험
- Showdown 내부 구현에 의존 → sim 업데이트 시 패치가 깨질 수 있음. 대응: 패치마다 "원본 함수 시그니처/소스 해시" 확인, 다르면 자동으로 원본 경로로 폴백 + 경고.
- 콜백을 런타임에 추가하는 효과(드묾)가 있으면 인덱스가 틀림. 대응: 인덱스를 효과 객체 생성 시점이 아니라 첫 조회 시 계산하고, 퍼징으로 확인.

---

## 3. 축 2 — 간결성 (API)

### 3.1 지금의 불편함
```ts
// 현재: 요청을 받아 인덱스·ID 를 직접 조립
const req = engine.getRequest('p1')
engine.submitAction({ type: 'move', player: 'p1', pokemon_id: req!.active.id, move_index: 0, terastallize: true })
// 더블/트리플: 아예 Showdown 문자열
engine.submitChoice('p1', 'move 1 2, switch 3')
```

### 3.2 제안: 플레이어 핸들 + 이름 기반 행동
```ts
const battle = createBattle({ format: 'singles', p1: myTeam, p2: 'random', seed: 42 })

battle.p1.move('earthquake', { tera: true })
battle.p2.switch('gholdengo')
await battle.turn()                       // 두 쪽 입력이 모이면 진행, 이번 턴 이벤트 반환

// 더블/트리플 — 같은 API, 슬롯만 지정
battle.p1.slot(0).move('protect')
battle.p1.slot(1).move('heat-wave')       // 범위기는 대상 불필요
battle.p1.slot(1).move('u-turn', { target: battle.p2.slot(0) })

// 로테이션
battle.p1.rotate('left').move('surf')

// 할 수 있는 것 묻기
battle.p1.can.move('earthquake')          // { ok: false, reason: 'taunt', message: '도발 때문에 쓸 수 없다' }
battle.p1.options()                       // 이름·한국어 이름·PP·예상 데미지까지 포함한 선택지
```

규칙:
- 기술·포켓몬은 **슬러그, Showdown 이름, 한국어 이름** 모두 허용 (`'지진'`, `'Earthquake'`, `'earthquake'`).
- 인덱스(`move_index`)·포켓몬 ID 는 여전히 받지만 필수가 아님.
- 싱글/더블/트리플/로테이션이 **하나의 API**. `submitChoice` 문자열은 고급용으로만 남김.
- `'random'` 팀, `await battle.run(ai1, ai2)` 같은 한 줄 시뮬레이션.

### 3.3 호환성
- `BattleEngine` / `getRequest` / `submitAction` / `previewDamage` / `formatEvent` / `calculateDamage` 는 그대로 유지
  (Pokestra 가 이 다섯 개를 사용 중). 새 API 는 그 위에 얹는 얇은 층.
- 메이저 버전을 올리지 않고 추가만 한다. 기존 API 의 deprecate 는 새 API 가 안정된 뒤 결정.

---

## 4. 축 3 — 직관성

| # | 작업 | 내용 |
|---|---|---|
| I1 | 한국어 에러·거절 사유 | 행동이 안 되는 이유를 코드 + 한국어 문장으로: `taunt`, `choice_lock`, `no_pp`, `trapped`, `disabled`, `encore`, `imprison`, `heal_block`, `gravity`, `throat_chop`, `already_tera` … Showdown 은 `[Invalid choice]` 한 줄. |
| I2 | 턴 단위 결과 | `await battle.turn()` 이 이벤트 배열 + 요약(`{ ko: [...], damage: {...}, switched: [...] }`) 반환. 로그 문자열 파싱 불필요. |
| I3 | 일관된 상태 | `battle.state` 하나로 전체 상태. 상대 정보는 `battle.p1.view()` 로 **보이는 정보만**(공개/비공개 분리) — 실제 대전 UI·AI 공정성용. Showdown 은 이를 위해 별도 클라이언트 추적기가 필요. |
| I4 | 한국어 우선 | 모든 이름 필드에 `ko` 동반, `formatEvent` 기본 한국어 (이미 일부 구현). |
| I5 | 예상 데미지 내장 | `options()` 선택지마다 `@smogon/calc` 범위와 확정 몇 타 표시 (`previewDamage` 를 선택지에 통합). |
| I6 | 재생·되감기 | `battle.history[turn]` 으로 특정 턴 상태 복원 (P6 빠른 복제 활용). |

---

## 5. 단계와 순서

| 단계 | 내용 | 완료 기준 |
|---|---|---|
| 0 | 비교 벤치마크·동일성 하네스 | `bench:compare` 가 Showdown 직접 vs 엔진 수치 출력, fuzz 불변식 8 추가. 기준선 고정. |
| 1 | 성능 P1–P2 | 턴당 Showdown 보다 빠름(>1.0배), 동일성 퍼징 10만 판 통과 |
| 2 | 성능 P3–P5 | 1.5배 목표 |
| 3 | 새 API (축 2) + I1 | README 예제가 새 API 로, 기존 테스트 전부 통과 |
| 4 | I2–I5 | 공개/비공개 시점, 선택지에 데미지 |
| 5 | P6–P7, I6 | 빠른 복제·되감기, 서브패스 분리 |
| 6 | README 재작성 | 첫 화면: 포지셔닝 문장 + 벤치마크 표 + Showdown 코드 vs 우리 코드 |

각 단계는 별도 PR. 성능을 먼저 하는 이유: 성능 수치가 차별화의 근거이고, 새 API 가 그 위에서 만들어져도 측정이 왜곡되지 않게 하려면 기준선을 먼저 확보해야 한다.

---

## 6. 결정이 필요한 것

1. **Showdown 내부 패치 허용 범위** — 결과 동일성이 보장되면 핫패스 패치를 기본값(on)으로 해도 되는가? (제안: 예, `fast: false` 로 끌 수 있게)
2. **새 API 이름** — `createBattle()` + `battle.p1.move()` 형태로 갈지, 기존 `BattleEngine` 에 메서드를 추가할지. (제안: `createBattle`, 내부는 `BattleEngine`)
3. **한국어 이름 입력 허용** — `move('지진')` 을 받을지. 동음이의·띄어쓰기 문제가 있으나 직관성에 크게 기여. (제안: 허용, 모호하면 에러에 후보 제시)
4. **목표 수치를 README 에 박을지** — 달성 전에는 "목표"로, 달성 후 CI 측정값으로. (제안: 달성 후에만 공개)
