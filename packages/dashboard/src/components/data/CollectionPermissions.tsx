import { useState } from 'react'
import { Modal, ModalBody, ModalFooter } from '../ui/Modal'
import { Button } from '../ui'
import { Shield } from 'lucide-react'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  collectionName: string
}

const PERMISSIONS = [
  { value: 'private', label: '私有', desc: '仅创建者和管理员可读写' },
  { value: 'public-read', label: '公有读', desc: '所有用户可读，仅创建者/管理员可写' },
  { value: 'public-read-write', label: '公有读写', desc: '所有用户可读写（危险）' },
  { value: 'auth-read', label: '登录可读', desc: '登录用户可读，仅创建者/管理员可写' },
]

export default function CollectionPermissions({ open, onOpenChange, collectionName }: Props) {
  const [selected, setSelected] = useState('private')

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={`权限设置 - ${collectionName}`}
      description="设置集合的访问控制权限"
      size="sm"
    >
      <ModalBody className="space-y-2">
        {PERMISSIONS.map((p) => (
          <label
            key={p.value}
            className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
              selected === p.value ? 'border-brand bg-brand/5' : 'border-border-default hover:border-border-strong'
            }`}
          >
            <input
              type="radio"
              value={p.value}
              checked={selected === p.value}
              onChange={() => setSelected(p.value)}
              className="mt-0.5 accent-brand"
            />
            <div>
              <p className="text-sm font-medium text-fg-default">{p.label}</p>
              <p className="text-xs text-fg-lighter mt-0.5">{p.desc}</p>
            </div>
          </label>
        ))}
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" size="small" onClick={() => onOpenChange(false)}>
          取消
        </Button>
        <Button variant="primary" size="small" onClick={() => onOpenChange(false)}>
          <Shield size={14} /> 保存权限
        </Button>
      </ModalFooter>
    </Modal>
  )
}
