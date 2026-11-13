import { useState } from 'react'
import Markdown from 'react-markdown'
import { ChevronDown, FileText } from 'lucide-react'
import type { Source } from './api'

type Props = { text: string; sources: Source[]; messageId: string }

export default function AnswerContent({ text, sources, messageId }: Props) {
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const formatted = text.replace(/\[(\d+(?:\s*,\s*\d+)*)\](?!\()/g, (original, values: string) => {
    const numbers = [...new Set(values.split(',').map(value => Number(value.trim())))]
    if (!numbers.every(number => number >= 1 && number <= sources.length)) return original
    return `[${numbers.length === 1 ? 'Source' : numbers.length + ' sources'}](#citation-${numbers.join('-')})`
  })

  function revealSource(number: number) {
    setSourcesOpen(true)
    requestAnimationFrame(() => {
      const passage = document.getElementById(`source-${messageId}-${number}`)
      passage?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' })
      passage?.focus({ preventScroll: true })
    })
  }

  return <>
    <div className="message-content markdown-answer">
      <Markdown skipHtml components={{
        img: () => null,
        a: ({ href, children }) => {
          const citation = href?.match(/^#citation-(\d+(?:-\d+)*)$/)
          const numbers = citation?.[1].split('-').map(Number)
          if (numbers?.length && numbers.every(number => number >= 1 && number <= sources.length)) {
            const description = numbers.map(number => `${sources[number - 1].filename}, page ${sources[number - 1].page}`).join('; ')
            return <button type="button" className="citation-link" title={description}
              aria-label={`View sources: ${description}`} onClick={() => revealSource(numbers[0])}>
              <FileText size={12} />{children}
            </button>
          }
          return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
        },
      }}>{formatted}</Markdown>
    </div>
    {sources.length > 0 && <details className="sources" open={sourcesOpen} onToggle={event => setSourcesOpen(event.currentTarget.open)}>
      <summary><FileText size={14} /> Sources · {sources.length} passages <ChevronDown size={14} /></summary>
      {sources.map((source, index) => <div key={index} id={`source-${messageId}-${index + 1}`} tabIndex={-1}>
        <strong>{source.filename} · Page {source.page}</strong><p>{source.content}</p>
      </div>)}
    </details>}
  </>
}
