// ─── 화면 아래: 메시지 상자 + 커맨드 (싸운다 / 포켓몬 / 도망친다) + 기술 선택 + 교체 ─────
// 5세대 블랙·화이트의 아래 화면 구성을 본떴다: 큰 "싸운다" + 포켓몬·도망친다(가방 없음).
// 기술 버튼은 타입 색, 타입 문양, PP x/y 에 데미지 미리보기(상성·범위·확정 n타)를 더했다.
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import type { BattleRequest, MoveOption, PlayerID } from '../lib/engine'
import type { PokeView } from '../lib/frame'
import { effectivenessLabel, effectivenessTone, koLabel, pctOf } from '../lib/hud'
import type { MessageKey } from '../lib/messages'
import { itemName, moveName, pokemonLabel, typeName } from '../lib/names'
import { iconCandidates, itemIconUrl, TYPE_COLOR, typeIconUrl } from '../lib/sprites'
import { FallbackImg, HpBar, StatusBadge, TypeGlyph, Gender } from './bits'
import type { BattleSession } from './useBattleSession'
import { useBT } from './state'

/** 메시지 상자: 한 번에 한 문장 (게임처럼), 더 남았으면 ▼ */
export function MessageBox({ text, more, children }: { text: ReactNode; more?: boolean; children?: ReactNode }) {
  return (
    <div className="bd-msg">
      <p className="bd-msg-text" aria-live="polite">{text}</p>
      {more && <span className="bd-msg-more" aria-hidden>▼</span>}
      {children}
    </div>
  )
}

interface MovePreview { text: string; eff: number; ko: string | null }

const CAT_KEY: Record<string, MessageKey> = { physical: 'catPhysical', special: 'catSpecial', status: 'catStatus' }

function MoveButton({ opt, preview, onPick, extra }: { opt: MoveOption; preview: MovePreview | null; onPick: () => void; extra?: ReactNode }) {
  const { t, lang } = useBT()
  const m = opt.move
  const name = moveName(opt.index === -1 ? 'struggle' : m.name, lang)
  const cat = t(CAT_KEY[m.category] ?? 'catStatus')
  const meta = m.category === 'status' ? cat : `${cat} ${m.power ?? '—'}`
  const ppLow = opt.max_pp > 0 && opt.pp / opt.max_pp <= 0.25
  const eff = preview ? effectivenessLabel(preview.eff, lang) : null
  const a11y = [name, t('typeOf', { type: typeName(m.type, lang) }), meta, `PP ${opt.pp}/${opt.max_pp}`, eff, preview && t('damagePreview', { range: preview.text }), preview?.ko, opt.disabled_reason].filter(Boolean).join(', ')
  return (
    <button
      type="button"
      className="bd-move"
      style={{ '--type': TYPE_COLOR[m.type] ?? '#888' } as CSSProperties}
      disabled={opt.disabled}
      title={opt.disabled_reason}
      aria-label={a11y}
      onClick={onPick}
    >
      <span className="bd-move-top">
        <TypeGlyph type={m.type} />
        <b className="bd-move-name">{name}</b>
        <span className={`bd-move-pp${ppLow ? ' is-low' : ''}`}>PP {opt.pp}/{opt.max_pp}</span>
      </span>
      <span className="bd-move-meta">
        <span>{typeName(m.type, lang)} · {meta}<span className={`bd-move-pp2${ppLow ? ' is-low' : ''}`}> · PP {opt.pp}/{opt.max_pp}</span></span>
        {preview && (
          <span className="bd-move-calc">
            {eff && <em className={`eff-${effectivenessTone(preview.eff)}`}>{eff}</em>}
            <span>{preview.text}</span>
            {preview.ko && <span>{preview.ko}</span>}
          </span>
        )}
        {extra}
        {opt.disabled_reason && <span className="bd-move-err">{opt.disabled_reason}</span>}
      </span>
    </button>
  )
}

/** 교체 화면 / 파티 목록의 한 줄 */
function PartyCard({ p, state, onPick, showNumbers = true }: { p: PokeView; state: 'active' | 'fainted' | 'ok'; onPick?: () => void; showNumbers?: boolean }) {
  const { t, lang } = useBT()
  const name = pokemonLabel(p, lang)
  const label = [state === 'ok' ? t('switchTo', { name }) : name, `${pctOf(p)}%`, state === 'active' ? t('inBattle') : state === 'fainted' ? t('fainted') : null].filter(Boolean).join(', ')
  return (
    <button type="button" className={`bd-party is-${state}`} disabled={state !== 'ok'} onClick={onPick} aria-label={label}>
      <span className="bd-party-icon">
        <FallbackImg sources={iconCandidates(p.species)} alt="" />
      </span>
      <span className="bd-party-body">
        <span className="bd-party-row">
          <b>{name}</b><Gender g={p.gender} />
          <span className="bd-party-lv">{t('level', { n: p.level })}</span>
          {p.item && <img className="bd-item-icon is-pixel" src={itemIconUrl(p.item)} alt={itemName(p.item, lang)} title={itemName(p.item, lang)} onError={e => { e.currentTarget.style.display = 'none' }} />}
        </span>
        <span className="bd-party-row">
          {p.status && !p.fainted && <StatusBadge status={p.status} turns={p.statusTurns} lang={lang} />}
          <HpBar p={p} label={t('hpLabel', { hp: p.hp, max: p.max_hp })} />
        </span>
        <span className="bd-party-hp">
          {state === 'active' ? t('inBattle') : state === 'fainted' ? t('fainted') : showNumbers ? `${p.hp}/${p.max_hp}` : `${pctOf(p)}%`}
        </span>
      </span>
    </button>
  )
}

type View = 'command' | 'fight' | 'party' | 'run'

export interface ActionConsoleProps {
  session: BattleSession
  player: PlayerID
  /** 지금 메시지 상자 글 */
  message: ReactNode
  /** 재생할 메시지가 더 남았는지 */
  more: boolean
  team: PokeView[]
  /** 손가락흔들기: 지난번에 나온 기술 */
  lastCalled?: { move: string; type: string } | null
}

export function ActionConsole({ session, player, message, more, team, lastCalled }: ActionConsoleProps) {
  const { t, lang } = useBT()
  const { request, version, engine } = session
  // request() 는 부를 때마다 새 객체 → 엔진이 바뀔 때(version)·재생이 끝날 때만 다시 받는다
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const req = useMemo(() => request(player), [request, player, version])
  const [view, setView] = useState<View>('command')
  const [tera, setTera] = useState(false)

  const previews = useMemo(() => {
    if (!engine || !req || req.type !== 'move') return {}
    const out: Record<number, MovePreview> = {}
    for (const opt of req.moves) {
      if (opt.move.category === 'status' || opt.index < 0) continue
      const r = engine.previewDamage(player, opt.index, { terastallize: tera })
      if (!r) continue
      if (r.max === 0) { out[opt.index] = { text: '0%', eff: r.effectiveness, ko: null }; continue }
      const pct = (n: number) => Math.min(100, Math.round(n))
      out[opt.index] = { text: `${pct(r.minPercent)}–${pct(r.maxPercent)}%`, eff: r.effectiveness, ko: koLabel(r, lang) }
    }
    return out
  }, [engine, req, player, tera, lang])

  if (!req) {
    return (
      <div className="bd-console is-wait">
        <MessageBox text={message} more={more} />
      </div>
    )
  }

  const active = req.active
  const activeName = pokemonLabel(active, lang)
  const switchTo = (id: string) => session.submit({ type: 'switch', player, pokemon_id: active.id, switch_to_id: id })
  const canSwitch = req.switches.length > 0 && (req.type === 'switch' || req.can_switch)
  const switchIds = new Set(req.switches.map(s => s.id))
  const party = (
    <div className="bd-party-grid" role="group" aria-label={t('pokemon')}>
      {team.map(p => (
        <PartyCard
          key={p.id}
          p={p}
          state={p.fainted ? 'fainted' : switchIds.has(p.id) ? 'ok' : 'active'}
          onPick={() => switchTo(p.id)}
        />
      ))}
    </div>
  )

  // 기절 후·유턴 등: 교체만
  if (req.type === 'switch') {
    return (
      <div className="bd-console is-party">
        <MessageBox text={req.reason === 'faint' ? t('switchFaint') : t('switchPick')} />
        {party}
      </div>
    )
  }

  const prompt = t('whatWillDo', { name: activeName })
  const metronome = req.moves.length === 1 && req.moves[0]!.move.name === 'metronome'

  if (view === 'fight' || req.forced) {
    return (
      <div className="bd-console is-fight">
        <MessageBox text={req.forced ? t('movesLocked') : metronome ? t('metroWhat') : prompt} />
        <div className={`bd-moves${metronome ? ' is-single' : ''}`} role="group" aria-label={t('fight')}>
          {req.moves.map(opt => (
            <MoveButton
              key={opt.index}
              opt={opt}
              preview={previews[opt.index] ?? null}
              extra={metronome && lastCalled ? <span className="bd-move-last">{t('metroLast', { move: moveName(lastCalled.move, lang) })}</span> : undefined}
              onPick={() => session.submit({ type: 'move', player, pokemon_id: active.id, move_index: opt.index, terastallize: tera || undefined })}
            />
          ))}
        </div>
        <div className="bd-fight-foot">
          {req.can_terastallize && active.tera_type && (
            <button
              type="button"
              className={`bd-tera${tera ? ' is-on' : ''}`}
              aria-pressed={tera}
              style={{ '--type': TYPE_COLOR[active.tera_type] ?? '#888' } as CSSProperties}
              onClick={() => setTera(v => !v)}
            >
              {typeIconUrl(active.tera_type) && <span className="bd-type-glyph" style={{ backgroundImage: `url(${typeIconUrl(active.tera_type)})` }} aria-hidden />}
              {t('terastallize')}
              <small>{typeName(active.tera_type, lang)}</small>
            </button>
          )}
          {!req.forced && <button type="button" className="bd-back" onClick={() => setView('command')}>{t('back')}</button>}
        </div>
      </div>
    )
  }

  if (view === 'party') {
    return (
      <div className="bd-console is-party">
        <MessageBox text={t('switchPick')} />
        {party}
        <div className="bd-fight-foot"><button type="button" className="bd-back" onClick={() => setView('command')}>{t('back')}</button></div>
      </div>
    )
  }

  if (view === 'run') {
    return (
      <div className="bd-console is-command">
        <MessageBox text={t('forfeitConfirm')} />
        <div className="bd-cmd is-confirm">
          <button type="button" className="bd-cmd-btn is-run" onClick={() => session.forfeit(player)}>{t('forfeitYes')}</button>
          <button type="button" className="bd-cmd-btn is-pokemon" onClick={() => setView('command')}>{t('forfeitNo')}</button>
        </div>
      </div>
    )
  }

  return (
    <div className="bd-console is-command">
      <MessageBox text={prompt} />
      <div className="bd-cmd" role="group" aria-label={prompt}>
        <button type="button" className="bd-cmd-btn is-fight" onClick={() => setView('fight')}>{t('fight')}</button>
        <button type="button" className="bd-cmd-btn is-pokemon" disabled={!canSwitch} onClick={() => setView('party')}>{t('pokemon')}</button>
        <button type="button" className="bd-cmd-btn is-run" onClick={() => setView('run')}>{t('run')}</button>
      </div>
    </div>
  )
}

export type { BattleRequest }
