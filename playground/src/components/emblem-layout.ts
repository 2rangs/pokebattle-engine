// 킬가르도 실드폼(뒤, 왼쪽 위) + 블레이드폼(앞, 오른쪽 아래)을 엇갈리게 겹친 심볼의 구성.
const ART = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork'
export const SHIELD = `${ART}/681.png`
export const BLADE = `${ART}/10026.png`

// 심볼 상자 기준 비율 (0~1)
export const LAYOUT = {
  shield: { x: 0, y: 0, s: 0.72 },
  blade: { x: 0.34, y: 0.3, s: 0.66 },
}


/** 같은 엠블럼을 64px 캔버스에 그려 파비콘으로 지정 (PokeAPI 이미지는 CORS 허용) */
export function installFavicon() {
  const load = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
  Promise.all([load(SHIELD), load(BLADE)]).then(([shield, blade]) => {
    const n = 64
    const c = document.createElement('canvas')
    c.width = c.height = n
    const g = c.getContext('2d')!
    for (const [img, k] of [[shield, 'shield'], [blade, 'blade']] as const) {
      const l = LAYOUT[k]
      g.drawImage(img, l.x * n, l.y * n, l.s * n, l.s * n)
    }
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (!link) {
      link = document.createElement('link')
      link.rel = 'icon'
      document.head.appendChild(link)
    }
    link.type = 'image/png'
    link.href = c.toDataURL('image/png')
  }).catch(() => { /* 정적 파비콘(실드폼)을 그대로 둔다 */ })
}
