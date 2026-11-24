// ─── 팀 프리뷰: 서로의 팀을 보고 출전할 포켓몬과 순서를 고른다 (게임처럼, 처음 고른 포켓몬이 선발) ─────
import { useState } from 'react'
import type { BattlePokemon, PlayerID } from '../lib/engine'
import { itemName, pokemonLabel } from '../lib/names'
import { iconCandidates } from '../lib/sprites'
import { FallbackImg, TypeBadge } from './bits'
import type { BattleSession } from './useBattleSession'
import { useBT } from './state'

function Mon({ p, order, onClick, showItem }: { p: BattlePokemon; order?: number; onClick?: () => void; showItem: boolean }) {
  const { t, lang } = useBT()
  const body = (
    <>
      <span className="bd-slot-icon"><FallbackImg sources={iconCandidates(p.species)} alt="" /></span>
      <span className="bd-tp-text">
        <b>{pokemonLabel(p.set, lang)} <span className="bd-slot-lv">{t('level', { n: p.level })}</span></b>
        <span className="bd-slot-types">{p.types.filter(Boolean).map(ty => <TypeBadge key={ty} type={ty!} lang={lang} size="xs" />)}</span>
        {showItem && p.item && <small>{itemName(p.item, lang)}</small>}
      </span>
      {order !== undefined && <span className={`bd-tp-order${order === 0 ? ' is-lead' : ''}`}>{order === 0 ? t('previewLead') : order + 1}</span>}
    </>
  )
  return onClick
    ? <button type="button" className={`bd-tp-mon${order !== undefined ? ' is-picked' : ''}`} aria-pressed={order !== undefined} onClick={onClick}>{body}</button>
    : <div className="bd-tp-mon is-static">{body}</div>
}

export function TeamPreview({ session, onExit }: { session: BattleSession; onExit: () => void }) {
  const { t } = useBT()
  const req = session.preview
  const [order, setOrder] = useState<string[]>([])
  const e = session.engine
  if (!e) return null
  const me: PlayerID = req?.player ?? (session.isAI('p1') ? 'p2' : 'p1')
  const foeId: PlayerID = me === 'p1' ? 'p2' : 'p1'
  const foe = e.getState().sides[foeId].team
  const pick = req?.pick ?? 0
  const all = req ? pick >= req.team.length : false
  const toggle = (id: string) => setOrder(o => (o.includes(id) ? o.filter(x => x !== id) : o.length < pick ? [...o, id] : o))
  const done = !!req && order.length === pick
  const items = e.gen >= 2
  return (
    <section className="bd-tp" aria-labelledby="bd-tp-title">
      <header className="bd-tp-head">
        <h2 id="bd-tp-title">{t('previewTitle')}</h2>
        <p>{req ? (all ? t('previewChooseAll') : t('previewChoose', { k: pick })) : t('previewWaiting')}</p>
      </header>
      <div className="bd-tp-cols">
        <div>
          <h3>{t('previewYours')} {req && <span className="bd-tp-count">{order.length}/{pick}</span>}</h3>
          <div className="bd-tp-grid">
            {(req?.team ?? e.getState().sides[me].team).map(p => (
              <Mon key={p.id} p={p} showItem={items} order={order.includes(p.id) ? order.indexOf(p.id) : undefined} onClick={req ? () => toggle(p.id) : undefined} />
            ))}
          </div>
        </div>
        <div>
          <h3>{t('previewFoe')}</h3>
          <div className="bd-tp-grid is-foe">
            {foe.map(p => <Mon key={p.id} p={p} showItem={false} />)}
          </div>
        </div>
      </div>
      <div className="bd-tp-actions">
        <button type="button" className="bd-btn is-ghost" onClick={onExit}>{t('backToTeam')}</button>
        {order.length > 0 && <button type="button" className="bd-btn is-ghost" onClick={() => setOrder([])}>{t('previewReset')}</button>}
        <button
          type="button"
          className="bd-btn is-primary is-large"
          disabled={!done}
          onClick={() => { if (req && done) { session.submit({ type: 'team', player: req.player, order }); setOrder([]) } }}
        >{t('previewConfirm')}</button>
      </div>
    </section>
  )
}
