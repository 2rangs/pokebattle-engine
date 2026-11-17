import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Theme } from '@astryxdesign/core/theme'
import '@astryxdesign/core/reset.css'
import '@astryxdesign/core/astryx.css'
import '@astryxdesign/theme-neutral/theme.css'
import './index.css'
import App from './App.tsx'
import { LangProvider } from './i18n'
import { pokebattleTheme } from './theme'
import { installFavicon } from './components/emblem-layout'

installFavicon()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Theme theme={pokebattleTheme} mode="dark">
      <LangProvider>
        <App />
      </LangProvider>
    </Theme>
  </StrictMode>,
)
