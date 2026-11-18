// ─── 한국어 ───────────────────────────────────────────────────
// 기술·특성·도구 이름과 같은 조건 이름(스텔스록·트릭룸·도발 등)은 이름 데이터에서 가져오므로 여기 없다.
import type { Locale } from '../types'
import { en } from './en'

/** 받침에 맞춰 '이(가)' 같은 조사를 고른다 */
export function fixParticles(text: string): string {
    const PAIRS: Record<string, [string, string]> = {
        '이(가)': ['이', '가'], '은(는)': ['은', '는'], '을(를)': ['을', '를'], '과(와)': ['과', '와'], '(으)로': ['으로', '로'],
    }
    return text.replace(/(.)(이\(가\)|은\(는\)|을\(를\)|과\(와\)|\(으\)로)/g, (_, prev: string, pair: string) => {
        const code = prev.charCodeAt(0)
        if (code < 0xac00 || code > 0xd7a3) return prev + pair
        const batchim = (code - 0xac00) % 28
        const [withB, withoutB] = PAIRS[pair]!
        // '(으)로' 는 ㄹ 받침 뒤에서도 '로'
        if (pair === '(으)로' && batchim === 8) return prev + withoutB
        return prev + (batchim !== 0 ? withB : withoutB)
    })
}

export const ko: Locale = {
    code: 'ko',
    // 이름 데이터가 없는 것(새 기술 등)은 영어 이름으로
    fallback: en,
    postProcess: fixParticles,
    terms: {
        status: { burn: '화상', freeze: '얼음', paralysis: '마비', poison: '독', toxic: '맹독', sleep: '잠듦' },
        stat: {
            hp: 'HP', attack: '공격', defense: '방어', special_attack: '특수공격', special_defense: '특수방어',
            speed: '스피드', accuracy: '명중률', evasion: '회피율',
        },
        weather: {
            sun: '쾌청', harsh_sun: '아주 강한 햇살', rain: '비', heavy_rain: '강한 비', sandstorm: '모래바람',
            snow: '설경', strong_winds: '난기류',
        },
        direction: { left: '왼쪽', right: '오른쪽' },
        volatile: { confusion: '혼란', flinch: '풀죽음', recharging: '반동', paradox_boost: '능력 상승' },
        effect: { drain: '흡수', recoil: '반동', crash: '착지 실패', unboost: '능력 하락 방지', heal: '회복' },
    },
    messages: {
        'label.self': '{name}',
        'label.foe': '상대 {name}',
        'side.self': '우리 편',
        'side.foe': '상대 편',
        'side.named': '{name}',

        'battle.start': '{p1} vs {p2} 배틀 시작!',
        'turn.start': '── {turn}턴 ──',
        'move.use': '{pokemon}의 {move}!',
        'move.miss': '맞지 않았다!',
        'move.miss.target': '{pokemon}에게는 맞지 않았다!',
        'move.fail': '하지만 실패했다!',
        'move.fail.protect': '방어로 공격을 막았다!',
        'move.fail.substitute': '대타가 대신 막았다!',
        'move.fail.reason': '하지만 실패했다! ({effect})',
        'move.fail.reason.heal': '하지만 {pokemon}의 HP는 가득 차 있다!',

        'cant': '{pokemon}은(는) 움직일 수 없다!',
        'cant.sleep': '{pokemon}은(는) 쿨쿨 잠들어 있다!',
        'cant.freeze': '{pokemon}은(는) 얼어버려서 움직일 수 없다!',
        'cant.paralysis': '{pokemon}은(는) 몸이 저려서 움직일 수 없다!',
        'cant.flinch': '{pokemon}은(는) 풀이 죽어 움직일 수 없다!',
        'cant.confusion': '{pokemon}은(는) 영문도 모른 채 자신을 공격했다!',
        'cant.recharge': '{pokemon}은(는) 공격의 반동으로 움직일 수 없다!',
        'cant.taunt': '{pokemon}은(는) 도발당해서 변화 기술을 쓸 수 없다!',
        'cant.no_pp': '{pokemon}은(는) 기술의 남은 PP가 없다!',
        'cant.infatuation': '{pokemon}은(는) 헤롱헤롱해서 기술을 쓸 수 없었다!',
        'cant.truant': '{pokemon}은(는) 게으름을 피우고 있다!',
        'cant.other': '{pokemon}은(는) 움직일 수 없다!',
        'cant.other.detail': '{pokemon}은(는) 움직일 수 없다! ({effect})',

        'damage.crit': '급소에 맞았다!',
        'damage.super': '효과가 굉장했다!',
        'damage.resisted': '효과가 별로인 듯하다…',
        'damage': '{pokemon}에게 {amount} 데미지 (-{percent}%, 남은 HP {hp}/{max_hp})',
        'damage.from': '{pokemon}에게 {amount} 데미지 (-{percent}%, 남은 HP {hp}/{max_hp}) ({effect})',
        'damage.substitute': '대타가 {pokemon} 대신 공격을 받았다!',
        'heal': '{pokemon}의 HP가 {amount} 회복되었다',
        'heal.from': '{pokemon}의 HP가 {amount} 회복되었다 ({effect})',
        'immune': '{pokemon}에게는 효과가 없는 것 같다…',
        'immune.from': '{pokemon}에게는 효과가 없는 것 같다… ({effect})',
        'faint': '{pokemon}은(는) 쓰러졌다!',

        'status.apply': '{pokemon}은(는) {status} 상태가 되었다!',
        'status.remove': '{pokemon}의 {status} 상태가 풀렸다!',
        'volatile.start': '{pokemon}: {volatile}',
        'volatile.end': '{pokemon}의 {volatile}이(가) 풀렸다',
        'volatile.start.substitute': '{pokemon}의 대타가 나타났다!',
        'volatile.end.substitute': '{pokemon}의 대타는 사라져 버렸다…',
        'volatile.start.future-sight': '{pokemon}은(는) 미래를 내다보았다!',
        'volatile.end.future-sight': '{pokemon}은(는) 미래예지 공격을 받았다!',
        'volatile.start.doom-desire': '{pokemon}은(는) 파멸의소원을 빌었다!',
        'volatile.end.doom-desire': '{pokemon}은(는) 파멸의소원 공격을 받았다!',

        'stat.up': '{pokemon}의 {stat}이(가) 올라갔다!',
        'stat.up.2': '{pokemon}의 {stat}이(가) 크게 올라갔다!',
        'stat.up.3': '{pokemon}의 {stat}이(가) 극적으로 올라갔다!',
        'stat.up.max': '{pokemon}의 {stat}은(는) 더 이상 오르지 않는다!',
        'stat.down': '{pokemon}의 {stat}이(가) 떨어졌다!',
        'stat.down.2': '{pokemon}의 {stat}이(가) 크게 떨어졌다!',
        'stat.down.3': '{pokemon}의 {stat}이(가) 극적으로 떨어졌다!',
        'stat.down.min': '{pokemon}의 {stat}은(는) 더 이상 떨어지지 않는다!',

        'weather.start': '{weather} 상태가 되었다!',
        'weather.end': '날씨가 원래대로 돌아왔다.',
        'terrain.start': '{terrain}이(가) 펼쳐졌다!',
        'terrain.end': '필드가 원래대로 돌아왔다.',
        'side.start': '{side}에 {condition}!',
        'side.layers': '({count}단계)',
        'side.end': '{side}의 {condition}이(가) 사라졌다.',
        'field.start': '{condition} 상태가 되었다!',
        'field.end': '{condition} 상태가 끝났다.',

        'switch.in.self': '가랏! {pokemon}',
        'switch.in.foe': '상대가 내보냈다: {name}',
        'switch.in.named': '{side}은(는) {name}을(를) 내보냈다!',
        'switch.replace.self': '돌아와, {outName}! 가랏! {name}!',
        'switch.replace.foe': '상대는 {outName}을(를) 거둬들이고 {name}을(를) 내보냈다!',
        'switch.replace.named': '{side}은(는) {outName}을(를) 거둬들이고 {name}을(를) 내보냈다!',
        'switch.drag': '{pokemon}이(가) 끌려 나왔다!',
        'item.activate.air-balloon': '{pokemon}은(는) 풍선으로 떠 있다!',
        'side.end.absorbed': '{pokemon}이(가) {condition}을(를) 흡수했다!',
        'activate.sticky-web': '{pokemon}은(는) 끈적끈적네트에 걸렸다!',
        'switch.return': '{pokemon}은(는) 트레이너에게로 돌아갔다!',
        'switch.return.named': '{pokemon}은(는) {side}에게로 돌아갔다!',
        'item.consume.red-card': '{pokemon}은(는) {target}에게 {item}을(를) 내밀었다!',
        'item.consume.eject-button': '{pokemon}은(는) {item}(으)로 교체된다!',
        'item.consume.eject-pack': '{pokemon}은(는) {item}(으)로 교체된다!',
        'item.consume.air-balloon': '{pokemon}의 풍선이 터졌다!',
        'volatile.start.octolock': '{pokemon}은(는) 문어굳히기에 걸려 도망칠 수 없다!',
        'activate.trapped': '{pokemon}은(는) 이제 도망칠 수 없다!',
        'activate.bound': '{pokemon}은(는) {effect}에 붙잡혔다!',
        'activate.fairy-lock': '다음 턴에는 아무도 도망칠 수 없다!',
        'activate.chilly-reception': '{pokemon}은(는) 썰렁한 개그를 하려 한다!',
        'activate.suction-cups': '{pokemon}은(는) 흡반으로 달라붙어 꿈쩍도 하지 않는다!',
        'activate.guard-dog': '{pokemon}은(는) 꿈쩍도 하지 않는다!',
        'activate.ingrain': '{pokemon}은(는) 뿌리를 박고 있어 꿈쩍도 하지 않는다!',
        'activate.pursuit': '{pokemon}이(가) 물러나려 한다!',
        'rotate': '{side}: {direction}(으)로 로테이션! {pokemon}이(가) 앞으로 나왔다',
        'rotate.out': '{side}: {direction}(으)로 로테이션! {pokemon}이(가) 앞으로 나왔다 ({out}은(는) 뒤로)',

        'ability': '[{ability}] {pokemon}',
        'item.consume': '{pokemon}은(는) {item}을(를) 다 써버렸다!',
        'item.activate': '{pokemon}: {item}',
        'mega': '{pokemon}이(가) 메가진화했다!',
        'mega.primal': '{pokemon}의 원시회귀! 원래의 모습을 되찾았다!',
        'mega.ultra': '{pokemon}이(가) 울트라버스트했다!',
        'volatile.start.dynamax': '{pokemon}이(가) 다이맥스했다!',
        'volatile.end.dynamax': '{pokemon}의 다이맥스가 끝났다!',
        'activate.z-power': '{pokemon}이(가) Z파워를 몸에 둘렀다!',
        'activate.z-broken': '{pokemon}은(는) 완전히 막지 못하고 데미지를 받았다!',
        'tera': '{pokemon}이(가) {type} 테라스탈했다!',
        'hits': '{count}번 맞았다!',
        'forme': '{pokemon}의 모습이 바뀌었다!',
        'message': '{text}',

        'activate': '{pokemon}: {effect}',
        'activate.detail': '{pokemon}: {effect} ({detail})',
        'activate.cure-team': '{?{pokemon}: }파티 전원의 상태이상이 나았다!',
        'activate.clearallboost': '{?{pokemon}: }모든 랭크 변화가 원래대로 돌아왔다!',
        'activate.clearboost': '{?{pokemon}: }랭크 변화가 원래대로 돌아왔다!',
        'activate.clearnegativeboost': '{?{pokemon}: }떨어진 랭크가 원래대로 돌아왔다!',
        'activate.clearpositiveboost': '{?{pokemon}: }오른 랭크가 원래대로 돌아왔다!',
        'activate.setboost': '{?{pokemon}: }랭크가 변했다!',
        'activate.invertboost': '{?{pokemon}: }랭크 변화가 뒤집혔다!',
        'activate.swapboost': '{?{pokemon}: }랭크 변화를 서로 바꿨다!',
        'activate.copyboost': '{?{pokemon}: }랭크 변화를 복사했다!',
        'activate.typechange': '{?{pokemon}: }타입이 바뀌었다!',
        'activate.charging': '{?{pokemon}: }힘을 모으고 있다!',
        'activate.court-change': '{?{pokemon}: }서로의 필드 효과를 바꿨다!',
        'activate.ohko': '일격필살!',
        'activate.ability-suppressed': '{?{pokemon}: }특성이 없어졌다!',
        'activate.psychic-terrain': '{pokemon}은(는) 사이코필드에 보호받고 있다!',
        'activate.ally-switch': '{pokemon}이(가) 자리를 바꿨다!',

        'end.draw': '무승부!',
        'end.win.self': '{side} 승리!',
        'end.win.foe': '{side} 승리!',
        'end.win.named': '{side} 승리!',
    },
}
