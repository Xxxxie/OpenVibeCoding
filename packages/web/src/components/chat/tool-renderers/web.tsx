import { Globe, Search as SearchIcon } from 'lucide-react'
import type { ToolRenderer, ToolRenderContext } from './index'

interface WebFetchInput {
  url?: string
  prompt?: string
}

interface WebSearchInput {
  query?: string
  allowed_domains?: string[]
  blocked_domains?: string[]
}

export const webFetchRenderer: ToolRenderer = {
  Icon: Globe,
  getSummary: ({ input }) => {
    const u = (input as WebFetchInput)?.url
    if (!u) return undefined
    try {
      const parsed = new URL(u)
      return parsed.host + parsed.pathname.slice(0, 30)
    } catch {
      return u.length > 50 ? `${u.slice(0, 50)}…` : u
    }
  },
  renderInput: ({ input }: ToolRenderContext) => {
    const { url, prompt } = (input as WebFetchInput) || {}
    if (!url) return null
    return (
      <div className="space-y-1">
        <div className="text-[11px] font-mono break-all">
          <span className="text-muted-foreground">GET </span>
          <a href={url} target="_blank" rel="noreferrer" className="text-foreground underline-offset-2 hover:underline">
            {url}
          </a>
        </div>
        {prompt && <div className="text-[11px] text-muted-foreground italic">"{prompt}"</div>}
      </div>
    )
  },
}

export const webSearchRenderer: ToolRenderer = {
  Icon: SearchIcon,
  getSummary: ({ input }) => {
    const q = (input as WebSearchInput)?.query
    return q && q.length > 60 ? `${q.slice(0, 60)}…` : q
  },
  renderInput: ({ input }: ToolRenderContext) => {
    const { query, allowed_domains, blocked_domains } = (input as WebSearchInput) || {}
    if (!query) return null
    return (
      <div className="space-y-1">
        <div className="text-[11px]">
          <span className="text-muted-foreground">q: </span>
          <span className="font-mono">{query}</span>
        </div>
        {allowed_domains?.length ? (
          <div className="text-[11px] text-muted-foreground">allow: {allowed_domains.join(', ')}</div>
        ) : null}
        {blocked_domains?.length ? (
          <div className="text-[11px] text-muted-foreground">block: {blocked_domains.join(', ')}</div>
        ) : null}
      </div>
    )
  },
}
