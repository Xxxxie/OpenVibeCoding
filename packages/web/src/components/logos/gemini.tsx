interface GeminiProps {
  className?: string
  width?: number
  height?: number
}

const Gemini = ({ className = 'w-6 h-6', width = 24, height = 24 }: GeminiProps) => (
  <img src="/logos/gemini.svg" alt="Gemini" width={width} height={height} className={className} />
)

export default Gemini
