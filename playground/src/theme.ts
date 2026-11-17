import { defineTheme } from '@astryxdesign/core/theme'
import { neutralTheme } from '@astryxdesign/theme-neutral/built'

// 한 장의 다크 그라운드 + 하늘색 액센트(버튼 전용). 라이트/다크 튜플 모두 같은 값 → 항상 다크.
const dark = (v: string): [string, string] => [v, v]

export const pokebattleTheme = defineTheme({
  name: 'pokebattle',
  extends: neutralTheme,
  typography: {
    heading: { family: 'Host Grotesk', fallbacks: "'Pretendard Variable', Pretendard, system-ui, sans-serif" },
    body: { family: 'Instrument Sans', fallbacks: "'Pretendard Variable', Pretendard, system-ui, sans-serif" },
    code: { family: 'JetBrains Mono', fallbacks: "'Pretendard Variable', ui-monospace, Consolas, monospace" },
  },
  radius: { base: 8, multiplier: 1 },
  tokens: {
    '--color-background-body': dark('#0f1012'),
    '--color-background-surface': dark('#0f1012'),
    '--color-background-card': dark('#161719'),
    '--color-background-popover': dark('#161719'),
    '--color-background-muted': dark('#161719'),
    '--color-syntax-background': dark('#161719'),
    '--color-border': dark('#252729'),
    '--color-border-emphasized': dark('#3a3d41'),
    '--color-text-primary': dark('#faf9fa'),
    '--color-text-secondary': dark('#c9c9c8'),
    '--color-accent': dark('#b4d3ff'),
    '--color-text-accent': dark('#b4d3ff'),
    '--color-on-accent': dark('#040404'),
  },
})
