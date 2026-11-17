import { Dex, toID } from '@pkmn/sim'
import { readFileSync } from 'node:fs'
const load = (f: string) => JSON.parse(readFileSync('src/data/' + f, 'utf8'))
const report = (kind: string, names: string[], get: (id: string) => { exists: boolean; isNonstandard?: any; name: string }) => {
  const miss: string[] = []
  for (const n of names) {
    let e = get(toID(n))
    if (!e.exists) miss.push(n)
  }
  console.log(kind, names.length, 'missing', miss.length)
  console.log('  ', miss.slice(0, 400).join(' '))
}
const P = load('pokemon.json')
report('species', P.map((p: any) => p.name), id => Dex.species.get(id))
report('moves', load('moves.json').map((m: any) => m.name), id => Dex.moves.get(id))
report('abilities', load('abilities.json').map((m: any) => m.name), id => Dex.abilities.get(id))
// reverse: PS species (gen9-ish) not in pokeapi
const pokeapi = new Set(P.map((p: any) => toID(p.name)))
const psOnly = Dex.species.all().filter(s => !s.isNonstandard || s.isNonstandard === 'Past').filter(s => !pokeapi.has(s.id)).map(s => s.id)
console.log('PS species not directly in pokeapi', psOnly.length, psOnly.slice(0, 200).join(' '))
