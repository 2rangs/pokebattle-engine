// ─── 배틀 데모 페이지 (#/battle): 설정(일반 / 손가락흔들기) → 배틀 화면 ─────
import { useEffect, useState, type ReactNode } from 'react'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'
import type { PokemonSet } from './lib/engine'
import { pokemonLabel } from './lib/names'
import type { MetronomeSetup } from './lib/replay'
import { iconCandidates } from './lib/sprites'
import { activeTeam, randomTeam, slotsFor, TEAM_SIZES, type TeamSize } from './lib/team'
import type { BattleSetup } from './lib/frames'
import { BattleView } from './ui/BattleView'
import { FallbackImg } from './ui/bits'
import { Credits } from './ui/common'
import { SpeciesSlots, TeamBuilder } from './ui/TeamBuilder'
import { useBattleSession } from './ui/useBattleSession'
import { useEngineReady } from './ui/useEngineReady'
import { updateSettings, useBT, useSettings, type DemoSettings, type Difficulty, type MetronomeForm, type Mode, type Rule } from './ui/state'
import './battle.css'

const newSeed = () => Math.floor(Math.random() * 1e9)

const STAT_KEYS = ['hp', 'attack', 'defense', 'special_attack', 'special_defense', 'speed'] as const

function Setting({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="bd-setting">
      <Text type="label">{label}</Text>
      {children}
      {hint && <Text type="supporting" color="secondary">{hint}</Text>}
    </div>
  )
}

function FoeStrip({ team }: { team: PokemonSet[] }) {
  const { lang } = useBT()
  return (
    <ul className="bd-strip">
      {team.map((s, i) => (
        <li key={i}>
          <span className="bd-strip-icon"><FallbackImg sources={iconCandidates(s.species)} alt="" /></span>
          <span>{pokemonLabel(s, lang)}</span>
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

function MetronomeForm({ s }: { s: DemoSettings }) {
  const { t, lang } = useBT()
  const m = s.metronome
  const set = (patch: Partial<MetronomeForm>) => updateSettings(st => ({ metronome: { ...st.metronome, ...patch } }))
  const side = (p: 'p1' | 'p2', title: string) => {
    const mode = p === 'p1' ? m.p1Mode : m.p2Mode
    return (
      <section className="bd-section">
        <div className="bd-section-head">
          <Heading level={3}>{title}</Heading>
          <SegmentedControl label={`${title} ${t('metroTeam')}`} size="sm" value={mode} onChange={v => set(p === 'p1' ? { p1Mode: v as 'random' | 'picked' } : { p2Mode: v as 'random' | 'picked' })}>
            <SegmentedControlItem value="random" label={t('metroRandom')} />
            <SegmentedControlItem value="picked" label={t('metroPicked')} />
          </SegmentedControl>
        </div>
        {mode === 'random'
          ? <Text as="p" color="secondary">{t('metroRandomHint', { n: s.teamSize })}</Text>
          : <SpeciesSlots picks={p === 'p1' ? m.p1Pick : m.p2Pick} size={s.teamSize} onChange={pick => set(p === 'p1' ? { p1Pick: pick } : { p2Pick: pick })} />}
      </section>
    )
  }
  const spectate = s.mode === 'spectate'
  return (
    <>
      {side('p1', spectate ? t('cpuTeam', { name: t('cpu1') }) : t('myTeam'))}
      {side('p2', spectate ? t('cpuTeam', { name: t('cpu2') }) : t('foeTeam'))}
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

export default function BattlePage() {
  const { t } = useBT()
  const { ready, error } = useEngineReady()
  const s = useSettings()
  const session = useBattleSession()
  const [inBattle, setInBattle] = useState(false)
  const [last, setLast] = useState<{ setup: BattleSetup; spectate: boolean } | null>(null)

  useEffect(() => { document.title = `${t('title')} - pokebattle-engine` }, [t])

  if (error) {
    return (
      <div className="bd-banner is-error" role="alert">
        {t('loadError')} {error.message}
        <button type="button" className="bd-btn" onClick={() => window.location.reload()}>{t('retry')}</button>
      </div>
    )
  }
  if (!ready) return <div className="bd-loading" role="status">{t('loadingEngine')}</div>

  const size = s.teamSize
  const spectate = s.mode === 'spectate'
  const myActive = activeTeam(s.myTeam, size)
  const foeTeam = s.foeTeam.slice(0, size)

  const begin = (setup: BattleSetup, spec: boolean) => {
    setLast({ setup, spectate: spec })
    session.start(setup, { p1: spec ? s.difficulty : 'human', p2: s.difficulty, speed: s.speed })
    setInBattle(true)
  }

  if (inBattle && session.current) {
    return (
      <BattleView
        session={session}
        onExit={() => { setInBattle(false); window.scrollTo({ top: 0 }) }}
        onRematch={() => last && begin({ ...last.setup, seed: newSeed() }, last.spectate)}
      />
    )
  }

  // 시작 가능 여부 (설정 객체는 누를 때 만든다: 랜덤 팀·시드를 렌더마다 뽑지 않게)
  let blocked: string | null = null
  let makeSetup: (() => BattleSetup) | null = null
  if (s.rule === 'normal') {
    if (myActive.length < size) blocked = t('fillTeamFirst', { n: myActive.length, max: size })
    else makeSetup = () => ({
      rule: 'normal', seed: newSeed(), p1Team: myActive,
      p2Team: foeTeam.length >= size ? foeTeam : randomTeam(newSeed(), size),
    })
  } else {
    const m = metronomeSetup(s.metronome, size)
    if (!m) {
      const filled = (mode: 'random' | 'picked', pick: (string | null)[]) => (mode === 'random' ? size : slotsFor(pick, size).filter(Boolean).length)
      blocked = t('fillTeamFirst', { n: Math.min(filled(s.metronome.p1Mode, s.metronome.p1Pick), filled(s.metronome.p2Mode, s.metronome.p2Pick)), max: size })
    } else makeSetup = () => ({ rule: 'metronome', seed: newSeed(), metronome: m })
  }

  const diffs: { id: Difficulty; label: 'diffEasy' | 'diffNormal' | 'diffHard'; desc: 'diffEasyDesc' | 'diffNormalDesc' | 'diffHardDesc' }[] = [
    { id: 'easy', label: 'diffEasy', desc: 'diffEasyDesc' },
    { id: 'normal', label: 'diffNormal', desc: 'diffNormalDesc' },
    { id: 'hard', label: 'diffHard', desc: 'diffHardDesc' },
  ]
  const diff = diffs.find(d => d.id === s.difficulty) ?? diffs[1]!

  return (
    <div className="bd-setup">
      <header className="bd-setup-head">
        <Heading level={1} className="bd-title">{t('title')}</Heading>
        <Text as="p" display="block" color="secondary">{t('intro')}</Text>
      </header>

      <div className="bd-settings">
        <Setting label={t('rule')} hint={t(s.rule === 'metronome' ? 'ruleMetronomeDesc' : 'ruleNormalDesc')}>
          <SegmentedControl label={t('rule')} layout="fill" value={s.rule} onChange={v => updateSettings({ rule: v as Rule })}>
            <SegmentedControlItem value="normal" label={t('ruleNormal')} />
            <SegmentedControlItem value="metronome" label={t('ruleMetronome')} />
          </SegmentedControl>
        </Setting>
        <Setting label={t('mode')}>
          <SegmentedControl label={t('mode')} layout="fill" value={s.mode} onChange={v => updateSettings({ mode: v as Mode })}>
            <SegmentedControlItem value="vs-cpu" label={t('modeVsCpu')} />
            <SegmentedControlItem value="spectate" label={t('modeSpectate')} />
          </SegmentedControl>
        </Setting>
        <Setting label={t('teamSize')}>
          <SegmentedControl label={t('teamSize')} layout="fill" value={String(size)} onChange={v => updateSettings({ teamSize: Number(v) as TeamSize })}>
            {TEAM_SIZES.map(n => <SegmentedControlItem key={n} value={String(n)} label={t('sizeOption', { n })} />)}
          </SegmentedControl>
        </Setting>
        {s.rule === 'normal' && (
          <Setting label={t('difficulty')} hint={t(diff.desc)}>
            <SegmentedControl label={t('difficulty')} layout="fill" value={s.difficulty} onChange={v => updateSettings({ difficulty: v as Difficulty })}>
              {diffs.map(d => <SegmentedControlItem key={d.id} value={d.id} label={t(d.label)} />)}
            </SegmentedControl>
          </Setting>
        )}
      </div>

      {s.rule === 'normal' ? (
        <>
          <section className="bd-section">
            <div className="bd-section-head">
              <Heading level={3}>{spectate ? t('cpuTeam', { name: t('cpu1') }) : t('myTeam')}</Heading>
            </div>
            <TeamBuilder
              team={s.myTeam}
              size={size}
              onChange={team => updateSettings({ myTeam: team.slice(0, 6) })}
              onRandom={() => updateSettings(st => {
                // 마릿수만큼 새로 뽑고, 그 뒤에 보관하던 포켓몬은 그대로 둔다
                const fresh = randomTeam(newSeed(), size)
                return { myTeam: [...fresh, ...st.myTeam.slice(size)].slice(0, 6) }
              })}
            />
          </section>
          <section className="bd-section">
            <div className="bd-section-head">
              <Heading level={3}>{spectate ? t('cpuTeam', { name: t('cpu2') }) : t('foeTeam')}</Heading>
              <button type="button" className="bd-btn is-small" onClick={() => updateSettings({ foeTeam: randomTeam(newSeed(), 6) })}>{t('rerollFoe')}</button>
            </div>
            {foeTeam.length > 0 ? <FoeStrip team={foeTeam} /> : <Text as="p" color="secondary">{t('foeRandomHint')}</Text>}
          </section>
        </>
      ) : (
        <MetronomeForm s={s} />
      )}

      <div className="bd-startbar">
        <button
          type="button"
          className="bd-btn is-primary is-large"
          disabled={!makeSetup}
          onClick={() => makeSetup && begin(makeSetup(), spectate)}
        >
          {blocked ?? (spectate ? t('startSpectate') : t('startBattle'))}
        </button>
      </div>
      <Credits />
    </div>
  )
}
