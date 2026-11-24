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

export const ENGINE_REPO = 'https://github.com/2rangs/pokebattle-engine'

/** 이 파일에만 쓰는 문구 (데모 문구 표는 다른 작업과 겹치지 않게 건드리지 않는다) */
const TEXT = {
  ko: {
    save: 'HTML로 저장',
    saveTip: '리플레이를 HTML 파일로 저장 (오프라인에서도 로그·팀을 볼 수 있음)',
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
    saveTip: 'Save the replay as an HTML file (log and teams readable offline)',
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

function pokemonCard(p: PokeView, lang: Lang, showTera: boolean): string {
  const label = pokemonLabel(p, lang)
  const species = speciesName(p.setSpecies, lang)
  const src = spriteUrl(p.setSpecies)
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

export function buildReplayHtml(input: ReplayHtmlInput): ReplayHtml {
  const { data, encoded, sim, lang, viewerBase, demoUrl } = input
  const savedAt = input.savedAt ?? new Date()
  const t = (k: MessageKey, v?: Vars) => particles(msg(lang, k, v), lang)
  const h = (k: HtmlTextKey, v?: Vars) => htmlText(lang, k, v)
  const { sideName, nameOf } = sideNamer(data, lang)

  const gen = data.rule === 'normal' ? data.gen ?? 9 : 9
  const rule = `${t(data.rule === 'metronome' ? 'ruleMetronome' : 'ruleNormal')}${data.rule === 'normal' ? ` · ${t('genShort', { n: gen })}` : ''}`
  const vs = t('replayVs', { a: nameOf('p1'), b: nameOf('p2') })
  // 리플레이 뷰어와 같은 결과 문구 (사람이 있으면 그 사람 기준)
  const result = sim.winner === null ? null
    : sim.winner === 'draw' ? t('draw')
      : data[sim.winner].ctrl === 'human' ? t('win')
        : data.p1.ctrl === 'human' ? t('lose')
          : t('winnerIs', { name: nameOf(sim.winner) })
  const first = sim.frames[0]
  const showTera = data.rule === 'normal' && gen === 9
  const tail = data.forfeit && !sim.error ? t('replayForfeit', { name: nameOf(data.forfeit) }) : null
  const viewer = viewerBase + encoded
  const dateText = savedAt.toISOString().slice(0, 16).replace('T', ' ') + ' UTC'

  const team = (p: PlayerID) => `<div class="side"><h3>${esc(nameOf(p))}</h3><ul>${first ? first[p].team.map(x => pokemonCard(x, lang, showTera)).join('\n') : ''}</ul></div>`

  const title = `${h('heading')}: ${vs} (${rule})${result ? ` · ${result}` : ''}`
  const embedded = { app: 'pokebattle-engine', kind: 'replay', v: REPLAY_VERSION, d: encoded, viewer: viewerBase, lang }

  const html = `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="pokebattle-engine battle demo">
<title>${esc(title)}</title>
<style>${CSS}</style>
</head>
<body>
<main>
<header>
<h1>${esc(h('heading'))}: ${esc(vs)}</h1>
<p class="sub">${esc(rule)} · ${esc(h('turns', { n: sim.turns }))} · ${esc(h('saved_at', { date: dateText }))}</p>
${result ? `<p><span class="result">${esc(result)}</span></p>` : ''}
${sim.error ? `<p class="warn" role="alert">${esc(h('mismatch', { n: sim.turns }))}</p>` : ''}
<div class="actions">
<a class="btn primary" id="watch" href="${esc(viewer)}" target="_blank" rel="noopener">${esc(h('watch'))}</a>
<button class="btn" id="inline" type="button" hidden aria-expanded="false" data-show="${esc(h('inline'))}" data-hide="${esc(h('inlineHide'))}">${esc(h('inline'))}</button>
<span class="hint warn" id="offline" hidden>${esc(h('offline'))}</span>
</div>
<p class="hint">${esc(h('needsOnline'))}</p>
<div id="player"></div>
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
<script>${SCRIPT}</script>
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
