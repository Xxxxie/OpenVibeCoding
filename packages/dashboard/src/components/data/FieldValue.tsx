import { useState } from 'react'
import { ChevronRight } from 'lucide-react'

interface Props {
  value: unknown
  inline?: boolean
}

// 数组/对象颜色 - 用柔和的青蓝色，不用紫色
const BRACKET_CLS = 'text-fg-light'
// 数字 - 淡蓝
const NUM_CLS = 'text-blue-400'
// 布尔 true/false
const BOOL_TRUE_CLS = 'text-emerald-400'
const BOOL_FALSE_CLS = 'text-fg-lighter'
// 日期
const DATE_CLS = 'text-amber-400'
// null
const NULL_CLS = 'text-fg-muted italic'
// 字符串 key
const KEY_CLS = 'text-fg-lighter'

function ArrayValue({ items, inline }: { items: unknown[]; inline?: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const isSimple = items.every((i) => typeof i !== 'object' || i === null)

  if (inline || (isSimple && items.length <= 4)) {
    return (
      <span className="font-mono text-xs">
        <span className={BRACKET_CLS}>[</span>
        {items.map((item, i) => (
          <span key={i}>
            {i > 0 && <span className="text-fg-muted">, </span>}
            <FieldValue value={item} inline />
          </span>
        ))}
        <span className={BRACKET_CLS}>]</span>
      </span>
    )
  }
  return (
    <span className="text-xs">
      <button
        onClick={(e) => {
          e.stopPropagation()
          setExpanded(!expanded)
        }}
        className={`inline-flex items-center gap-0.5 font-mono ${BRACKET_CLS} hover:text-fg-default`}
      >
        <ChevronRight size={10} className={`transition-transform ${expanded ? 'rotate-90' : ''}`} />
        <span>[{items.length}]</span>
      </button>
      {expanded && (
        <div className="ml-3 mt-0.5 border-l border-border-muted pl-2 space-y-0.5">
          {items.map((item, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-[10px] text-fg-muted font-mono w-4 text-right shrink-0">{i}</span>
              <FieldValue value={item} />
            </div>
          ))}
        </div>
      )}
    </span>
  )
}

function ObjectValue({ obj, inline }: { obj: Record<string, unknown>; inline?: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const entries = Object.entries(obj)

  if (inline) {
    const preview = entries
      .slice(0, 2)
      .map(([k, v]) => {
        const vStr = v === null ? 'null' : typeof v === 'string' ? `"${String(v).slice(0, 10)}"` : String(v)
        return `${k}:${vStr}`
      })
      .join(' ')
    return (
      <span className={`text-xs font-mono ${BRACKET_CLS}`}>
        {'{'} {preview}
        {entries.length > 2 ? ' …' : ''} {'}'}
      </span>
    )
  }
  return (
    <span className="text-xs">
      <button
        onClick={(e) => {
          e.stopPropagation()
          setExpanded(!expanded)
        }}
        className={`inline-flex items-center gap-0.5 font-mono ${BRACKET_CLS} hover:text-fg-default`}
      >
        <ChevronRight size={10} className={`transition-transform ${expanded ? 'rotate-90' : ''}`} />
        <span>
          {'{'} {entries.length} {'}'}
        </span>
      </button>
      {expanded && (
        <div className="ml-3 mt-0.5 border-l border-border-muted pl-2 space-y-0.5">
          {entries.map(([k, v]) => (
            <div key={k} className="flex items-start gap-1.5">
              <span className={`text-[11px] font-mono shrink-0 ${KEY_CLS}`}>{k}:</span>
              <FieldValue value={v} />
            </div>
          ))}
        </div>
      )}
    </span>
  )
}

export function FieldValue({ value, inline }: Props) {
  if (value === null || value === undefined) return <span className={`text-xs font-mono ${NULL_CLS}`}>null</span>

  if (typeof value === 'boolean')
    return <span className={`text-xs font-mono ${value ? BOOL_TRUE_CLS : BOOL_FALSE_CLS}`}>{String(value)}</span>

  if (typeof value === 'number') {
    // 时间戳格式化显示
    const isTs = (value >= 946684800 && value <= 4102444800) || (value >= 946684800000 && value <= 4102444800000)
    if (isTs) {
      const ms = value > 4102444800 ? value : value * 1000
      const str = new Date(ms).toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
      return <span className={`text-xs font-mono ${DATE_CLS}`}>{str}</span>
    }
    return <span className={`text-xs font-mono ${NUM_CLS}`}>{String(value)}</span>
  }

  if (typeof value === 'string') {
    // 日期
    if (/^\d{4}-\d{2}-\d{2}(T|\s)\d{2}:\d{2}/.test(value))
      return <span className={`text-xs font-mono ${DATE_CLS}`}>{value}</span>
    // 普通字符串
    const display = inline && value.length > 48 ? value.slice(0, 48) + '…' : value
    return <span className="text-xs text-fg-default">{display}</span>
  }

  if (Array.isArray(value)) return <ArrayValue items={value} inline={inline} />
  if (typeof value === 'object') return <ObjectValue obj={value as Record<string, unknown>} inline={inline} />

  return <span className="text-xs text-fg-default">{String(value)}</span>
}

export function TypeTag({ value }: { value: unknown }) {
  const isTimestamp =
    typeof value === 'number' &&
    ((value >= 946684800 && value <= 4102444800) || (value >= 946684800000 && value <= 4102444800000))

  const type =
    value === null
      ? 'null'
      : Array.isArray(value)
        ? 'array'
        : isTimestamp
          ? 'date'
          : typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(T|\s)\d{2}:\d{2}/.test(value)
            ? 'date'
            : typeof value

  const cls: Record<string, string> = {
    string: 'text-fg-muted',
    number: 'text-blue-400',
    boolean: 'text-emerald-400',
    date: 'text-amber-400',
    null: 'text-fg-muted',
    object: 'text-fg-light',
    array: 'text-fg-light',
  }
  return (
    <span className={`text-[9px] font-mono px-1 py-0.5 rounded bg-bg-surface-300 ${cls[type] || 'text-fg-muted'}`}>
      {type}
    </span>
  )
}
