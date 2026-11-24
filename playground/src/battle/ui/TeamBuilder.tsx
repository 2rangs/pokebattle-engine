// ─── 팀 빌더: 마릿수(1/3/6)만큼의 자리, 종 검색, 랜덤 팀, 세트 편집(기술·특성·도구·성격·테라·노력치), Showdown 가져오기/내보내기 ─────
import { useId, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { exportShowdownTeam, getMove, getSpecies, type PokemonSet } from '../lib/engine'
import { abilityName, itemName, moveName, pokemonLabel, speciesName, typeName } from '../lib/names'
import { iconCandidates, itemIconUrl, TYPE_COLOR } from '../lib/sprites'
import { forGen, importTeam, moveUp, placeAt, searchSpecies, slotsFor, speciesOptions, suggestedSet } from '../lib/team'
import { hasErrors, validateSet, type TeamRules } from '../lib/editor'
import { FallbackImg, TypeBadge } from './bits'
import { SetEditor } from './SetEditor'
import { useBT } from './state'
import { DEFAULT_GEN, gimmickItemKind, type Gen } from '../lib/gimmick'

const newSeed = () => Math.floor(Math.random() * 1e9)

/** 종 검색 상자: 한국어·영어 이름, 도감 번호 */
export function SpeciesPicker({ onPick, label, gen = DEFAULT_GEN }: { onPick: (slug: string) => void; label: string; gen?: Gen }) {
  const { t, lang } = useBT()
  const [q, setQ] = useState('')
  const [hi, setHi] = useState(0)
  const options = useMemo(() => speciesOptions(lang, gen), [lang, gen])
  const results = useMemo(() => searchSpecies(options, q), [options, q])
  const listId = useId()
  const pick = (slug: string) => { onPick(slug); setQ('') }
  return (
    <div className="bd-picker">
      <input
        className="bd-input"
        type="search"
        value={q}
        placeholder={t('searchPlaceholder')}
        aria-label={label}
        role="combobox"
        aria-expanded={results.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        onChange={e => { setQ(e.target.value); setHi(0) }}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => Math.min(results.length - 1, h + 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(0, h - 1)) }
          else if (e.key === 'Enter' && results[hi]) { e.preventDefault(); pick(results[hi]!.slug) }
          else if (e.key === 'Escape') setQ('')
        }}
      />
      {q.trim() && (
        <ul className="bd-picker-list" id={listId} role="listbox" aria-label={label}>
          {results.length === 0 && <li className="bd-picker-empty">{t('noResults')}</li>}
          {results.map((o, i) => (
            <li key={o.slug} role="option" aria-selected={i === hi}>
              <button type="button" className={i === hi ? 'is-hi' : ''} onMouseEnter={() => setHi(i)} onClick={() => pick(o.slug)}>
                <span className="bd-picker-icon"><FallbackImg sources={iconCandidates(o.slug)} alt="" /></span>
                <span className="bd-picker-num">#{String(o.num).padStart(4, '0')}</span>
                <span>{o.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function SlotCard({ n, set, rules, open, onToggle, onChange, onReroll, onRemove, onUp }: {
  n: number
  rules: TeamRules
  set: PokemonSet
  open: boolean
  onToggle: () => void
  onChange: (s: PokemonSet) => void
  onReroll: () => void
  onRemove?: () => void
  onUp?: () => void
}) {
  const { t, lang } = useBT()
  const { gen, g } = rules
  const sp = getSpecies(set.species, gen === 9 ? {} : { gen }) ?? getSpecies(set.species)
  const name = pokemonLabel(set, lang)
  const moves = set.moves.filter(Boolean) as string[]
  const issues = useMemo(() => validateSet(set, lang, gen, rules), [set, lang, gen, rules])
  const kind = set.item ? gimmickItemKind(set.item) : null
  const editorId = useId()
  // 한 줄 정보: 특성 · 도구 · (거다이맥스) · (테라) — 그 세대에 있는 것만
  const meta: ReactNode[] = []
  if (gen >= 3 && set.ability) meta.push(<span key="a">{abilityName(set.ability, lang)}</span>)
  if (gen >= 2) {
    meta.push(
      <span key="i" className="bd-slot-item">
        {set.item && <img className="bd-item-icon is-pixel" src={itemIconUrl(set.item)} alt="" onError={e => { e.currentTarget.style.display = 'none' }} />}
        {set.item ? itemName(set.item, lang) : t('noItem')}
        {kind && g[kind === 'z' ? 'zmove' : 'mega'] && <small className="bd-item-tag">{t(kind === 'mega' ? 'itemTagMega' : kind === 'z' ? 'itemTagZ' : 'itemTagPrimal')}</small>}
      </span>,
    )
  }
  if (set.shiny && gen >= 2) meta.push(<span key="s" className="bd-slot-shiny">✦ {t('shinyMark')}</span>)
  if (set.gigantamax && g.dynamax) meta.push(<span key="g">{t('gigantamax')}</span>)
  if (set.teraType && gen === 9 && g.tera) meta.push(<span key="t" className="bd-slot-tera">{t('tera')} <TypeBadge type={set.teraType} lang={lang} size="xs" tera /></span>)
  if (set.customStats && rules.freeStats) meta.push(<span key="c">{t('customStats')}</span>)
  return (
    <div className={`bd-slot${open ? ' is-open' : ''}`} aria-label={`${t('slotN', { n })} ${name}`}>
      <div className="bd-slot-head">
        <span className="bd-slot-icon"><FallbackImg sources={iconCandidates(set.species, !!set.shiny)} alt="" /></span>
        <span className="bd-slot-title">
          <span className="bd-slot-name"><b>{name}</b> <span className="bd-slot-lv">{t('level', { n: set.level ?? 50 })}</span></span>
          <span className="bd-slot-types">{(sp?.types ?? []).map(ty => <TypeBadge key={ty} type={ty} lang={lang} size="xs" />)}</span>
        </span>
        {issues.length > 0 && !open && (
          <span className={`bd-slot-flag is-${hasErrors(issues) ? 'error' : 'warn'}`}>{t(hasErrors(issues) ? 'setErrorBadge' : 'setWarnBadge')}</span>
        )}
        <span className="bd-slot-n" aria-hidden>{n}</span>
      </div>
      {open ? (
        <div id={editorId}><SetEditor set={set} issues={issues} rules={rules} onChange={onChange} /></div>
      ) : (
        <>
          {meta.length > 0 && <p className="bd-slot-meta">{meta.map((m, i) => <span key={i}>{i > 0 && <span className="bd-dot" aria-hidden>·</span>}{m}</span>)}</p>}
          <ul className="bd-slot-moves">
            {moves.map(m => {
              const md = getMove(m, gen === 9 ? {} : { gen })
              return (
                <li key={m} className="bd-move-chip" style={{ '--type': md ? TYPE_COLOR[md.type] : '#888' } as CSSProperties} title={md ? typeName(md.type, lang) : undefined}>
                  {moveName(m, lang)}
                </li>
              )
            })}
          </ul>
        </>
      )}
      <div className="bd-slot-actions">
        <button
          type="button"
          className={`bd-btn is-small${open ? ' is-primary' : ' is-quiet'}`}
          aria-expanded={open}
          aria-controls={open ? editorId : undefined}
          aria-label={open ? undefined : t('editSetNamed', { name })}
          onClick={onToggle}
        >
          {open ? t('doneEdit') : t('editSet')}
        </button>
        <button type="button" className="bd-btn is-small is-ghost" onClick={onReroll} aria-label={t('randomSlotNamed', { name })}>{t('randomTeam')}</button>
        {onUp && <button type="button" className="bd-btn is-small is-ghost" onClick={onUp}>↑ {t('moveUp')}</button>}
        {onRemove && <button type="button" className="bd-btn is-small is-ghost" onClick={onRemove} aria-label={t('removeNamed', { name })}>{t('remove')}</button>}
      </div>
    </div>
  )
}

export function TeamBuilder({ team, size, rules, level = 50, onChange, onRandom, canClear = true, canRemove = true }: {
  team: (PokemonSet | null)[]
  /** 규칙: 세대(고를 수 있는 종·기술·도구, 랜덤 세트)·기믹·샌드박스 자유 설정 */
  rules: TeamRules
  size: number
  /** 새로 넣는 포켓몬의 레벨 */
  level?: number | ((species: string) => number)
  onChange: (team: (PokemonSet | null)[]) => void
  onRandom: () => void
  /** 비우기·빼기 (상대 팀은 늘 다 차 있게 숨긴다) */
  canClear?: boolean
  canRemove?: boolean
}) {
  const { t } = useBT()
  const { gen, g } = rules
  const [editing, setEditing] = useState<number | null>(null)
  const [ioOpen, setIoOpen] = useState(false)
  const [text, setText] = useState('')
  const [ioError, setIoError] = useState<string | null>(null)
  const slots = slotsFor(team, size)
  const filled = slots.filter(Boolean) as PokemonSet[]
  const lv = (species: string) => (typeof level === 'function' ? level(species) : level)

  const importNow = () => {
    try {
      const parsed = importTeam(text, name => t('unknownPokemon', { name }))
      if (parsed.length === 0) throw new Error(t('nothingToImport'))
      onChange(parsed.map(p => forGen(p, gen, g)))
      setIoError(null)
      setIoOpen(false)
    } catch (err) {
      setIoError((err as Error).message)
    }
  }

  return (
    <div className="bd-builder">
      <div className="bd-builder-actions">
        <button type="button" className="bd-btn is-small" onClick={onRandom}>{t('randomTeam')}</button>
        <button
          type="button"
          className="bd-btn is-small is-ghost"
          aria-expanded={ioOpen}
          onClick={() => { setText(exportShowdownTeam(filled)); setIoOpen(o => !o); setIoError(null) }}
        >{t('showdownIO')}</button>
        {filled.length > 0 && canClear && <button type="button" className="bd-btn is-small is-ghost" onClick={() => onChange([])}>{t('clearTeam')}</button>}
      </div>
      {ioOpen && (
        <div className="bd-io">
          <textarea
            className="bd-input bd-textarea"
            value={text}
            rows={10}
            spellCheck={false}
            aria-label={t('showdownIO')}
            onChange={e => setText(e.target.value)}
            placeholder={'Garchomp @ Choice Scarf\nAbility: Rough Skin\nEVs: 252 Atk / 4 SpD / 252 Spe\nJolly Nature\n- Earthquake\n- Dragon Claw'}
          />
          {ioError && <p className="bd-error" role="alert">{ioError}</p>}
          <div className="bd-builder-actions">
            <button type="button" className="bd-btn is-small is-primary" onClick={importNow}>{t('importTeam')}</button>
            <button type="button" className="bd-btn is-small" onClick={() => { navigator.clipboard?.writeText(text).catch(() => {}) }}>{t('copy')}</button>
          </div>
        </div>
      )}
      <ol className={`bd-slots is-${size}`}>
        {slots.map((s, i) => (
          <li key={s ? `${s.species}-${i}` : `empty-${i}`} className={editing === i && s ? 'is-open' : undefined}>
            {s ? (
              <SlotCard
                n={i + 1}
                set={s}
                rules={rules}
                open={editing === i}
                onToggle={() => setEditing(e => (e === i ? null : i))}
                onChange={next => onChange(placeAt(team, i, next))}
                onReroll={() => onChange(placeAt(team, i, suggestedSet(s.species, newSeed(), s.level ?? lv(s.species), gen, g)))}
                onRemove={canRemove ? () => { setEditing(null); onChange(placeAt(team, i, null)) } : undefined}
                onUp={i > 0 ? () => { setEditing(e => (e === i ? i - 1 : e === i - 1 ? i : e)); onChange(moveUp(team, i)) } : undefined}
              />
            ) : (
              <div className="bd-slot is-empty">
                <SpeciesPicker gen={rules.free ? 9 : gen} label={t('addToSlot', { n: i + 1 })} onPick={slug => onChange(placeAt(team, i, suggestedSet(slug, newSeed(), lv(slug), gen, g)))} />
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}

/** 손가락흔들기 고른 종 목록 (기술·도구 없이 종만) */
export function SpeciesSlots({ picks, size, onChange }: { picks: (string | null)[]; size: number; onChange: (p: (string | null)[]) => void }) {
  const { t, lang } = useBT()
  const slots = slotsFor(picks, size)
  return (
    <ol className={`bd-slots is-compact is-${size}`}>
      {slots.map((s, i) => (
        <li key={s ? `${s}-${i}` : `e-${i}`}>
          <div className={`bd-slot is-mini${s ? '' : ' is-empty'}`}>
            <div className="bd-slot-head">
              <span className="bd-slot-n">{i + 1}</span>
              {s ? (
                <>
                  <span className="bd-slot-icon"><FallbackImg sources={iconCandidates(s)} alt="" /></span>
                  <span className="bd-slot-title"><b>{speciesName(s, lang)}</b></span>
                  <button type="button" className="bd-btn is-small is-ghost" onClick={() => onChange(placeAt(picks, i, null))} aria-label={t('removeNamed', { name: speciesName(s, lang) })}>{t('remove')}</button>
                </>
              ) : (
                <SpeciesPicker label={t('addToSlot', { n: i + 1 })} onPick={slug => onChange(placeAt(picks, i, slug))} />
              )}
            </div>
          </div>
        </li>
      ))}
    </ol>
  )
}
