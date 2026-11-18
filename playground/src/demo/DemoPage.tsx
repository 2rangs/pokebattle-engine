// ─── 배틀 데모 (#/demo) ───────────────────────────────────────
// 설정(모드·난이도·마릿수·레벨·시드) → 배틀 화면. Pokestra 배틀 시뮬레이터에서 팀 빌더를 빼고,
// 팀은 시드로 만든 랜덤 팀(또는 붙여 넣은 Showdown 텍스트)을 쓴다.
import { useMemo, useState, type ReactNode } from 'react'
import { PRNG, parseShowdownTeam, type BattleConfig, type PokemonSet } from '../engine'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { CodeBlock } from '@astryxdesign/core/CodeBlock'
import { Collapsible } from '@astryxdesign/core/Collapsible'
import { Grid } from '@astryxdesign/core/Grid'
import { Heading } from '@astryxdesign/core/Heading'
import { HStack } from '@astryxdesign/core/HStack'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { Text } from '@astryxdesign/core/Text'
import { TextArea } from '@astryxdesign/core/TextArea'
import { TextInput } from '@astryxdesign/core/TextInput'
import { VStack } from '@astryxdesign/core/VStack'
import { useEngineReady } from './data'
import { useDocumentTitle, useLang, type Lang } from './lang'
import { buildRandomTeam, dexIdOf, pokemonLabel } from './names'
import { useBattleStore, type BattleMode, type LevelOption } from './prefs'
import { Loading, PokeIcon } from './ui'
import { BattleView } from './BattleView'
import { engineSideNames } from './frames'
import { useBattleSession, type Difficulty } from './useBattleSession'
import { useBattleT } from './hud/util'

const DIFFICULTIES = [
  { id: 'easy', label: 'diffEasy', desc: 'diffEasyDesc' },
  { id: 'normal', label: 'diffNormal', desc: 'diffNormalDesc' },
  { id: 'hard', label: 'diffHard', desc: 'diffHardDesc' },
] as const satisfies readonly { id: Difficulty; label: string; desc: string }[]

const MODES = [
  { id: 'cpu-vs-cpu', label: 'modeSpectate' },
  { id: 'vs-cpu', label: 'modeVsCpu' },
] as const satisfies readonly { id: BattleMode; label: string }[]

const SIZES = [1, 3, 6] as const
const LEVELS = ['50', '100', 'random'] as const satisfies readonly LevelOption[]
const levelOf = (l: LevelOption) => (l === 'random' ? undefined : Number(l))

const AI_KIND = { easy: 'random', normal: 'heuristic', hard: 'strong' } as const

const newSeed = () => Math.floor(Math.random() * 1e9)

/** 시드 하나 → 두 팀 (같은 시드·설정이면 같은 팀) */
function seededTeams(seed: number, size: number, level?: number): { p1: PokemonSet[]; p2: PokemonSet[] } {
  const rng = new PRNG(seed)
  return {
    p1: buildRandomTeam(rng.int(0x7fffffff), size, level),
    p2: buildRandomTeam(rng.int(0x7fffffff), size, level),
  }
}

/** 팀 미리보기: 작은 그림 + 이름 */
function TeamStrip({ team }: { team: PokemonSet[] }) {
  const lang = useLang()
  return (
    <ul className="flex flex-wrap gap-2">
      {team.map((s, i) => {
        const name = pokemonLabel(s.species, s.nickname, lang)
        return (
          <li key={i} title={name} className="flex items-center gap-1.5 rounded-md border border-border bg-surface py-0.5 pr-2.5 pl-1">
            <PokeIcon id={dexIdOf(s.species)} size={32} className="h-8 w-8" />
            <Text type="supporting">{name}{s.level !== 50 && s.level !== 100 ? ` Lv.${s.level}` : ''}</Text>
          </li>
        )
      })}
    </ul>
  )
}

/** 보이는 이름표 + 컨트롤 (SegmentedControl 의 label 은 화면에 그려지지 않는다) */
function Setting({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <VStack gap={1.5} className="min-w-0">
      <Text type="label">{label}</Text>
      {children}
      {hint && <Text type="supporting" color="secondary">{hint}</Text>}
    </VStack>
  )
}

/** 관전 모드가 엔진 API 로 하는 일 (설정값을 그대로 넣은 코드) */
function apiSnippet(o: { lang: Lang; seed: number; size: number; level?: number; diff: Difficulty }): string {
  const lv = o.level ? `, level: ${o.level}` : ''
  const ja = o.lang !== 'ko' && o.lang !== 'en'
  const ai = AI_KIND[o.diff]
  return `import {
  BattleEngine, PRNG, createAI, createFormatter, generateRandomTeam, preloadData${ja ? ', loadNames' : ''},
} from '@kyasi/pokebattle-engine'

await preloadData()${ja ? `\nawait loadNames('${o.lang}')` : ''}
const seed = ${o.seed}
const rng = new PRNG(seed)
const engine = new BattleEngine({
  format: 'singles', seed,
  p1: { name: 'CPU 1', team: generateRandomTeam({ seed: rng.int(0x7fffffff), size: ${o.size}${lv} }) },
  p2: { name: 'CPU 2', team: generateRandomTeam({ seed: rng.int(0x7fffffff), size: ${o.size}${lv} }) },
})
const log = createFormatter({ locale: '${o.lang}', getPokemon: id => engine.getPokemon(id) })
engine.on('*', ev => { const line = log.format(ev); if (line) console.log(line) })

const ai = { p1: createAI('${ai}', seed + 11), p2: createAI('${ai}', seed + 23) }
engine.start()
while (engine.getState().phase !== 'ended') {
  for (const p of ['p1', 'p2'] as const) {
    if (engine.getRequest(p)) engine.submitAction(ai[p].chooseAction(engine, p) ?? engine.getAvailableActions(p)[0]!)
  }
}`
}

export default function DemoPage() {
  const t = useBattleT()
  const lang = useLang()
  const { ready, error } = useEngineReady()
  const store = useBattleStore()
  const session = useBattleSession()
  const [inBattle, setInBattle] = useState(false)
  const [lastConfig, setLastConfig] = useState<BattleConfig | null>(null)
  const [seedText, setSeedText] = useState(() => String(newSeed()))
  const [pasteText, setPasteText] = useState('')
  const [pasted, setPasted] = useState<PokemonSet[] | null>(null)
  const [pasteError, setPasteError] = useState<string | null>(null)

  useDocumentTitle(t('title'))

  const seed = Number.parseInt(seedText, 10)
  const validSeed = Number.isFinite(seed) && seed >= 0
  const size = store.teamSize
  const level = levelOf(store.level)
  const spectate = store.mode === 'cpu-vs-cpu'

  const teams = useMemo(
    () => (ready && validSeed ? seededTeams(seed, size, level) : null),
    [ready, validSeed, seed, size, level],
  )

  if (error) {
    return (
      <span role="alert" className="block">
        <Banner
          status="error"
          title={t('loadError')}
          description={error.message}
          endContent={<Button label={t('retry')} size="sm" onClick={() => window.location.reload()} />}
        />
      </span>
    )
  }
  if (!ready) return <Loading label={t('loadingEngine')} />

  const myTeam = pasted ? pasted.slice(0, size) : teams?.p1 ?? []
  const foeTeam = teams?.p2 ?? []

  const applyPaste = () => {
    try {
      const team = parseShowdownTeam(pasteText, level ?? 50)
      if (team.length === 0) {
        setPasteError(t('nothingToImport'))
        return
      }
      setPasted(team.slice(0, 6))
      setPasteError(null)
    } catch (e) {
      setPasteError(t('teamParseError', { msg: (e as Error).message }))
    }
  }

  const begin = (config?: BattleConfig) => {
    if (!validSeed) return
    const p1 = spectate ? store.difficulty : 'human'
    const p2 = store.difficulty
    // 진영 이름은 화면에서 현재 언어로 다시 정하므로 여기서는 고정 식별자만 둔다 (리플레이와 같은 이름)
    const names = engineSideNames(p1, p2)
    const cfg: BattleConfig = config ?? {
      format: 'singles',
      seed,
      p1: { name: names.p1, team: myTeam },
      p2: { name: names.p2, team: foeTeam },
    }
    setLastConfig(cfg)
    session.start(cfg, { p1, p2, speed: store.speed })
    setInBattle(true)
    window.scrollTo({ top: 0 })
  }

  if (inBattle && session.current) {
    return (
      <BattleView
        session={session}
        onExit={() => setInBattle(false)}
        onRematch={() => lastConfig && begin({ ...lastConfig, seed: newSeed() })}
      />
    )
  }

  const canStart = validSeed && myTeam.length > 0 && foeTeam.length > 0
  const diff = DIFFICULTIES.find(d => d.id === store.difficulty) ?? DIFFICULTIES[1]

  return (
    <VStack gap={8}>
      <VStack gap={2}>
        <Heading level={1}>{t('title')}</Heading>
        <Text as="p" display="block" type="large" color="secondary">{t('intro')}</Text>
      </VStack>

      <Card padding={4}>
        <Grid columns={{ minWidth: 220 }} gap={4}>
          <Setting label={t('mode')}>
            <SegmentedControl label={t('mode')} layout="fill" value={store.mode} onChange={v => store.setMode(v as BattleMode)}>
              {MODES.map(m => <SegmentedControlItem key={m.id} value={m.id} label={t(m.label)} />)}
            </SegmentedControl>
          </Setting>
          <Setting label={t('difficulty')} hint={t(diff.desc)}>
            <SegmentedControl label={t('difficulty')} layout="fill" value={store.difficulty} onChange={v => store.setDifficulty(v as Difficulty)}>
              {DIFFICULTIES.map(d => <SegmentedControlItem key={d.id} value={d.id} label={t(d.label)} />)}
            </SegmentedControl>
          </Setting>
          <Setting label={t('teamSize')}>
            <SegmentedControl label={t('teamSize')} layout="fill" value={String(size)} onChange={v => store.setTeamSize(Number(v))}>
              {SIZES.map(n => <SegmentedControlItem key={n} value={String(n)} label={t('sizeOption', { n })} />)}
            </SegmentedControl>
          </Setting>
          <Setting label={t('levelSetting')}>
            <SegmentedControl label={t('levelSetting')} layout="fill" value={store.level} onChange={v => store.setLevel(v as LevelOption)}>
              {LEVELS.map(l => <SegmentedControlItem key={l} value={l} label={l === 'random' ? t('levelRandom') : `Lv.${l}`} />)}
            </SegmentedControl>
          </Setting>
          <Setting label={t('seed')} hint={t('seedHint')}>
            <HStack gap={2} vAlign="center">
              <TextInput
                label={t('seed')}
                isLabelHidden
                value={seedText}
                inputMode="numeric"
                width="100%"
                onChange={v => setSeedText(v.replace(/[^0-9]/g, '').slice(0, 10))}
              />
              <Button label={t('rerollTeam')} onClick={() => setSeedText(String(newSeed()))} />
            </HStack>
          </Setting>
        </Grid>
      </Card>

      <section aria-labelledby="demo-p1-team">
        <VStack gap={3}>
          <HStack gap={2} vAlign="center" hAlign="between" wrap="wrap">
            <Heading level={2} id="demo-p1-team">
              {spectate ? t('cpuTeam', { name: t('cpu1') }) : t('myTeam')}
            </Heading>
            {pasted && <Button size="sm" variant="ghost" label={t('useRandomTeam')} onClick={() => setPasted(null)} />}
          </HStack>
          {pasted && <Text type="supporting" color="secondary">{t('pastedTeam')}</Text>}
          <TeamStrip team={myTeam} />
          <Collapsible chevronPosition="start" trigger={<Text type="label" color="secondary">{t('pasteTeam')}</Text>}>
            <VStack gap={2} className="pt-2">
              <TextArea
                label={t('pasteTeam')}
                isLabelHidden
                description={t('pasteTeamHint')}
                value={pasteText}
                onChange={setPasteText}
                rows={8}
                placeholder={'Garchomp @ Choice Scarf\nAbility: Rough Skin\nTera Type: Ground\nEVs: 252 Atk / 4 SpD / 252 Spe\nJolly Nature\n- Earthquake\n- Outrage\n- Stone Edge\n- Swords Dance'}
              />
              {pasteError && (
                <span role="alert" className="block">
                  <Text color="inherit" className="text-error">{pasteError}</Text>
                </span>
              )}
              <HStack gap={2}>
                <Button label={t('applyTeam')} isDisabled={!pasteText.trim()} onClick={applyPaste} />
              </HStack>
            </VStack>
          </Collapsible>
        </VStack>
      </section>

      <section aria-labelledby="demo-p2-team">
        <VStack gap={3}>
          <Heading level={2} id="demo-p2-team">
            {spectate ? t('cpuTeam', { name: t('cpu2') }) : t('foeTeam')}
          </Heading>
          <TeamStrip team={foeTeam} />
        </VStack>
      </section>

      <Text as="p" display="block" type="supporting" color="secondary">{t('replayHint')}</Text>

      <div className="sticky bottom-3 z-20">
        <Card padding={3} elevation="med">
          <HStack gap={3} vAlign="center" hAlign="end" wrap="wrap">
            <Button
              variant="primary"
              size="lg"
              label={spectate ? t('startSpectate') : t('startBattle')}
              isDisabled={!canStart}
              onClick={() => canStart && begin()}
            />
          </HStack>
        </Card>
      </div>

      {validSeed && !pasted && (
        <section aria-labelledby="demo-api">
          <VStack gap={3}>
            <Heading level={2} id="demo-api">{t('apiTitle')}</Heading>
            <Text as="p" display="block" color="secondary">{t('apiLead')}</Text>
            <CodeBlock code={apiSnippet({ lang, seed, size, level, diff: store.difficulty })} language="ts" width="100%" />
          </VStack>
        </section>
      )}
    </VStack>
  )
}
