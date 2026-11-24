// ─── 리플레이 → 한 파일짜리 HTML (Showdown 의 "Download replay" 와 같은 생각) ───────────
// 정적인 부분(제목·두 팀·턴별 로그)은 저장할 때 현재 언어로 만들어 넣어 오프라인에서도 바로 읽힌다.
// 리플레이 문자열은 <script type="application/json" id="replay"> 에 싣고,
// 온라인이면 호스팅된 리플레이 뷰어(#/battle/replay?d=…)를 새 탭이나 iframe 으로 연다.
// 정적인 부분은 JS 없이도 보인다 (인라인 CSS, 외부 스크립트 없음).
import type { PlayerID } from '../lib/engine'
import type { Frame, PokeView } from '../lib/frame'
import { frameText, type SimulatedReplay } from '../lib/frames'
import { calledMoveIndexes, groupLogByTurn, logTone } from '../lib/hud'
import { msg, type Lang, type MessageKey, type Vars } from '../lib/messages'
import { abilityName, itemName, moveName, particles, pokemonLabel, speciesName, typeName } from '../lib/names'
import { REPLAY_VERSION, type ReplayData } from '../lib/replay'
import { battleSpriteCandidates } from '../lib/sprites'
import type { OfflineReplay } from './player/types'

export const ENGINE_REPO = 'https://github.com/2rangs/pokebattle-engine'

/** 이 파일에만 쓰는 문구 (데모 문구 표는 다른 작업과 겹치지 않게 건드리지 않는다) */
const TEXT = {
  ko: {
    save: 'HTML로 저장',
    saveTip: '리플레이를 HTML 파일로 저장 (인터넷 없이도 애니메이션·로그·팀을 볼 수 있음)',
    saving: 'HTML 파일을 만드는 중… (스프라이트를 파일에 넣는 중)',
    play: '재생',
    pause: '일시정지',
    restart: '처음부터',
    prevTurn: '이전 턴',
    nextTurn: '다음 턴',
    speed: '재생 속도',
    turn: '{n}턴',
    start: '시작',
    progress: '재생 위치',
    offlineNote: '이 파일 하나로 인터넷 없이 재생됩니다.',
    online: '온라인 뷰어로 열기',
    saved: 'HTML 파일을 저장했습니다.',
    saveFailed: 'HTML 파일을 만들지 못했습니다.',
    heading: '배틀 리플레이',
    watch: '애니메이션으로 보기',
    inline: '이 페이지에서 재생',
    inlineHide: '재생 닫기',
    needsOnline: '애니메이션 뷰어는 인터넷 연결이 필요합니다. 아래 팀과 로그는 오프라인에서도 볼 수 있습니다.',
    offline: '지금은 오프라인입니다.',
    teams: '팀',
    log: '배틀 로그',
    result: '결과',
    turns: '{n}턴',
    saved_at: '저장: {date}',
    mismatch: '이 엔진 버전에서 기록을 끝까지 재현하지 못했습니다 ({n}턴까지).',
    item: '도구',
    ability: '특성',
    tera: '테라스탈 타입',
    noItem: '없음',
    data: '리플레이 데이터 (v{v}, {n}자)',
    back: '배틀 데모',
    repo: 'pokebattle-engine (GitHub)',
  },
  en: {
    save: 'Save as HTML',
    saveTip: 'Save the replay as an HTML file (animation, log and teams work offline)',
    saving: 'Creating the HTML file… (embedding sprites)',
    play: 'Play',
    pause: 'Pause',
    restart: 'Restart',
    prevTurn: 'Previous turn',
    nextTurn: 'Next turn',
    speed: 'Playback speed',
    turn: 'Turn {n}',
    start: 'Start',
    progress: 'Playback position',
    offlineNote: 'This single file plays without an internet connection.',
    online: 'Open in the online viewer',
    saved: 'Saved the HTML file.',
    saveFailed: 'Could not create the HTML file.',
    heading: 'Battle replay',
    watch: 'Watch animated',
    inline: 'Play on this page',
    inlineHide: 'Close player',
    needsOnline: 'The animated viewer needs an internet connection. The teams and log below work offline.',
    offline: 'You are offline right now.',
    teams: 'Teams',
    log: 'Battle log',
    result: 'Result',
    turns: '{n} turns',
    saved_at: 'Saved {date}',
    mismatch: 'This engine version could not reproduce the whole record (stopped at turn {n}).',
    item: 'Item',
    ability: 'Ability',
    tera: 'Tera Type',
    noItem: 'None',
    data: 'Replay data (v{v}, {n} chars)',
    back: 'Battle demo',
    repo: 'pokebattle-engine (GitHub)',
  },
} as const satisfies Record<Lang, Record<string, string>>

export type HtmlTextKey = keyof typeof TEXT.ko

const fill = (s: string, vars?: Vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s)
export const htmlText = (lang: Lang, key: HtmlTextKey, vars?: Vars) => fill(TEXT[lang][key], vars)

/** HTML 본문·속성 둘 다에 안전한 이스케이프 */
export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

/** <script> 안의 JSON: </script> 로 끊기지 않게 < 를 이스케이프 */
const scriptJson = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c')

export interface ReplayHtmlInput {
  data: ReplayData
  /** encodeReplay(data) */
  encoded: string
  sim: SimulatedReplay
  lang: Lang
  /** 뷰어 주소 앞부분: `${origin}${pathname}#/battle/replay?d=` */
  viewerBase: string
  /** 데모 주소 (`${origin}${pathname}#/battle`) */
  demoUrl: string
  savedAt?: Date
  /** 오프라인 재생기 (스크립트 + 데이터). 있으면 파일 하나로 애니메이션까지 재생된다 */
  player?: { code: string; data: OfflineReplay }
  /** 팀 목록 카드 그림 (종 → data: URI). 없으면 PokeAPI 주소 */
  cards?: Record<string, string>
}

export interface ReplayHtml {
  html: string
  filename: string
}

/** 리플레이 뷰어·결과 화면과 같은 진영 이름 */
export function sideNamer(data: ReplayData, lang: Lang) {
  const t = (k: MessageKey, v?: Vars) => particles(msg(lang, k, v), lang)
  const spectating = data.p1.ctrl !== 'human' && data.p2.ctrl !== 'human'
  const sideName = spectating ? (p: PlayerID) => t(p === 'p1' ? 'cpu1' : 'cpu2') : undefined
  const nameOf = (p: PlayerID) => (data[p].ctrl === 'human' ? t('replayYou') : spectating ? sideName!(p) : 'CPU')
  return { spectating, sideName, nameOf }
}

const slug = (s: string) => s.normalize('NFKD').replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'player'

/** pokebattle-replay-<p1>-vs-<p2>-<YYYY-MM-DD-HHmm>.html (진영 이름은 영어로, 파일 이름에 안전하게) */
export function replayFileName(data: ReplayData, when: Date = new Date()): string {
  const { nameOf } = sideNamer(data, 'en')
  const pad = (n: number) => String(n).padStart(2, '0')
  const date = `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}-${pad(when.getHours())}${pad(when.getMinutes())}`
  return `pokebattle-replay-${slug(nameOf('p1'))}-vs-${slug(nameOf('p2'))}-${date}.html`
}

/** PokeAPI 정지 도트 (오프라인이면 alt 만 보인다) */
function spriteUrl(species: string): string | null {
  const c = battleSpriteCandidates(species, false)
  return c.find(u => /\/sprites\/pokemon\/\d+\.png$/.test(u)) ?? c.at(-1) ?? null
}

function pokemonCard(p: PokeView, lang: Lang, showTera: boolean, cards?: Record<string, string>): string {
  const label = pokemonLabel(p, lang)
  const species = speciesName(p.setSpecies, lang)
  const src = cards?.[p.setSpecies] ?? spriteUrl(p.setSpecies)
  const moves = p.moves.map(m => `<li>${esc(moveName(m.id, lang))}</li>`).join('')
  const meta = [
    `<dt>${esc(htmlText(lang, 'item'))}</dt><dd>${esc(p.item ? itemName(p.item, lang) : htmlText(lang, 'noItem'))}</dd>`,
    `<dt>${esc(htmlText(lang, 'ability'))}</dt><dd>${esc(abilityName(p.ability, lang))}</dd>`,
    showTera && p.tera_type ? `<dt>${esc(htmlText(lang, 'tera'))}</dt><dd>${esc(typeName(p.tera_type, lang))}</dd>` : '',
  ].join('')
  return `<li class="mon">
<div class="mon-head">${src ? `<img src="${esc(src)}" alt="${esc(species)}" width="56" height="56" loading="lazy">` : ''}<div><b>${esc(label)}</b>${label !== species ? ` <span class="sp">(${esc(species)})</span>` : ''}<div class="lv">Lv.${p.level} · ${esc(p.types.map(x => typeName(x, lang)).join(' / '))}</div></div></div>
<dl>${meta}</dl>
<ul class="moves">${moves}</ul>
</li>`
}

function logHtml(frames: readonly Frame[], lang: Lang, sideName: ((p: PlayerID) => string) | undefined, tail: string | null): string {
  const t = (k: MessageKey, v?: Vars) => particles(msg(lang, k, v), lang)
  const called = calledMoveIndexes(frames)
  const groups = groupLogByTurn(frames)
  const out: string[] = []
  groups.forEach((g, gi) => {
    const lines = g.items
      .map(f => ({ f, text: frameText(f, lang, sideName) }))
      .filter((x): x is { f: Frame; text: string } => x.text !== null)
      .map(({ f, text }) => {
        const c = called.has(f.index)
        return `<li class="tone-${logTone(f.event, c)}">${c ? '↳ ' : ''}${esc(text)}</li>`
      })
    if (gi === groups.length - 1 && tail) lines.push(`<li class="tone-accent">${esc(tail)}</li>`)
    if (lines.length === 0) return
    const head = g.turn === 0 ? t('logStart') : t('turn', { n: g.turn })
    out.push(`<section class="turn" id="turn-${g.turn}"><h3>${esc(head)}</h3><ul>${lines.join('')}</ul></section>`)
  })
  return out.join('\n')
}

const CSS = `
:root{color-scheme:dark;--ground:#0f1012;--raised:#161719;--rule:#252729;--ink:#faf9fa;--ink-2:#d7d7d6;--muted:#a3a3a2;--accent:#b4d3ff;--warn:#e8c35a;--key:#ffb4ab;--fill:rgba(255,255,255,.1)}
*{box-sizing:border-box}
[hidden]{display:none!important}
body{margin:0;background:var(--ground);color:var(--ink-2);font:15px/1.55 system-ui,-apple-system,"Segoe UI","Apple SD Gothic Neo","Noto Sans KR",sans-serif;word-break:keep-all;overflow-wrap:anywhere}
main{max-width:880px;margin:0 auto;padding:24px 16px 48px}
h1{color:var(--ink);font-size:22px;margin:0 0 4px}
h2{color:var(--ink);font-size:17px;margin:28px 0 10px}
h3{color:var(--ink);font-size:14px;margin:0 0 4px}
a{color:var(--accent)}
.sub{color:var(--muted);margin:0 0 12px}
.result{display:inline-block;padding:4px 12px;border-radius:999px;background:var(--fill);color:var(--ink);font-weight:600}
.warn{color:var(--warn)}
.actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:16px 0 4px}
.btn{display:inline-flex;align-items:center;min-height:40px;padding:0 16px;border-radius:999px;border:0;font:inherit;font-weight:600;text-decoration:none;cursor:pointer;background:var(--fill);color:var(--ink)}
.btn.primary{background:var(--accent);color:#0f1012}
.hint{color:var(--muted);font-size:13px;margin:4px 0 0}
#player{margin-top:12px}
#player iframe{width:100%;height:min(88vh,860px);border:1px solid var(--rule);border-radius:8px;background:var(--raised)}
.teams{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,380px),1fr));gap:16px}
.side{background:var(--raised);border:1px solid var(--rule);border-radius:8px;padding:12px}
.side>h3{font-size:15px;margin-bottom:8px}
.side>ul{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.mon{border-top:1px solid var(--rule);padding-top:8px}
.mon:first-child{border-top:0;padding-top:0}
.mon-head{display:flex;gap:8px;align-items:center}
.mon-head img{image-rendering:pixelated;flex:none;color:var(--muted);font-size:11px;overflow:hidden}
.mon b{color:var(--ink)}
.sp,.lv{color:var(--muted);font-size:13px}
.mon dl{display:grid;grid-template-columns:auto 1fr;gap:0 10px;margin:4px 0;font-size:13px}
.mon dt{color:var(--muted)}
.mon dd{margin:0}
.moves{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:4px}
.moves li{font-size:12.5px;padding:1px 8px;border-radius:999px;background:var(--fill)}
.log{background:var(--raised);border:1px solid var(--rule);border-radius:8px;padding:4px 14px}
.turn{border-top:1px solid var(--rule);padding:8px 0}
.turn:first-child{border-top:0}
.turn ul{list-style:none;margin:0;padding:0;font-size:14px}
.tone-key{color:var(--key);font-weight:600}
.tone-accent{color:var(--accent);font-weight:600}
.tone-move{color:var(--ink);font-weight:500;margin-top:4px}
.tone-called{color:var(--warn);font-weight:600}
.tone-dim{color:var(--muted)}
footer{margin-top:32px;color:var(--muted);font-size:12px}
footer p{margin:6px 0}
@media (max-width:520px){h1{font-size:19px}main{padding-top:16px}}
`

/** 오프라인 재생기 (player/main.ts 가 그리는 장면) */
const PLAYER_CSS = `
.op-host{margin:16px 0 4px}
.op{display:flex;flex-direction:column;gap:8px}
.op-scene{position:relative;width:100%;aspect-ratio:16/9;overflow:hidden;border-radius:10px;border:1px solid var(--rule);user-select:none}
.op-bg{position:absolute;inset:0;background:
radial-gradient(ellipse 15% 5% at 72% 54%,rgba(40,70,40,.85),rgba(40,70,40,.85) 60%,transparent 62%),
radial-gradient(ellipse 19% 6% at 27% 92%,rgba(40,70,40,.85),rgba(40,70,40,.85) 60%,transparent 62%),
linear-gradient(180deg,#9fd0f0 0%,#cfe9f7 46%,#a9d48a 46.2%,#7fbf62 100%)}
.op-bg>.bd-g5fx-tint{position:absolute;inset:0;pointer-events:none}
.op-spot{position:absolute;transform:translate(-50%,-100%);display:flex;justify-content:center;align-items:flex-end}
.op-spot.is-foe{left:72%;top:55%;height:36%}
.op-spot.is-ours{left:27%;top:94%;height:48%}
.op-mon,.op-flip{height:100%;display:flex;align-items:flex-end;justify-content:center}
.op-flip.is-flip{transform:scaleX(-1)}
.op-sprite{height:100%;width:auto;max-width:none;object-fit:contain}
.op-sprite.is-px{image-rendering:pixelated}
.op-alt{align-self:center;padding:4px 10px;border-radius:999px;background:rgba(0,0,0,.55);color:#fff;font-size:13px}
.op-fx{position:absolute;inset:0;pointer-events:none}
.op-fx>.bd-g5fx{position:absolute;inset:0;width:100%;height:100%;image-rendering:pixelated}
.op-fx>.bd-g5fx-flash{position:absolute;inset:0}
.op-box{position:absolute;min-width:min(42%,240px);padding:6px 10px 7px;border-radius:8px;background:rgba(20,22,26,.86);color:#fff;font-size:13px;line-height:1.3;box-shadow:0 2px 8px rgba(0,0,0,.3)}
.op-box.is-foe{left:3%;top:6%}
.op-box.is-ours{right:3%;top:60%}
.op-box.is-down{opacity:.55}
.op-box-head{display:flex;align-items:center;gap:6px}
.op-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.op-lv{color:#cfd3da;font-size:12px}
.op-st{padding:0 6px;border-radius:4px;font-size:11px;font-weight:700;color:#fff}
.op-track{margin-top:4px;height:6px;border-radius:3px;background:#3a3d44;overflow:hidden}
.op-bar{height:100%;width:100%;transition:width .45s ease,background-color .45s}
.op-hp{margin-top:2px;text-align:right;font-size:11.5px;color:#cfd3da;font-variant-numeric:tabular-nums}
.op-result{position:absolute;left:50%;top:44%;transform:translate(-50%,-50%);padding:10px 22px;border-radius:999px;background:rgba(15,16,18,.85);color:#fff;font-size:20px;font-weight:700}
.op-msg{min-height:3.2em;padding:10px 14px;border-radius:8px;background:var(--raised);border:1px solid var(--rule);color:var(--ink);font-size:15px}
.op-range{width:100%;accent-color:var(--accent)}
.op-ctrl{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.op-speed{min-height:40px;padding:0 10px;border-radius:999px;border:0;background:var(--fill);color:var(--ink);font:inherit}
.op-turn{margin-left:auto;color:var(--muted);font-size:13px}
.op-mon.is-down{opacity:0;transform:translateY(30%);transition:opacity .35s,transform .35s}
.op-mon.is-hit{animation:op-blink .5s steps(2) 1}
.op-mon.is-crit{animation:op-blink .7s steps(2) 1,op-shake .4s 1}
.op-mon.is-faint{animation:op-faint .6s ease-in 1 forwards}
.op-mon.is-enter{animation:op-enter .45s ease-out 1}
.op-mon.is-heal{animation:op-glow .7s 1}
.op-mon.is-status{animation:op-glow .6s 1}
.op-mon.is-shimmer{animation:op-glow 1s 1}
@keyframes op-blink{0%,100%{opacity:1}50%{opacity:.15}}
@keyframes op-shake{0%,100%{translate:0}25%{translate:-6px}75%{translate:6px}}
@keyframes op-faint{from{opacity:1;transform:none}to{opacity:0;transform:translateY(40%)}}
@keyframes op-enter{from{opacity:0;transform:scale(.2)}to{opacity:1;transform:none}}
@keyframes op-glow{0%,100%{filter:none}50%{filter:brightness(1.8) saturate(.6)}}
@media (prefers-reduced-motion:reduce){.op-mon{animation:none!important}}
@media (max-width:520px){.op-box{font-size:11.5px;min-width:44%;padding:4px 7px}.op-hp{font-size:10.5px}.op-msg{font-size:14px}}
`

/** 온라인일 때만: 뷰어를 이 페이지 안의 iframe 으로 (정적인 부분은 이 스크립트 없이도 완전하다) */
const SCRIPT = `
(function(){
  var cfg = JSON.parse(document.getElementById('replay').textContent);
  var url = cfg.viewer + cfg.d;
  var btn = document.getElementById('inline'), box = document.getElementById('player'), off = document.getElementById('offline');
  function sync(){ off.hidden = navigator.onLine; btn.hidden = !navigator.onLine; }
  sync(); addEventListener('online', sync); addEventListener('offline', sync);
  btn.addEventListener('click', function(){
    if (box.firstChild) { box.textContent = ''; btn.textContent = btn.dataset.show; btn.setAttribute('aria-expanded','false'); return; }
    var f = document.createElement('iframe'); f.src = url; f.title = btn.dataset.show; f.loading = 'lazy';
    box.appendChild(f); btn.textContent = btn.dataset.hide; btn.setAttribute('aria-expanded','true');
  });
})();
`

/** 리플레이 뷰어와 같은 결과 문구 (사람이 있으면 그 사람 기준) */
export function replayResult(data: ReplayData, sim: SimulatedReplay, lang: Lang): string | null {
  const t = (k: MessageKey, v?: Vars) => particles(msg(lang, k, v), lang)
  const { nameOf } = sideNamer(data, lang)
  return sim.winner === null ? null
    : sim.winner === 'draw' ? t('draw')
      : data[sim.winner].ctrl === 'human' ? t('win')
        : data.p1.ctrl === 'human' ? t('lose')
          : t('winnerIs', { name: nameOf(sim.winner) })
}

/** 로그 맨 끝 문장 (기권) */
export function replayTail(data: ReplayData, sim: SimulatedReplay, lang: Lang): string | null {
  const { nameOf } = sideNamer(data, lang)
  return data.forfeit && !sim.error ? particles(msg(lang, 'replayForfeit', { name: nameOf(data.forfeit) }), lang) : null
}

export function buildReplayHtml(input: ReplayHtmlInput): ReplayHtml {
  const { data, encoded, sim, lang, viewerBase, demoUrl } = input
  const savedAt = input.savedAt ?? new Date()
  const t = (k: MessageKey, v?: Vars) => particles(msg(lang, k, v), lang)
  const h = (k: HtmlTextKey, v?: Vars) => htmlText(lang, k, v)
  const { sideName, nameOf } = sideNamer(data, lang)

  const gen = data.rule === 'normal' ? data.gen ?? 9 : 9
  const rule = `${t(data.rule === 'metronome' ? 'ruleMetronome' : 'ruleNormal')}${data.rule === 'normal' ? ` · ${t('genShort', { n: gen })}` : ''}`
  const vs = t('replayVs', { a: nameOf('p1'), b: nameOf('p2') })
  const result = replayResult(data, sim, lang)
  const first = sim.frames[0]
  const showTera = data.rule === 'normal' && gen === 9
  const tail = replayTail(data, sim, lang)
  const viewer = viewerBase + encoded
  const dateText = savedAt.toISOString().slice(0, 16).replace('T', ' ') + ' UTC'

  const team = (p: PlayerID) => `<div class="side"><h3>${esc(nameOf(p))}</h3><ul>${first ? first[p].team.map(x => pokemonCard(x, lang, showTera, input.cards)).join('\n') : ''}</ul></div>`

  const title = `${h('heading')}: ${vs} (${rule})${result ? ` · ${result}` : ''}`
  const embedded = { app: 'pokebattle-engine', kind: 'replay', v: REPLAY_VERSION, d: encoded, viewer: viewerBase, lang }

  const html = `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="pokebattle-engine battle demo">
<title>${esc(title)}</title>
<style>${CSS}${input.player ? PLAYER_CSS : ''}</style>
</head>
<body>
<main>
<header>
<h1>${esc(h('heading'))}: ${esc(vs)}</h1>
<p class="sub">${esc(rule)} · ${esc(h('turns', { n: sim.turns }))} · ${esc(h('saved_at', { date: dateText }))}</p>
${result ? `<p><span class="result">${esc(result)}</span></p>` : ''}
${sim.error ? `<p class="warn" role="alert">${esc(h('mismatch', { n: sim.turns }))}</p>` : ''}
${input.player ? `<div id="offline-player" class="op-host"></div>
<p class="hint">${esc(h('offlineNote'))} <a href="${esc(viewer)}" target="_blank" rel="noopener">${esc(h('online'))}</a></p>` : `<div class="actions">
<a class="btn primary" id="watch" href="${esc(viewer)}" target="_blank" rel="noopener">${esc(h('watch'))}</a>
<button class="btn" id="inline" type="button" hidden aria-expanded="false" data-show="${esc(h('inline'))}" data-hide="${esc(h('inlineHide'))}">${esc(h('inline'))}</button>
<span class="hint warn" id="offline" hidden>${esc(h('offline'))}</span>
</div>
<p class="hint">${esc(h('needsOnline'))}</p>
<div id="player"></div>`}
</header>
<h2>${esc(h('teams'))}</h2>
<div class="teams">${team('p1')}${team('p2')}</div>
<h2>${esc(h('log'))}</h2>
<div class="log">
${logHtml(sim.frames, lang, sideName, tail)}
</div>
<footer>
<p>${esc(t('credits'))}</p>
<p><a href="https://github.com/PokeAPI/sprites">PokeAPI/sprites</a> · <a href="https://github.com/PokeAPI/cries">PokeAPI/cries</a> · <a href="https://github.com/smogon/pokemon-showdown-client">pokemon-showdown-client</a> · <a href="https://github.com/pagefaultgames/pokerogue-assets">pokerogue-assets</a></p>
<p><a href="${esc(demoUrl)}">${esc(h('back'))}</a> · <a href="${ENGINE_REPO}">${esc(h('repo'))}</a> · ${esc(h('data', { v: REPLAY_VERSION, n: encoded.length }))}</p>
</footer>
</main>
<script type="application/json" id="replay">${scriptJson(embedded)}</script>
${input.player ? `<script type="application/json" id="offline-replay">${scriptJson(input.player.data)}</script>
<script>${input.player.code}</script>` : `<script>${SCRIPT}</script>`}
</body>
</html>
`
  return { html, filename: replayFileName(data, savedAt) }
}

/** 저장한 HTML 에서 리플레이 문자열을 다시 꺼낸다 (테스트·불러오기용) */
export function extractEmbeddedReplay(html: string): { v: number; d: string } | null {
  const m = /<script type="application\/json" id="replay">([\s\S]*?)<\/script>/.exec(html)
  if (!m) return null
  try {
    const j = JSON.parse(m[1]!) as { v?: unknown; d?: unknown }
    return typeof j.v === 'number' && typeof j.d === 'string' ? { v: j.v, d: j.d } : null
  } catch {
    return null
  }
}
