// 문서 사이트는 배포되는 번들(../dist)을 그대로 쓴다 — 사용자가 받는 것과 같은 크기·동작.
// 엔진을 먼저 빌드해야 한다 (루트에서 npm run build, 또는 이 폴더의 predev/prebuild 가 없으면 만든다)
export * from '../../dist-web/index.js'

import { preloadData } from '../../dist-web/index.js'

/** 예제가 쓰는 랜덤배틀 세트·기술표·7세대 데이터. 화면은 먼저 그리고 뒤에서 받는다 */
export const dataReady: Promise<void> = preloadData({ gens: [7] })
