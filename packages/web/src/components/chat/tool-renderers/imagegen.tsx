import { ImageIcon } from 'lucide-react'
import { MarkdownBlock } from '../markdown-block'
import type { ToolRenderer, ToolRenderContext } from './index'

interface ImageGenInput {
  prompt?: string
  size?: string
  n?: number
  quality?: string
  style?: string
}

export const imageGenRenderer: ToolRenderer = {
  Icon: ImageIcon,

  getSummary: ({ input, isPending }) => {
    const prompt = (input as ImageGenInput)?.prompt
    if (!prompt) return isPending ? 'Generating image…' : 'Image generated'
    const short = prompt.length > 50 ? `${prompt.slice(0, 50)}…` : prompt
    return isPending ? `Generating: ${short}` : short
  },

  renderInput: ({ input }: ToolRenderContext) => {
    const { prompt, size, n, quality, style } = (input as ImageGenInput) || {}
    if (!prompt) return null
    return (
      <div className="space-y-1 text-[11px]">
        <div>
          <span className="text-muted-foreground">prompt: </span>
          <span>{prompt}</span>
        </div>
        {size && (
          <div>
            <span className="text-muted-foreground">size: </span>
            <span className="font-mono">{size}</span>
          </div>
        )}
        {n && n > 1 && (
          <div>
            <span className="text-muted-foreground">n: </span>
            <span className="font-mono">{n}</span>
          </div>
        )}
        {quality && (
          <div>
            <span className="text-muted-foreground">quality: </span>
            <span className="font-mono">{quality}</span>
          </div>
        )}
        {style && (
          <div>
            <span className="text-muted-foreground">style: </span>
            <span className="font-mono">{style}</span>
          </div>
        )}
      </div>
    )
  },

  renderOutput: ({ result, isPending }: ToolRenderContext) => {
    if (isPending || !result) return null

    if (result?.startsWith('{')) {
      try {
        const json = JSON.parse(result)
        result = (json?.text as string) || result
      } catch (e) {}
    }
    return <MarkdownBlock>{result}</MarkdownBlock>
  },
}
