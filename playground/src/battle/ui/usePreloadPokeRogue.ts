import { useEffect } from 'react'
import { loadAtlas } from '../lib/atlas'
import { pokeRogueAtlas, type AtlasUrls } from '../lib/pokerogue'

/** 두 팀의 아틀라스(상대 = 앞모습, 우리 = 뒷모습)를 미리 받아 둔다 (교체 때 늦게 뜨지 않게) */
export function usePreloadPokeRogue(enabled: boolean, ours: readonly { species: string; gender: 'M' | 'F' | null; shiny?: boolean }[], foes: readonly { species: string; gender: 'M' | 'F' | null; shiny?: boolean }[]) {
  const urls = enabled
    ? [...ours.map(p => pokeRogueAtlas(p.species, true, p.gender, p.shiny)), ...foes.map(p => pokeRogueAtlas(p.species, false, p.gender, p.shiny))]
      .filter((u): u is AtlasUrls => !!u)
    : []
  const key = [...new Set(urls.map(u => `${u.json} ${u.png}`))].join('|')
  useEffect(() => {
    if (!key) return
    for (const pair of key.split('|')) {
      const [json, png] = pair.split(' ')
      loadAtlas(json, png).catch(() => {})
    }
  }, [key])
}
