// ─── 배틀 데모 진입점 (#/demo, #/demo/replay?d=…) ─────────────────
// 문서 사이트(App.tsx)가 지연 로드한다. 엔진 데이터·Tailwind 유틸리티는 이 청크에만 들어 있다.
import './demo.css'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { HStack } from '@astryxdesign/core/HStack'
import { Text } from '@astryxdesign/core/Text'
import { DemoLangProvider, LANGS, useDemoLang, type Lang } from './lang'
import { useBattleT } from './hud/util'
import DemoPage from './DemoPage'
import ReplayPage from './ReplayPage'

const LANG_LABEL: Record<Lang, string> = { ko: '한국어', en: 'English', ja: '日本語' }

function LangBar() {
  const { lang, setLang } = useDemoLang()
  const t = useBattleT()
  return (
    <HStack gap={2} vAlign="center" hAlign="end" wrap="wrap">
      <Text type="supporting" color="secondary">{t('logLang')}</Text>
      <SegmentedControl label={t('logLang')} size="sm" value={lang} onChange={v => setLang(v as Lang)}>
        {LANGS.map(l => <SegmentedControlItem key={l} value={l} label={LANG_LABEL[l]} />)}
      </SegmentedControl>
    </HStack>
  )
}

/** route: '/demo' 또는 '/demo/replay?d=…' (해시 뒤) */
export default function Demo({ route }: { route: string }) {
  const [path, query = ''] = route.split('?')
  const replay = path === '/demo/replay'
  const d = new URLSearchParams(query).get('d') ?? ''
  return (
    <DemoLangProvider>
      <div className="demo wrap">
        <LangBar />
        {replay ? <ReplayPage key={d} d={d} /> : <DemoPage />}
      </div>
    </DemoLangProvider>
  )
}
