import * as React from 'react'

// MiMo logo — PNG asset from public/logos/mimo.png
// Accepts className/style like other logo components so it fits inline selectors
const MiMo = ({
  className,
  style,
  width,
  height,
}: {
  className?: string
  style?: React.CSSProperties
  width?: string | number
  height?: string | number
}) => (
  <img
    src="/logos/mimo.png"
    alt="MiMo"
    className={className}
    style={{ display: 'inline-block', objectFit: 'contain', ...style }}
    width={width ?? '1em'}
    height={height ?? '1em'}
  />
)

export default MiMo
