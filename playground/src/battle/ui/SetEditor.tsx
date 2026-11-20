// ─── 세트 편집기 (팀 빌더 자리 카드를 펼친 것): 기술 4개, 특성, 도구, 성격, 테라 타입, 노력치 ─────
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { getItem, getMove, type PokemonSet } from '../lib/engine'
import {
  abilityOptions, EV_PRESETS, EV_STAT_MAX, EV_TOTAL_MAX, evTotal, itemOptionsFor, MAX_MOVES, moveOptions, natureLabel,
  natureOptions, presetOf, PRESET_EVS, searchOptions, setEv, STATS, statShort, statsOf, teraOptions, withMove,
  type EvPreset, type MoveOption, type SetIssue,
} from '../lib/editor'
import { abilityName, itemName, moveName } from '../lib/names'
import { itemIconUrl, TYPE_COLOR } from '../lib/sprites'
import type { MessageKey } from '../lib/messages'
import { CategoryIcon, TypeBadge } from './bits'
import { useBT } from './state'
import { gimmickItemKind, gimmicksOf, gmaxForm, type Gen } from '../lib/gimmick'

const PRESET_KEY: Record<EvPreset, MessageKey> = {
  physical: 'evPhysical', special: 'evSpecial', bulkyPhys: 'evBulkyPhys', bulkySpec: 'evBulkySpec', none: 'evNone',
}

/** 검색 + 목록 (열려 있는 동안만 그린다). 빈 검색어면 전체 목록을 보여 준다 */
function SearchSelect<T extends { slug: string; label: string; haystack: string }>({ label, placeholder, options, exclude, render, onPick, onClose }: {
  label: string
  placeholder: string
  options: readonly T[]
  exclude?: ReadonlySet<string>
  render: (o: T) => ReactNode
  onPick: (slug: string) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const [hi, setHi] = useState(0)
  const listId = useId()
  const box = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const results = useMemo(() => searchOptions(exclude ? options.filter(o => !exclude.has(o.slug)) : options, q), [options, exclude, q])
  useEffect(() => {
    // 바깥을 누르면 닫는다
    const down = (e: PointerEvent) => { if (box.current && !box.current.contains(e.target as Node)) onClose() }
    document.addEventListener('pointerdown', down)
    return () => document.removeEventListener('pointerdown', down)
  }, [onClose])
  useEffect(() => { list.current?.querySelector('.is-hi')?.scrollIntoView({ block: 'nearest' }) }, [hi])
  return (
    <div className="bd-picker bd-ed-search" ref={box}>
      <input
        className="bd-input"
        type="search"
        autoFocus
        value={q}
        placeholder={placeholder}
        aria-label={label}
        role="combobox"
        aria-expanded
        aria-controls={listId}
        aria-autocomplete="list"
        onChange={e => { setQ(e.target.value); setHi(0) }}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => Math.min(results.length - 1, h + 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(0, h - 1)) }
          else if (e.key === 'Enter' && results[hi]) { e.preventDefault(); onPick(results[hi]!.slug) }
          else if (e.key === 'Escape') { e.preventDefault(); onClose() }
        }}
      />
      <ul className="bd-picker-list" id={listId} role="listbox" aria-label={label} ref={list}>
        {results.length === 0 && <li className="bd-picker-empty">—</li>}
        {results.map((o, i) => (
          <li key={o.slug} role="option" aria-selected={i === hi}>
            <button type="button" className={i === hi ? 'is-hi' : ''} onMouseEnter={() => setHi(i)} onClick={() => onPick(o.slug)}>
              {render(o)}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** 기술 한 줄: 타입 배지 · 이름 · 분류 아이콘 · 위력 */
function MoveInfo({ m }: { m: Pick<MoveOption, 'type' | 'category' | 'power'> & { label: string } }) {
  const { t, lang } = useBT()
  return (
    <>
      <TypeBadge type={m.type} lang={lang} size="sm" />
      <span className="bd-ed-move-name">{m.label}</span>
      <CategoryIcon category={m.category} lang={lang} />
      <span className="bd-ed-power" aria-label={t('powerShort')}>{m.power ?? '—'}</span>
    </>
  )
}

function MoveSlot({ set, i, gen, onChange, issue }: { set: PokemonSet; i: number; gen: Gen; onChange: (s: PokemonSet) => void; issue?: SetIssue }) {
  const { t, lang } = useBT()
  const [open, setOpen] = useState(false)
  const slug = set.moves[i] || ''
  const options = useMemo(() => moveOptions(set.species, lang, gen), [set.species, lang, gen])
  const exclude = useMemo(() => new Set(set.moves.filter((m, k): m is string => !!m && k !== i)), [set.moves, i])
  const md = slug ? getMove(slug) : undefined
  const name = slug ? moveName(slug, lang) : ''
  if (open) {
    return (
      <SearchSelect
        label={t('moveN', { n: i + 1 })}
        placeholder={`${t('searchMove')} · ${t('learnableCount', { n: options.length })}`}
        options={options}
        exclude={exclude}
        render={o => <MoveInfo m={o} />}
        onPick={s => { onChange(withMove(set, i, s)); setOpen(false) }}
        onClose={() => setOpen(false)}
      />
    )
  }
  if (!slug) {
    return <button type="button" className="bd-ed-chip is-empty" onClick={() => setOpen(true)}>{t('addMove')}</button>
  }
  return (
    <div className={`bd-ed-row${issue ? ` is-${issue.level}` : ''}`}>
      <button
        type="button"
        className="bd-ed-chip"
        style={{ '--type': md ? TYPE_COLOR[md.type] : '#888' } as CSSProperties}
        onClick={() => setOpen(true)}
        aria-label={t('changeMove', { move: name })}
      >
        {md ? <MoveInfo m={{ ...md, label: name }} /> : <span className="bd-ed-move-name">{name}</span>}
      </button>
      <button type="button" className="bd-btn is-ghost bd-ed-x" onClick={() => onChange(withMove(set, i, null))} aria-label={t('clearMove', { move: name })}>×</button>
    </div>
  )
}

/** 메가스톤·Z크리스탈 표시 (그 세대에 쓸 수 있을 때만) */
function ItemTag({ slug, gen }: { slug: string; gen: Gen }) {
  const { t } = useBT()
  const kind = gimmickItemKind(slug)
  const g = gimmicksOf(gen)
  if (!kind || !(kind === 'z' ? g.zmove : g.mega)) return null
  return <small className="bd-item-tag">{t(kind === 'mega' ? 'itemTagMega' : kind === 'z' ? 'itemTagZ' : 'itemTagPrimal')}</small>
}

function ItemField({ set, gen, onChange }: { set: PokemonSet; gen: Gen; onChange: (s: PokemonSet) => void }) {
  const { t, lang } = useBT()
  const [open, setOpen] = useState(false)
  // 이 포켓몬의 메가스톤·Z크리스탈을 맨 위에
  const options = useMemo(() => itemOptionsFor(set, lang, gen), [set, lang, gen])
  const item = set.item ? getItem(set.item) : undefined
  if (open) {
    return (
      <SearchSelect
        label={t('item')}
        placeholder={t('searchItem')}
        options={options}
        render={o => (
          <>
            <img className="bd-item-icon is-pixel" src={itemIconUrl(o.slug)} alt="" loading="lazy" onError={e => { e.currentTarget.style.visibility = 'hidden' }} />
            <span className="bd-ed-item-text">
              <span>{o.label}{o.gimmick && <ItemTag slug={o.slug} gen={gen} />}</span>
              {lang === 'en' && <small>{o.effect}</small>}
            </span>
          </>
        )}
        onPick={s => { onChange({ ...set, item: s }); setOpen(false) }}
        onClose={() => setOpen(false)}
      />
    )
  }
  return (
    <div className="bd-ed-row">
      <button type="button" className="bd-ed-chip is-item" onClick={() => setOpen(true)} title={item?.effect}>
        {set.item && <img className="bd-item-icon is-pixel" src={itemIconUrl(set.item)} alt="" onError={e => { e.currentTarget.style.visibility = 'hidden' }} />}
        <span className="bd-ed-move-name">{set.item ? itemName(set.item, lang) : t('noItem')}</span>
        {set.item && <ItemTag slug={set.item} gen={gen} />}
      </button>
      {set.item && <button type="button" className="bd-btn is-ghost bd-ed-x" onClick={() => onChange({ ...set, item: undefined })} aria-label={t('clearMove', { move: itemName(set.item, lang) })}>×</button>}
    </div>
  )
}

function Issues({ issues }: { issues: readonly SetIssue[] }) {
  const { t } = useBT()
  if (!issues.length) return null
  return (
    <ul className="bd-ed-issues">
      {issues.map((x, k) => <li key={k} className={`is-${x.level}`} role={x.level === 'error' ? 'alert' : undefined}>{t(x.key, x.vars)}</li>)}
    </ul>
  )
}

export function SetEditor({ set, issues, gen, onChange }: { set: PokemonSet; issues: readonly SetIssue[]; gen: Gen; onChange: (s: PokemonSet) => void }) {
  const { t, lang } = useBT()
  const abilities = abilityOptions(set.species, lang)
  const natures = useMemo(() => natureOptions(lang), [lang])
  const teras = useMemo(() => teraOptions(lang), [lang])
  const stats = statsOf(set)
  const preset = presetOf(set.evs)
  const total = evTotal(set.evs)
  const of = (f: SetIssue['field']) => issues.filter(x => x.field === f)
  const moveIssue = (i: number) => issues.find(x => x.field === 'moves' && x.index === i)
  // 지금 특성이 목록에 없으면 (가져온 세트 등) 그것도 보여 준다
  const abilityList = abilities.some(a => a.slug === set.ability) || !set.ability ? abilities : [...abilities, { slug: set.ability, label: abilityName(set.ability, lang), hidden: false }]

  return (
    <div className="bd-editor">
      <Issues issues={of('species')} />
      <fieldset className="bd-ed-group bd-ed-moves">
        <legend>{t('moves')}</legend>
        {Array.from({ length: MAX_MOVES }, (_, i) => (
          // 빈 칸은 첫 빈 칸 하나만 "기술 추가"로
          (set.moves[i] || i === set.moves.filter(Boolean).length)
            ? <MoveSlot key={i} set={set} i={i} gen={gen} onChange={onChange} issue={moveIssue(i)} />
            : null
        ))}
        <Issues issues={of('moves')} />
      </fieldset>

      <div className="bd-ed-group bd-ed-fields">
        <label className="bd-field">
          <span>{t('ability')}</span>
          <select className="bd-input" value={set.ability} onChange={e => onChange({ ...set, ability: e.target.value })}>
            {abilityList.map(a => <option key={a.slug} value={a.slug}>{a.hidden ? `${a.label} (${t('hiddenAbility')})` : a.label}</option>)}
          </select>
        </label>
        <Issues issues={of('ability')} />
        <div className="bd-field">
          <span>{t('item')}</span>
          <ItemField set={set} gen={gen} onChange={onChange} />
        </div>
        <Issues issues={of('item')} />
        <label className="bd-field">
          <span>{t('nature')}</span>
          <select className="bd-input" value={set.nature ?? 'hardy'} onChange={e => onChange({ ...set, nature: e.target.value as PokemonSet['nature'] })}>
            {natures.map(n => <option key={n.slug} value={n.slug}>{natureLabel(n, lang)}</option>)}
          </select>
        </label>
        {gen === 9 && <label className="bd-field">
          <span className="bd-ed-tera-head">{t('teraType')}{set.teraType && <TypeBadge type={set.teraType} lang={lang} size="sm" tera />}</span>
          <select className="bd-input" value={set.teraType ?? ''} onChange={e => onChange({ ...set, teraType: e.target.value || undefined })}>
            {!set.teraType && <option value="">—</option>}
            {teras.map(ty => <option key={ty.slug} value={ty.slug}>{ty.label}</option>)}
          </select>
        </label>}
        {gimmicksOf(gen).dynamax && gmaxForm(set.species) && (
          <label className="bd-field is-check" title={t('gigantamaxHint')}>
            <input type="checkbox" checked={!!set.gigantamax} onChange={e => onChange({ ...set, gigantamax: e.target.checked || undefined })} />
            <span>{t('gigantamax')}</span>
          </label>
        )}
      </div>

      <fieldset className="bd-ed-group bd-ed-evs">
        <legend>{t('evs')} <span className={`bd-ed-total${total > EV_TOTAL_MAX ? ' is-over' : ''}`}>{t('evTotal', { n: total, max: EV_TOTAL_MAX })}</span></legend>
        <label className="bd-field">
          <span>{t('evPreset')}</span>
          <select
            className="bd-input"
            value={preset ?? ''}
            onChange={e => { if (e.target.value) onChange({ ...set, evs: { ...PRESET_EVS[e.target.value as EvPreset] } }) }}
          >
            {!preset && <option value="">{t('evCustom')}</option>}
            {EV_PRESETS.map(p => <option key={p} value={p}>{t(PRESET_KEY[p])}</option>)}
          </select>
        </label>
        <div className="bd-ed-evgrid">
          {STATS.map(s => {
            const n = natures.find(x => x.slug === (set.nature ?? 'hardy'))
            const mark = n?.plus === s ? 'is-plus' : n?.minus === s ? 'is-minus' : ''
            return (
              <label key={s} className={`bd-ed-ev ${mark}`}>
                <span className="bd-ed-ev-label">{statShort(s, lang)}{mark === 'is-plus' ? '↑' : mark === 'is-minus' ? '↓' : ''}</span>
                <input
                  className="bd-input"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={EV_STAT_MAX}
                  step={4}
                  value={set.evs?.[s] ?? 0}
                  onChange={e => onChange({ ...set, evs: setEv(set.evs, s, Number(e.target.value)) })}
                />
                <span className="bd-ed-stat" aria-hidden>{stats?.[s] ?? ''}</span>
              </label>
            )
          })}
        </div>
        <p className="bd-ed-hint">{t('evHint', { stat: EV_STAT_MAX, total: EV_TOTAL_MAX })}</p>
        <Issues issues={of('evs')} />
      </fieldset>
    </div>
  )
}
