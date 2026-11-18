// ─── 메시지 → 문장 (언어별) ───────────────────────────────────
import type { BattleEvent, PlayerID } from '../types/battle'
import type { Arg, FormatContext, Locale, Message, NameResolver, Template, TermGroup } from './types'
import { describeEvent } from './describe'
import { CONDITION_ENTITY, getNames, type EntityKind } from './names'

const locales = new Map<string, Locale>()

/** 로케일 등록 (새 언어 추가, 내장 로케일 교체) */
export function registerLocale(locale: Locale): void {
    locales.set(locale.code, locale)
}

/** 등록된 로케일 */
export function getLocale(code: string): Locale | undefined {
    return locales.get(code)
}

export function listLocales(): string[] {
    return [...locales.keys()]
}

export interface FormatterOptions extends FormatContext {
    /** 로케일 또는 코드 (기본 'ko') */
    locale?: Locale | string
    /** 엔티티 이름 직접 지정 (데이터보다 우선) */
    names?: NameResolver
    /** 문장 일부만 바꾸기 (로케일 messages 보다 우선) */
    messages?: Record<string, Template>
}

export interface Formatter {
    readonly locale: Locale
    /** 이벤트 → 문장 (보여줄 필요 없으면 null) */
    format(event: BattleEvent): string | null
    /** 이벤트 → 언어와 무관한 메시지 */
    describe(event: BattleEvent): Message[] | null
    /** 메시지 → 문장 */
    render(messages: readonly Message[]): string | null
    /** 이름 조회 (UI 라벨 등에서 같은 이름을 재사용) */
    name: {
        pokemon(id: string): string
        species(slug: string): string
        move(slug: string): string
        ability(slug: string): string
        item(slug: string): string
        type(slug: string): string
        nature(slug: string): string
        term(group: TermGroup, key: string): string
        effect(slug: string): string
        side(player: PlayerID): string
    }
}

const plurals = new Map<string, Intl.PluralRules>()
function pluralRule(code: string, n: number): Intl.LDMLPluralRule {
    let r = plurals.get(code)
    if (!r) {
        try { r = new Intl.PluralRules(code) } catch { r = new Intl.PluralRules('en') }
        plurals.set(code, r)
    }
    return r.select(n)
}

const prettify = (slug: string) => slug.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

// 선택 구간: {?…} 안의 인자가 모두 있을 때만 출력 (예: "{?{pokemon}: }파티 전원의 상태이상이 나았다!")
const OPTIONAL = /\{\?((?:[^{}]|\{\w+\})*)\}/g
const PLACEHOLDER = /\{(\w+)\}/g

export function createFormatter(options: FormatterOptions): Formatter {
    const locale = typeof options.locale === 'object' ? options.locale
        : getLocale(options.locale ?? 'ko') ?? (() => { throw new Error(`로케일이 없습니다: ${options.locale} (등록: ${listLocales().join(', ')})`) })()
    const chain: Locale[] = []
    for (let l: Locale | undefined = locale; l && !chain.includes(l); l = l.fallback) chain.push(l)
    const ctx: FormatContext = options
    const self: PlayerID = options.perspective ?? 'p1'
    const overrides = options.names ?? {}

    function template(key: string, variant?: string): Template | undefined {
        if (options.messages) {
            if (variant && options.messages[`${key}.${variant}`] !== undefined) return options.messages[`${key}.${variant}`]
            if (options.messages[key] !== undefined) return options.messages[key]
        }
        for (const l of chain) {
            if (variant && l.messages[`${key}.${variant}`] !== undefined) return l.messages[`${key}.${variant}`]
            if (l.messages[key] !== undefined) return l.messages[key]
        }
        return undefined
    }

    function term(group: TermGroup, key: string): string | null {
        for (const l of chain) {
            const v = l.terms[group]?.[key]
            if (v !== undefined) return v
        }
        return null
    }

    /** 데이터에서 이름 (없으면 null) */
    function dataName(kind: EntityKind, slug: string): string | null {
        for (const l of chain) {
            const names = getNames(l.names ?? l.code)
            if (!names) continue
            const v = names[kind](slug)
            if (v) return v
            // 이름 데이터에 없는 폼(vivillon-elegant 등)은 같은 언어의 기본 종 이름으로 (다른 언어로 넘어가기 전에)
            if (kind === 'species') {
                const parts = slug.split('-')
                for (let i = parts.length - 1; i >= 1; i--) {
                    const base = names.species(parts.slice(0, i).join('-'))
                    if (base) return base
                }
            }
        }
        return null
    }

    function entity(kind: EntityKind, slug: string): string {
        const o = kind === 'species' ? overrides.pokemon : kind === 'nature' ? undefined : overrides[kind]
        return o?.(slug) ?? dataName(kind, slug) ?? prettify(slug)
    }

    // 출처는 기술·도구·특성·상태·날씨·조건 중 무엇이든 될 수 있다. 종류는 언어와 무관하게(영어 데이터로) 정한다
    const en = getNames('en')!
    function effect(slug: string): string {
        const key = slug.replace(/-/g, '_')
        const t = term('effect', slug) ?? term('effect', key) ?? term('volatile', key) ?? term('status', key) ?? term('weather', key)
        if (t !== null) return t
        const cond = CONDITION_ENTITY[key]
        if (cond?.move) return entity('move', cond.move)
        if (cond?.ability) return entity('ability', cond.ability)
        if (en.move(slug)) return entity('move', slug)
        if (en.item(slug)) return entity('item', slug)
        if (en.ability(slug)) return entity('ability', slug)
        return prettify(slug)
    }

    function fill(tpl: Template, params: Message['params']): string | null {
        let text: string
        if (typeof tpl === 'string') text = tpl
        else {
            const n = typeof params.count === 'number' ? params.count : 0
            text = tpl[pluralRule(locale.code, n)] ?? tpl.other
        }
        const value = (name: string): string | null => (params[name] === undefined ? null : arg(params[name]!))
        text = text.replace(OPTIONAL, (_, inner: string) => {
            let ok = true
            const out = inner.replace(PLACEHOLDER, (__, n: string) => value(n) ?? ((ok = false), ''))
            return ok ? out : ''
        })
        let missing = false
        text = text.replace(PLACEHOLDER, (_, n: string) => value(n) ?? ((missing = true), ''))
        return missing ? null : text
    }

    function label(key: string, name: string): string {
        const tpl = template(key)
        return tpl === undefined ? name : fill(tpl, { name: { text: name } }) ?? name
    }

    function pokemonBase(id: string): string | null {
        const p = ctx.getPokemon(id)
        if (!p) return null
        if (p.nickname && p.nickname !== p.species && p.nickname !== p.set?.species) return p.nickname
        return entity('species', p.species)
    }

    function pokemon(id: string): string {
        const base = pokemonBase(id)
        if (base === null) return id
        return label(id.startsWith(self) ? 'label.self' : 'label.foe', base)
    }

    function side(player: PlayerID): string {
        if (ctx.sideName) return label('side.named', ctx.sideName(player))
        const tpl = template(player === self ? 'side.self' : 'side.foe')
        return tpl === undefined ? player : fill(tpl, {}) ?? player
    }

    function arg(a: Arg): string {
        if (typeof a === 'number') return String(a)
        if ('text' in a) return a.text
        if ('pokemon' in a) return pokemon(a.pokemon)
        if ('name' in a) return pokemonBase(a.name) ?? a.name
        if ('side' in a) return side(a.side)
        if ('term' in a) return term(a.term, a.key) ?? prettify(a.key)
        if ('effect' in a) return effect(a.effect)
        if ('move' in a) return entity('move', a.move)
        if ('ability' in a) return entity('ability', a.ability)
        if ('item' in a) return entity('item', a.item)
        if ('type' in a) return entity('type', a.type)
        return entity('species', a.species)
    }

    function renderOne(msg: Message): string | null {
        for (const key of Array.isArray(msg.key) ? msg.key : [msg.key]) {
            const tpl = template(key, msg.variant)
            if (tpl === undefined) continue
            const text = fill(tpl, msg.params)
            if (text !== null) return text
        }
        return null
    }

    function render(messages: readonly Message[]): string | null {
        const parts = messages.map(renderOne).filter((t): t is string => !!t)
        if (!parts.length) return null
        const text = parts.join(locale.joiner ?? ' ')
        return locale.postProcess ? locale.postProcess(text) : text
    }

    return {
        locale,
        describe: event => describeEvent(event, ctx),
        render,
        format(event) {
            const msgs = describeEvent(event, ctx)
            return msgs ? render(msgs) : null
        },
        name: {
            pokemon,
            species: s => entity('species', s),
            move: s => entity('move', s),
            ability: s => entity('ability', s),
            item: s => entity('item', s),
            type: s => entity('type', s),
            nature: s => entity('nature', s),
            term: (g, k) => term(g, k) ?? prettify(k),
            effect,
            side,
        },
    }
}
