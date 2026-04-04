import { useState, useEffect } from 'react'
import { Modal, ModalBody, ModalFooter } from '../ui/Modal'
import { Button } from '../ui'
import { AlertCircle } from 'lucide-react'

interface DocumentEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'edit'
  document: any | null
  collectionName: string
  onSave: (data: any) => void
}

export default function DocumentEditor({
  open,
  onOpenChange,
  mode,
  document,
  collectionName,
  onSave,
}: DocumentEditorProps) {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      if (mode === 'edit' && document) {
        const { _id, ...rest } = document
        setText(JSON.stringify(rest, null, 2))
      } else {
        setText('{\n  \n}')
      }
      setError(null)
    }
  }, [open, mode, document])

  const handleSave = async () => {
    try {
      const parsed = JSON.parse(text)
      if (typeof parsed !== 'object' || Array.isArray(parsed)) {
        setError('文档必须是 JSON 对象')
        return
      }
      setSaving(true)
      await onSave(parsed)
    } catch (e) {
      setError(e instanceof SyntaxError ? '无效的 JSON: ' + e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={mode === 'create' ? `向 ${collectionName} 插入文档` : `编辑文档`}
      description={mode === 'edit' && document ? `_id: ${document._id}` : undefined}
      size="md"
    >
      <ModalBody>
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setError(null)
          }}
          className="w-full h-[280px] rounded border border-border-default bg-bg-surface-200 p-3 font-mono text-xs text-fg-default placeholder:text-fg-muted resize-none focus:border-brand focus:ring-1 focus:ring-brand/30 focus:outline-none"
          placeholder='{ "key": "value" }'
        />
        {error && (
          <div className="mt-2 flex items-center gap-2 text-xs text-destructive">
            <AlertCircle size={14} /> {error}
          </div>
        )}
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" size="small" onClick={() => onOpenChange(false)}>
          取消
        </Button>
        <Button variant="primary" size="small" onClick={handleSave} disabled={saving}>
          {saving ? '保存中...' : mode === 'create' ? '插入' : '保存'}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
