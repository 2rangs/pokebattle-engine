// ─── 배틀 데모 페이지 (#/battle): 설정(일반 / 손가락흔들기) → 배틀 화면 ─────
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'
import { abilityName, speciesName } from './lib/names'
import type { MetronomeSetup } from './lib/replay'
import { iconCandidates } from './lib/sprites'
import { activeTeam, forGen, MAX_TEAM, randomTeam, slotsFor, TEAM_SIZES, type TeamSize } from './lib/team'
import { hasErrors, validateSet, type TeamRules } from './lib/editor'
import type { BattleSetup } from './lib/frames'
import { BattleView } from './ui/BattleView'
import { TeamPreview } from './ui/TeamPreview'
import { metronomePreview, type PreviewMon } from './lib/preview'
import { FallbackImg, TypeBadge } from './ui/bits'
import { Credits } from './ui/common'
import { SpeciesSlots, TeamBuilder } from './ui/TeamBuilder'
import { useBattleSession } from './ui/useBattleSession'
import { useEngineReady } from './ui/useEngineReady'
import { ALL_GIMMICKS, GENS, gimmicksOf, type Gen, type GenGimmicks } from './lib/gimmick'
import { genFacts, genInfo } from './lib/genRules'
import {
  applyLevel, CLAUSE_KEY, fitClauses, CLAUSES, engineOptions, GIMMICK_KEY, levelFor, LEVELS, optionsSummary, PRESET_DESC, PRESET_KEY, PRESETS,
  presetOptions, SANDBOX_PRESETS, sandboxEngineOptions, sandboxPreset, sandboxSet, startErrorLines, teamRuleIssues, withOption, withSandbox,
  type BattleOptions, type SandboxOptions, type SandboxPreset,
} from './lib/options'
import { sandboxRandomTeam } from './lib/sandbox'
import {
  optionsOf, switchGen, switchRule, updateSettings, useBT, useSettings,
  type DemoSettings, type Difficulty, type MetronomeForm, type Mode, type Rule, type SpriteStyle,
} from './ui/state'
import './battle.css'

const newSeed = () => Math.floor(Math.random() * 1e9)

const STAT_KEYS = ['hp', 'attack', 'defense', 'special_attack', 'special_defense', 'speed'] as const

function Setting({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="bd-setting">
      <span className="bd-setting-label">{label}</span>
      {children}
      {hint && <p className="bd-setting-hint">{hint}</p>}
    </div>
  )
}

/** 손가락흔들기 랜덤 팀 미리보기 (시드로 정해진 그대로 시작한다) */
function MetroPreview({ mons }: { mons: PreviewMon[] }) {
  const { t, lang } = useBT()
  return (
    <ul className={`bd-preview is-${mons.length}`}>
      {mons.map((p, i) => (
        <li key={`${p.species}-${i}`}>
          <span className="bd-slot-n">{i + 1}</span>
          <span className="bd-slot-icon"><FallbackImg sources={iconCandidates(p.species)} alt="" /></span>
          <span className="bd-preview-text">
            <b>{speciesName(p.species, lang)} <span className="bd-slot-lv">{t('level', { n: p.level })}</span></b>
            <span className="bd-slot-types">{p.types.map(ty => <TypeBadge key={ty} type={ty} lang={lang} size="sm" />)}</span>
            <small>{abilityName(p.ability, lang)}</small>
          </span>
        </li>
      ))}
    </ul>
  )
}

/** 손가락흔들기 설정 → 엔진 옵션 (고른 팀이 다 차지 않았으면 null) */
function metronomeSetup(m: MetronomeForm, size: number): MetronomeSetup | null {
  const team = (mode: 'random' | 'picked', pick: (string | null)[]) => {
    if (mode === 'random') return 'random' as const
    const s = slotsFor(pick, size)
    return s.every(Boolean) ? (s as string[]) : null
  }
  const p1Team = team(m.p1Mode, m.p1Pick)
  const p2Team = team(m.p2Mode, m.p2Pick)
  if (!p1Team || !p2Team) return null
  const stats: NonNullable<MetronomeSetup['stats']> = {}
  for (const k of STAT_KEYS) {
    const v = Number(m.stats[k])
    if (m.stats[k] && Number.isInteger(v) && v >= 1 && v <= 9999) stats[k] = v
  }
  const level = Math.max(1, Math.min(100, Math.round(m.level) || 100))
  return { teamSize: size, level, ...(Object.keys(stats).length ? { stats } : {}), p1Team, p2Team }
}

/** 미리보기용: 고른 팀이 덜 찼으면 null */
function metronomeParts(m: MetronomeForm, size: number) {
  const team = (mode: 'random' | 'picked', pick: (string | null)[]) => {
    if (mode === 'random') return 'random' as const
    const s = slotsFor(pick, size)
    return s.every(Boolean) ? (s as string[]) : null
  }
  return { p1Team: team(m.p1Mode, m.p1Pick), p2Team: team(m.p2Mode, m.p2Pick) }
}

function MetronomeForm({ s }: { s: DemoSettings }) {
  const { t, lang } = useBT()
  const m = s.metronome
  const set = (patch: Partial<MetronomeForm>) => updateSettings(st => ({ metronome: { ...st.metronome, ...patch } }))
  const full = metronomeSetup(m, s.teamSize)
  const parts = metronomeParts(m, s.teamSize)
  const level = Math.max(1, Math.min(100, Math.round(m.level) || 100))
  const preview = useMemo(
    () => metronomePreview(s.metroSeed, { teamSize: s.teamSize, level, ...(full?.stats ? { stats: full.stats } : {}), ...parts }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [s.metroSeed, s.teamSize, level, JSON.stringify(full?.stats ?? null), JSON.stringify(parts)],
  )
  const side = (p: 'p1' | 'p2', title: string) => {
    const mode = p === 'p1' ? m.p1Mode : m.p2Mode
    const setMode = (v: 'random' | 'picked') => set(p === 'p1' ? { p1Mode: v } : { p2Mode: v })
    return (
      <div className="bd-team">
        <div className="bd-section-head">
          <h3 className="bd-team-title">{title}</h3>
          <span className="bd-builder-actions">
            <button type="button" className="bd-btn is-small" onClick={() => { updateSettings({ metroSeed: newSeed() }); setMode('random') }}>{t('randomTeam')}</button>
            {mode === 'random' && <button type="button" className="bd-btn is-small is-ghost" onClick={() => setMode('picked')}>{t('metroPicked')}</button>}
          </span>
        </div>
        {mode === 'random'
          ? <><p className="bd-section-hint">{t('metroPreviewHint')}</p><MetroPreview mons={preview[p]} /></>
          : <SpeciesSlots picks={p === 'p1' ? m.p1Pick : m.p2Pick} size={s.teamSize} onChange={pick => set(p === 'p1' ? { p1Pick: pick } : { p2Pick: pick })} />}
      </div>
    )
  }
  const spectate = s.mode === 'spectate'
  return (
    <>
      <div className="bd-team-pair">
        {side('p1', spectate ? t('cpuTeam', { name: t('cpu1') }) : t('myTeam'))}
        {side('p2', spectate ? t('cpuTeam', { name: t('cpu2') }) : t('foeTeam'))}
      </div>
      <section className="bd-section">
        <div className="bd-metro-grid">
          <label className="bd-field">
            <span>{t('metroLevel')}</span>
            <input className="bd-input" type="number" min={1} max={100} value={m.level} onChange={e => set({ level: Number(e.target.value) })} />
          </label>
        </div>
        <details className="bd-panel" open={Object.values(m.stats).some(Boolean)}>
          <summary>{t('metroStats')}</summary>
          <Text as="p" type="supporting" color="secondary">{t('metroStatsHint')}</Text>
          <div className="bd-metro-grid">
            {STAT_KEYS.map(k => (
              <label key={k} className="bd-field">
                <span>{k === 'hp' ? 'HP' : statName(k, lang)}</span>
                <input
                  className="bd-input"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={9999}
                  placeholder="—"
                  value={m.stats[k] ?? ''}
                  onChange={e => set({ stats: { ...m.stats, [k]: e.target.value } })}
                />
              </label>
            ))}
          </div>
          <button type="button" className="bd-btn is-small is-ghost" onClick={() => set({ stats: {} })}>{t('metroStatsReset')}</button>
        </details>
      </section>
    </>
  )
}

const STAT_NAME = {
  ko: { attack: '공격', defense: '방어', special_attack: '특수공격', special_defense: '특수방어', speed: '스피드' },
  en: { attack: 'Attack', defense: 'Defense', special_attack: 'Sp. Atk', special_defense: 'Sp. Def', speed: 'Speed' },
} as const
const statName = (k: Exclude<typeof STAT_KEYS[number], 'hp'>, lang: 'ko' | 'en') => STAT_NAME[lang][k]

const DIFFS: { id: Difficulty; label: 'diffEasy' | 'diffNormal' | 'diffHard'; desc: 'diffEasyDesc' | 'diffNormalDesc' | 'diffHardDesc' }[] = [
  { id: 'easy', label: 'diffEasy', desc: 'diffEasyDesc' },
  { id: 'normal', label: 'diffNormal', desc: 'diffNormalDesc' },
  { id: 'hard', label: 'diffHard', desc: 'diffHardDesc' },
]

/** "이 세대 규칙": 한 줄 요약 + 펼치면 표 (값이 바로 보이지 않는 줄에만 설명) */
function GenRules({ gen }: { gen: Gen }) {
  const { t, lang } = useBT()
  const info = genInfo(gen)
  return (
    <details className="bd-genrules">
      <summary>
        <span className="bd-genrules-games">{info.games[lang]}</span>
        <span className="bd-genrules-sum">{info.summary[lang]}</span>
        <span className="bd-genrules-more">{t('genRulesTitle')}</span>
      </summary>
      <dl className="bd-facts">
        {genFacts(gen).map((f, i) => (
          <div key={`${f.id}-${i}`}>
            <dt>{f.label[lang]}</dt>
            <dd>{f.value[lang]}{f.hint && <small>{f.hint[lang]}</small>}</dd>
          </div>
        ))}
      </dl>
    </details>
  )
}

function Check({ checked, label, desc, onChange, disabled }: { checked: boolean; label: string; desc?: string; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={`bd-check${disabled ? ' is-disabled' : ''}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />
      <span><b>{label}</b>{desc && <small>{desc}</small>}</span>
    </label>
  )
}

function Presets<T extends string>({ ids, value, label, desc, onPick, name }: { ids: readonly T[]; value: string; label: (id: T) => string; desc: (id: T) => string; onPick: (id: T) => void; name: string }) {
  return (
    <div className="bd-presets" role="radiogroup" aria-label={name}>
      {ids.map(id => (
        <label key={id} className={`bd-preset${value === id ? ' is-on' : ''}`}>
          <input type="radio" name={name} checked={value === id} onChange={() => onPick(id)} />
          <b>{label(id)}</b>
          <small>{desc(id)}</small>
        </label>
      ))}
    </div>
  )
}

/** 배틀 옵션 (접힘: 한 줄 요약). 프리셋 먼저, 세부 설정은 그 아래 접힘 */
function OptionsPanel({ gen, o, onChange }: { gen: Gen; o: BattleOptions; onChange: (o: BattleOptions) => void }) {
  const { t } = useBT()
  const [open, setOpen] = useState(false)
  const set = (patch: Partial<BattleOptions>) => onChange(withOption(o, patch, gen))
  const has = gimmicksOf(gen)
  const gimmickIds = (Object.keys(has) as (keyof GenGimmicks)[]).filter(k => has[k])
  const picks = o.teamSize === 6 ? [3, 4] : o.teamSize === 3 ? [1, 2] : []
  return (
    <div className={`bd-options${open ? ' is-open' : ''}`}>
      <button type="button" className="bd-options-head" aria-expanded={open} onClick={() => setOpen(v => !v)}>
        <span className="bd-setting-label">{t('battleOptions')}</span>
        <span className="bd-options-sum">{optionsSummary(o, gen, t)}</span>
        <span className="bd-options-toggle">{open ? t('optionsClose') : t('optionsChange')}</span>
      </button>
      {open && (
        <div className="bd-options-body">
          <Presets ids={PRESETS} value={o.preset} name={t('battleOptions')} label={id => t(PRESET_KEY[id])} desc={id => t(PRESET_DESC[id])} onPick={id => onChange(presetOptions(id, gen))} />
          <details className="bd-details" open={o.preset === 'custom'}>
            <summary>{t('detailsSettings')}</summary>
            <div className="bd-details-grid">
              <Setting label={t('teamSize')}>
                <SegmentedControl label={t('teamSize')} size="sm" layout="fill" value={String(o.teamSize)} onChange={v => set({ teamSize: Number(v) as TeamSize })}>
                  {TEAM_SIZES.map(n => <SegmentedControlItem key={n} value={String(n)} label={t('sizeOption', { n })} />)}
                </SegmentedControl>
              </Setting>
              <Setting label={t('teamPreview')} hint={t('previewHint')}>
                <SegmentedControl label={t('teamPreview')} size="sm" layout="fill" value={o.pick === null ? 'off' : String(o.pick)} onChange={v => set({ pick: v === 'off' ? null : Number(v) })}>
                  <SegmentedControlItem value="off" label={t('previewOff')} />
                  {o.teamSize > 1 && <SegmentedControlItem value={String(o.teamSize)} label={t('previewAll')} />}
                  {picks.map(k => <SegmentedControlItem key={k} value={String(k)} label={t('previewPick', { k })} />)}
                </SegmentedControl>
              </Setting>
              <Setting label={t('levelRule')} hint={o.level === 'balanced' ? t('levelBalancedHint') : undefined}>
                <SegmentedControl label={t('levelRule')} size="sm" layout="fill" value={String(o.level)} onChange={v => set({ level: v === 'balanced' ? 'balanced' : (Number(v) as 50 | 100) })}>
                  {LEVELS.map(l => <SegmentedControlItem key={l} value={String(l)} label={l === 'balanced' ? t('levelBalanced') : t('level', { n: l })} />)}
                </SegmentedControl>
              </Setting>
              <fieldset className="bd-checks">
                <legend>{t('gimmicks')}</legend>
                {gimmickIds.length === 0 && <p className="bd-setting-hint">{t('gimmicksNone')}</p>}
                {gimmickIds.map(k => (
                  <Check key={k} checked={o.gimmicks[k]} label={t(GIMMICK_KEY[k])} desc={k === 'mega' ? t('gimmickMegaDesc') : undefined}
                    onChange={v => set({ gimmicks: { ...o.gimmicks, [k]: v } })} />
                ))}
              </fieldset>
              <fieldset className="bd-checks is-wide">
                <legend>{t('clauses')}</legend>
                {CLAUSES.filter(c => c !== 'item' || gen >= 2).map(c => (
                  <Check key={c} checked={o.clauses[c]} label={t(CLAUSE_KEY[c].label)} desc={t(CLAUSE_KEY[c].desc)} onChange={v => set({ clauses: { ...o.clauses, [c]: v } })} />
                ))}
              </fieldset>
            </div>
          </details>
        </div>
      )}
    </div>
  )
}

const SB_LABEL: Record<SandboxPreset, 'sbAllGimmicks' | 'sbMetronome' | 'sbFreeform'> = { allGimmicks: 'sbAllGimmicks', metronome: 'sbMetronome', freeform: 'sbFreeform' }
const SB_DESC: Record<SandboxPreset, 'sbAllGimmicksDesc' | 'sbMetronomeDesc' | 'sbFreeformDesc'> = { allGimmicks: 'sbAllGimmicksDesc', metronome: 'sbMetronomeDesc', freeform: 'sbFreeformDesc' }

/** 샌드박스: 짧은 소개, 프리셋, 세부 설정 (토글 + 한 줄 설명) */
function SandboxPanel({ sb, size, onChange }: { sb: SandboxOptions; size: TeamSize; onChange: (sb: SandboxOptions) => void }) {
  const { t } = useBT()
  const set = (patch: Partial<SandboxOptions>) => onChange(withSandbox(sb, patch))
  return (
    <div className="bd-sandbox">
      <Presets ids={SANDBOX_PRESETS} value={sb.preset} name={t('formatSandbox')} label={id => t(SB_LABEL[id])} desc={id => t(SB_DESC[id])} onPick={id => onChange(sandboxPreset(id))} />
      <details className="bd-details" open={sb.preset === 'custom'}>
        <summary>{t('detailsSettings')}</summary>
        <div className="bd-details-grid">
          <Setting label={t('teamSize')}>
            <SegmentedControl label={t('teamSize')} size="sm" layout="fill" value={String(size)} onChange={v => updateSettings({ teamSize: Number(v) as TeamSize })}>
              {TEAM_SIZES.map(n => <SegmentedControlItem key={n} value={String(n)} label={t('sizeOption', { n })} />)}
            </SegmentedControl>
          </Setting>
          <fieldset className="bd-checks is-wide">
            <legend>{t('formatSandbox')}</legend>
            <Check checked={sb.metronome} label={t('sbMetronome')} desc={t('sbMetronomeToggleDesc')} onChange={v => set({ metronome: v })} />
            <Check checked={sb.stack} disabled={sb.metronome} label={t('sbStack')} desc={t('sbStackDesc')} onChange={v => set({ stack: v })} />
            <Check checked={sb.freeSets} disabled={sb.metronome} label={t('sbFreeSets')} desc={t('sbFreeSetsDesc')} onChange={v => set({ freeSets: v })} />
            <Check checked={sb.freeStats} disabled={sb.metronome} label={t('sbFreeStats')} desc={t('sbFreeStatsDesc')} onChange={v => set({ freeStats: v })} />
            <Check checked={sb.freeLevel} disabled={sb.metronome} label={t('sbFreeLevel')} desc={t('sbFreeLevelDesc')} onChange={v => set({ freeLevel: v })} />
          </fieldset>
        </div>
      </details>
    </div>
  )
}

/** 같은 규칙이면 같은 객체 (팀 카드의 검사 결과 메모가 렌더마다 깨지지 않게) */
const rulesCache = new Map<string, TeamRules>()
function stableRules(r: TeamRules): TeamRules {
  const key = JSON.stringify(r)
  let hit = rulesCache.get(key)
  if (!hit) rulesCache.set(key, (hit = r))
  return hit
}

export default function BattlePage() {
  const { t, lang } = useBT()
  const s = useSettings()
  const sandbox = s.rule === 'sandbox'
  const sb = s.sandbox
  const metro = sandbox && sb.metronome
  // 샌드박스·손가락흔들기는 9세대 메커닉. 샌드박스는 메가스톤·Z크리스탈·거다이맥스 데이터(7·8세대)도 쓴다
  const gen: Gen = sandbox ? 9 : s.gen
  const r1 = useEngineReady(sandbox ? 7 : gen)
  const r2 = useEngineReady(sandbox ? 8 : gen)
  const r3 = useEngineReady(gen)
  const ready = r1.ready && r2.ready && r3.ready
  const error = r1.error ?? r2.error ?? r3.error
  const session = useBattleSession()
  const [inBattle, setInBattle] = useState(false)
  const [last, setLast] = useState<{ setup: BattleSetup; spectate: boolean } | null>(null)
  // 시작 오류는 그때의 설정에만 보인다 (설정을 바꾸면 사라진다)
  const [startErr, setStartErr] = useState<{ msg: string; s: DemoSettings } | null>(null)
  const startError = startErr?.s === s ? startErr.msg : null
  const setStartError = (msg: string | null) => setStartErr(msg ? { msg, s } : null)

  const opts = optionsOf(s, s.gen)
  const g: GenGimmicks = sandbox ? (sb.stack ? ALL_GIMMICKS : { tera: true, mega: false, zmove: false, dynamax: false }) : gimmicksOf(gen, opts.gimmicks)
  const rules = stableRules(sandbox ? { gen: 9, g, free: sb.freeSets, freeStats: sb.freeStats, freeLevel: sb.freeLevel } : { gen, g })
  const size: TeamSize = sandbox ? s.teamSize : opts.teamSize
  const levelRule = sandbox ? 50 : opts.level
  const lvOf = (species: string) => levelFor(species, levelRule, gen)
  const newRandom = (n: number) => (sandbox ? sandboxRandomTeam(newSeed(), n) : applyLevel(randomTeam(newSeed(), n, levelRule === 'balanced' ? 'balanced' : levelRule, gen, g), levelRule, gen) as typeof s.myTeam)
  // 랜덤 팀은 켜 둔 클로즈에 맞춰 (같은 도구 → 남는 도구)
  const fit = (team: typeof s.myTeam) => (sandbox ? team : fitClauses(team, opts, gen))

  useEffect(() => { document.title = `${t('title')} - pokebattle-engine` }, [t])

  // 상대(CPU) 팀은 설정 화면에서 미리 뽑아 둔다: 빈 자리는 시드로 뽑은 랜덤 세트로 채운다
  const foeMissing = ready && !metro && slotsFor(s.foeTeam, size).some(x => !x)
  useEffect(() => {
    if (!foeMissing) return
    updateSettings(st => {
      const fresh = newRandom(MAX_TEAM)
      return { foeTeam: fit(slotsFor(st.foeTeam, Math.max(size, st.foeTeam.length)).map((x, i) => x ?? fresh[i]!)) }
    })
  }, [foeMissing]) // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (
      <div className="bd-banner is-error" role="alert">
        {t('loadError')} {error.message}
        <button type="button" className="bd-btn" onClick={() => window.location.reload()}>{t('retry')}</button>
      </div>
    )
  }
  if (!ready) return <div className="bd-loading" role="status">{gen === 9 && !sandbox ? t('loadingEngine') : t('genLoading', { n: sandbox ? 9 : gen })}</div>

  const spectate = s.mode === 'spectate'

  const begin = (setup: BattleSetup, spec: boolean) => {
    const err = session.start(setup, { p1: spec ? s.difficulty : 'human', p2: s.difficulty, speed: s.speed })
    if (err) { setStartError(err); return false }
    setLast({ setup, spectate: spec })
    // 손가락흔들기: 보여 준 팀으로 시작했으니, 돌아오면 새 팀을 미리 보여 준다
    if (setup.rule === 'metronome' && setup.seed === s.metroSeed) updateSettings({ metroSeed: newSeed() })
    setStartError(null)
    setInBattle(true)
    return true
  }
  const exit = () => { setInBattle(false); window.scrollTo({ top: 0 }) }

  if (inBattle && session.inPreview) return <div className="bd-page-inner"><TeamPreview session={session} onExit={exit} /></div>
  if (inBattle && session.current) {
    return (
      <BattleView
        session={session}
        onExit={exit}
        onRematch={() => last && begin({ ...last.setup, seed: newSeed() }, last.spectate)}
      />
    )
  }

  // 시작 가능 여부 (설정 객체는 누를 때 만든다: 랜덤 팀·시드를 렌더마다 뽑지 않게)
  const myActive = activeTeam(s.myTeam, size)
  const foeActive = activeTeam(s.foeTeam, size)
  let blocked: string | null = null
  let makeSetup: (() => BattleSetup) | null = null
  const ruleOpts = sandbox ? null : opts
  const myIssues = ruleOpts ? teamRuleIssues(slotsFor(s.myTeam, size), ruleOpts, gen, lang) : []
  const foeIssues = ruleOpts ? teamRuleIssues(slotsFor(s.foeTeam, size), ruleOpts, gen, lang) : []
  if (!metro) {
    const badOf = (team: (typeof s.myTeam)) => slotsFor(team, size).findIndex(x => x !== null && hasErrors(validateSet(x, lang, gen, rules)))
    const bad = badOf(s.myTeam)
    const foeBad = badOf(s.foeTeam)
    if (myActive.length < size) blocked = t('fillTeamFirst', { n: myActive.length, max: size })
    else if (bad >= 0) blocked = t('teamHasErrors', { n: bad + 1 })
    else if (myIssues.length) blocked = t('teamRuleIssues', { team: spectate ? t('cpuTeam', { name: t('cpu1') }) : t('myTeam') })
    else if (foeActive.length < size) blocked = t('foeFillFirst', { n: foeActive.length, max: size })
    else if (foeBad >= 0) blocked = t('foeTeamHasErrors', { n: foeBad + 1 })
    else if (foeIssues.length) blocked = t('teamRuleIssues', { team: spectate ? t('cpuTeam', { name: t('cpu2') }) : t('foeTeam') })
    else if (sandbox) {
      const prep = (team: typeof myActive) => team.map(x => sandboxSet(forGen(x, 9, g), sb))
      makeSetup = () => ({ rule: 'normal', seed: newSeed(), p1Team: prep(myActive), p2Team: prep(foeActive), options: sandboxEngineOptions(sb) })
    } else {
      const prep = (team: typeof myActive) => team.map(x => ({ ...forGen(x, gen, g), level: lvOf(x.species) }))
      makeSetup = () => ({ rule: 'normal', seed: newSeed(), p1Team: prep(myActive), p2Team: prep(foeActive), ...(gen !== 9 ? { gen } : {}), options: engineOptions(opts, gen) })
    }
  } else {
    const m = metronomeSetup(s.metronome, size)
    if (!m) {
      const filled = (mode: 'random' | 'picked', pick: (string | null)[]) => (mode === 'random' ? size : slotsFor(pick, size).filter(Boolean).length)
      blocked = t('fillTeamFirst', { n: Math.min(filled(s.metronome.p1Mode, s.metronome.p1Pick), filled(s.metronome.p2Mode, s.metronome.p2Pick)), max: size })
    } else makeSetup = () => ({ rule: 'metronome', seed: s.metroSeed, metronome: m })
  }

  const diff = DIFFS.find(d => d.id === s.difficulty) ?? DIFFS[1]!
  const setOpts = (o: BattleOptions) => updateSettings(st => {
    const prev = optionsOf(st, st.gen)
    const patch: Partial<DemoSettings> = { options: { ...st.options, [st.gen]: o } }
    // 레벨 규칙이 바뀌면 두 팀의 레벨도 그 규칙으로
    if (prev.level !== o.level) {
      patch.myTeam = applyLevel(st.myTeam, o.level, st.gen)
      patch.foeTeam = applyLevel(st.foeTeam, o.level, st.gen)
    }
    // 켜 둔 기믹이 바뀌면 거다이맥스 칸 정리
    if (prev.gimmicks.dynamax !== o.gimmicks.dynamax) {
      const gg = gimmicksOf(st.gen, o.gimmicks)
      patch.myTeam = (patch.myTeam ?? st.myTeam).map(x => (x ? forGen(x, st.gen, gg) : x))
      patch.foeTeam = (patch.foeTeam ?? st.foeTeam).map(x => (x ? forGen(x, st.gen, gg) : x))
    }
    // CPU 팀은 새 클로즈에 맞춘다 (같은 도구 → 남는 도구)
    if (!prev.clauses.item && o.clauses.item) patch.foeTeam = fitClauses(patch.foeTeam ?? st.foeTeam, o, st.gen)
    return patch
  })
  const issueList = (issues: ReturnType<typeof teamRuleIssues>) => issues.length > 0 && (
    <ul className="bd-rule-issues" role="alert">{issues.map((x, i) => <li key={i}>{t(x.key, x.vars)}</li>)}</ul>
  )

  return (
    <div className="bd-setup">
      <header className="bd-setup-head">
        <Heading level={1} className="bd-title">{t('title')}</Heading>
        <Text as="p" display="block" color="secondary">{t('intro')}</Text>
      </header>

      <section className="bd-step" aria-labelledby="bd-step-rules">
        <h2 className="bd-step-title" id="bd-step-rules"><span className="bd-step-n">1</span>{t('stepRules')}</h2>
        <div className="bd-rules">
          <Setting label={t('format')} hint={t(sandbox ? 'formatSandboxDesc' : 'formatNormalDesc')}>
            <SegmentedControl label={t('format')} layout="fill" value={s.rule} onChange={v => switchRule(v as Rule)}>
              <SegmentedControlItem value="normal" label={t('formatNormal')} />
              <SegmentedControlItem value="sandbox" label={t('formatSandbox')} />
            </SegmentedControl>
          </Setting>
          {!sandbox ? (
            <>
              <Setting label={t('generation')}>
                <SegmentedControl label={t('generation')} layout="fill" value={String(s.gen)} onChange={v => switchGen(Number(v) as Gen)}>
                  {GENS.map(n => <SegmentedControlItem key={n} value={String(n)} label={String(n)} />)}
                </SegmentedControl>
                <GenRules gen={s.gen} />
              </Setting>
              <OptionsPanel gen={s.gen} o={opts} onChange={setOpts} />
            </>
          ) : (
            <SandboxPanel sb={sb} size={size} onChange={v => updateSettings({ sandbox: v })} />
          )}
          <div className="bd-rules-row">
            <Setting label={t('mode')}>
              <SegmentedControl label={t('mode')} size="sm" layout="fill" value={s.mode} onChange={v => updateSettings({ mode: v as Mode })}>
                <SegmentedControlItem value="vs-cpu" label={t('modeVsCpu')} />
                <SegmentedControlItem value="spectate" label={t('modeSpectate')} />
              </SegmentedControl>
            </Setting>
            {!metro && (
              <Setting label={t('difficulty')} hint={t(diff.desc)}>
                <SegmentedControl label={t('difficulty')} size="sm" layout="fill" value={s.difficulty} onChange={v => updateSettings({ difficulty: v as Difficulty })}>
                  {DIFFS.map(d => <SegmentedControlItem key={d.id} value={d.id} label={t(d.label)} />)}
                </SegmentedControl>
              </Setting>
            )}
            <Setting label={t('display')}>
              <SegmentedControl label={t('sprites')} size="sm" layout="fill" value={s.sprites} onChange={v => updateSettings({ sprites: v as SpriteStyle })}>
                <SegmentedControlItem value="2d" label={t('sprites2d')} />
                <SegmentedControlItem value="3d" label={t('sprites3d')} />
              </SegmentedControl>
            </Setting>
          </div>
        </div>
      </section>

      <section className="bd-step" aria-labelledby="bd-step-teams">
        <h2 className="bd-step-title" id="bd-step-teams"><span className="bd-step-n">2</span>{t('stepTeams')}</h2>
        {!metro ? (
          <div className="bd-team-pair">
            <div className="bd-team">
              <h3 className="bd-team-title">{spectate ? t('cpuTeam', { name: t('cpu1') }) : t('myTeam')}</h3>
              {issueList(myIssues)}
              <TeamBuilder
                rules={rules}
                team={s.myTeam}
                size={size}
                level={sandbox ? 50 : lvOf}
                onChange={team => updateSettings({ myTeam: team.slice(0, 6) })}
                onRandom={() => updateSettings(st => ({ myTeam: fit([...newRandom(size), ...st.myTeam.slice(size)].slice(0, 6)) }))}
              />
            </div>
            <div className="bd-team">
              <h3 className="bd-team-title">{spectate ? t('cpuTeam', { name: t('cpu2') }) : t('foeTeam')}</h3>
              <p className="bd-section-hint">{t('foeHint')}</p>
              {issueList(foeIssues)}
              <TeamBuilder
                rules={rules}
                team={s.foeTeam}
                size={size}
                level={sandbox ? 50 : lvOf}
                canClear={false}
                canRemove={false}
                onChange={team => updateSettings({ foeTeam: team.slice(0, 6) })}
                onRandom={() => updateSettings(st => ({ foeTeam: fit([...newRandom(size), ...st.foeTeam.slice(size)].slice(0, 6)) }))}
              />
            </div>
          </div>
        ) : (
          <MetronomeForm s={s} />
        )}
      </section>

      <section className="bd-step" aria-labelledby="bd-step-start">
        <h2 className="bd-step-title" id="bd-step-start"><span className="bd-step-n">3</span>{t('stepStart')}</h2>
        <div className="bd-startbar">
        {startError ? (
          <div className="bd-startbar-note is-error" role="alert">
            <b>{t('startError')}</b>
            {startErrorLines(startError).map((l, i) => <span key={i}>{l}</span>)}
          </div>
        ) : blocked ? <span className="bd-startbar-note" role="status">{blocked}</span> : <span className="bd-startbar-note">{sandbox ? t('formatSandbox') : `${t('genN', { n: gen })} · ${optionsSummary(opts, gen, t)}`}</span>}
        <button type="button" className="bd-btn is-primary is-large" disabled={!makeSetup} onClick={() => makeSetup && begin(makeSetup(), spectate)}>
          {spectate ? t('startSpectate') : t('startBattle')}
        </button>
      </div>
      </section>
      <Credits />
    </div>
  )
}
