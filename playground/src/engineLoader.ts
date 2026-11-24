// 엔진(../dist)과 예제용 데이터는 처음 필요할 때 받는다 (랜딩·문서 첫 화면은 엔진 없이 그린다)
import { bindEngine } from './examples'

type Engine = typeof import('./engine')
let loading: Promise<Engine> | null = null

/** 엔진 모듈 + 예제 데이터 준비 (여러 번 불러도 한 번만 받는다). 예제 함수들도 이 엔진에 묶인다 */
export function loadEngine(): Promise<Engine> {
  return (loading ??= import('./engine').then(async m => {
    await m.dataReady
    bindEngine(m)
    return m
  }))
}
