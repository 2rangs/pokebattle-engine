import type { ReactNode } from 'react'
import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'
import { CodeBlock } from '@astryxdesign/core/CodeBlock'
import { Table, proportional } from '@astryxdesign/core/Table'

export { Code as C } from '@astryxdesign/core/Code'

export function P({ children }: { children: ReactNode }) {
  return <Text as="p" display="block" color="secondary">{children}</Text>
}

export function H2({ children }: { children: ReactNode }) {
  return <div className="h2"><Heading level={2}>{children}</Heading></div>
}

export function H3({ children }: { children: ReactNode }) {
  return <Heading level={3}>{children}</Heading>
}

export function Ul({ items }: { items: ReactNode[] }) {
  return (
    <ul className="prose-list">
      {items.map((it, i) => <li key={i}><Text color="secondary">{it}</Text></li>)}
    </ul>
  )
}

export function Snippet({ code, lang = 'ts', title }: { code: string; lang?: string; title?: string }) {
  return <CodeBlock code={code} language={lang} title={title} width="100%" />
}

type Row = Record<string, ReactNode> & { k: string }

/** 첫 열은 API 이름(코드체), 나머지는 설명. 열 수는 head 길이만큼 (2열이면 4:6, 그 이상은 균등) */
export function ApiTable({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  const keys = head.map((_, i) => `c${i}`)
  const data: Row[] = rows.map((r, i) => ({ k: String(i), ...Object.fromEntries(keys.map((key, j) => [key, r[j]])) }))
  const widths = head.length === 2 ? [4, 6] : head.length === 3 ? [3, 3, 4] : head.map(() => 1)
  const columns = keys.map((key, i) => ({ key, header: head[i], width: proportional(widths[i]!), renderCell: (r: Row) => r[key] }))
  return (
    <div className="table-wrap">
      <Table<Row> data={data} columns={columns as never} idKey="k" density="compact" verticalAlign="top" />
    </div>
  )
}
