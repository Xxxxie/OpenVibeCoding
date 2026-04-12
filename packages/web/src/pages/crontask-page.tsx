import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api'
import { Button } from '../components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '../components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog'
import { Label } from '../components/ui/label'
import { Input } from '../components/ui/input'
import { Textarea } from '../components/ui/textarea'
import { Switch } from '../components/ui/switch'
import { Badge } from '../components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Clock } from 'lucide-react'
import { SharedHeader } from '../components/shared-header'

interface CronTaskItem {
  id: string
  name: string
  prompt: string
  cronExpression: string
  enabled: boolean
  repoUrl: string | null
  selectedAgent: string | null
  selectedModel: string | null
  lastRunAt: number | null
  nextRunAt: number | null
  createdAt: number
  updatedAt: number
}

const SCHEDULE_PRESETS = [
  { label: '每天 8:00', value: '0 8 * * *' },
  { label: '每天 12:00', value: '0 12 * * *' },
  { label: '每天 18:00', value: '0 18 * * *' },
  { label: '每天 20:00', value: '0 20 * * *' },
  { label: '每周一 9:00', value: '0 9 * * 1' },
  { label: '每周五 18:00', value: '0 18 * * 5' },
  { label: '每小时', value: '0 * * * *' },
  { label: '每 30 分钟', value: '*/30 * * * *' },
]

function formatDate(ts: number | null) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function describeCron(expr: string): string {
  const preset = SCHEDULE_PRESETS.find((p) => p.value === expr)
  if (preset) return preset.label
  return expr
}

export function CronTaskPage() {
  const [tasks, setTasks] = useState<CronTaskItem[]>([])
  const [loading, setLoading] = useState(true)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<CronTaskItem | null>(null)
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<CronTaskItem | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Form state
  const [formName, setFormName] = useState('')
  const [formPrompt, setFormPrompt] = useState('')
  const [formCron, setFormCron] = useState('')
  const [formEnabled, setFormEnabled] = useState(true)
  const [scheduleMode, setScheduleMode] = useState<'simple' | 'advanced'>('simple')

  const loadTasks = useCallback(async () => {
    try {
      const res = await api.get<{ success: boolean; data: CronTaskItem[] }>('/api/crontask')
      setTasks(res.data)
    } catch {
      toast.error('加载定时任务失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadTasks()
  }, [loadTasks])

  function openAddDialog() {
    setEditingTask(null)
    setFormName('')
    setFormPrompt('')
    setFormCron('0 20 * * *')
    setFormEnabled(true)
    setScheduleMode('simple')
    setDialogOpen(true)
  }

  function openEditDialog(task: CronTaskItem) {
    setEditingTask(task)
    setFormName(task.name)
    setFormPrompt(task.prompt)
    setFormCron(task.cronExpression)
    setFormEnabled(task.enabled)
    setScheduleMode(SCHEDULE_PRESETS.some((p) => p.value === task.cronExpression) ? 'simple' : 'advanced')
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!formName.trim() || !formPrompt.trim() || !formCron.trim()) {
      toast.error('名称、执行内容和调度规则不能为空')
      return
    }

    setSaving(true)
    try {
      if (editingTask) {
        await api.patch(`/api/crontask/${editingTask.id}`, {
          name: formName.trim(),
          prompt: formPrompt.trim(),
          cronExpression: formCron.trim(),
          enabled: formEnabled,
        })
        toast.success('已更新')
      } else {
        await api.post('/api/crontask', {
          name: formName.trim(),
          prompt: formPrompt.trim(),
          cronExpression: formCron.trim(),
          enabled: formEnabled,
        })
        toast.success('已添加')
      }
      setDialogOpen(false)
      await loadTasks()
    } catch (err: any) {
      toast.error(err.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.delete(`/api/crontask/${deleteTarget.id}`)
      toast.success('已删除')
      setDeleteTarget(null)
      await loadTasks()
    } catch (err: any) {
      toast.error(err.message || '删除失败')
    } finally {
      setDeleting(false)
    }
  }

  async function handleToggleEnabled(task: CronTaskItem) {
    try {
      await api.patch(`/api/crontask/${task.id}`, { enabled: !task.enabled })
      await loadTasks()
    } catch {
      toast.error('切换状态失败')
    }
  }

  const headerLeft = (
    <div className="flex items-center gap-2 min-w-0">
      <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      <h1 className="text-base font-semibold truncate">定时任务</h1>
    </div>
  )

  return (
    <div className="flex-1 bg-background flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 px-3 py-2 border-b">
        <SharedHeader leftActions={headerLeft} />
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold">调度规则</h2>
            <p className="text-sm text-muted-foreground mt-1">
              配置定时任务，到达设定时间后自动创建 Agent 会话执行指定操作。
            </p>
          </div>
          <Button onClick={openAddDialog} className="flex-shrink-0">
            <Plus className="h-4 w-4 mr-2" />
            添加定时任务
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">加载中...</div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-4">
            <Clock className="h-12 w-12 opacity-20" />
            <div className="text-center">
              <p className="font-medium">暂无定时任务</p>
              <p className="text-sm mt-1">添加一个定时任务，让 Agent 按时自动执行</p>
            </div>
            <Button variant="outline" onClick={openAddDialog}>
              <Plus className="h-4 w-4 mr-2" />
              添加第一个定时任务
            </Button>
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-[160px]">名称</TableHead>
                  <TableHead>执行内容</TableHead>
                  <TableHead className="w-[140px]">调度规则</TableHead>
                  <TableHead className="w-[80px] text-center">状态</TableHead>
                  <TableHead className="w-[140px]">上次执行</TableHead>
                  <TableHead className="w-[80px] text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasks.map((task) => (
                  <TableRow key={task.id} className="hover:bg-muted/30">
                    <TableCell className="font-medium">{task.name}</TableCell>
                    <TableCell className="text-muted-foreground text-sm max-w-[300px] truncate">
                      {task.prompt}
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                        {describeCron(task.cronExpression)}
                      </code>
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch checked={task.enabled} onCheckedChange={() => handleToggleEnabled(task)} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(task.lastRunAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                          onClick={() => openEditDialog(task)}
                          title="编辑"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => setDeleteTarget(task)}
                          title="删除"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{editingTask ? '编辑定时任务' : '添加定时任务'}</DialogTitle>
            <DialogDescription>
              {editingTask ? '更新定时任务配置。' : '配置一个定时执行的 Agent 任务。'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 overflow-y-auto flex-1">
            <div className="space-y-2">
              <Label htmlFor="ct-name">
                名称 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="ct-name"
                placeholder="每日入账查询"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ct-prompt">
                执行内容 <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="ct-prompt"
                placeholder="查询数据库今天有哪些入账记录，汇总金额并生成报告"
                className="min-h-[100px] resize-none"
                value={formPrompt}
                onChange={(e) => setFormPrompt(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">到达设定时间后，Agent 将以此内容发起新会话</p>
            </div>

            <div className="space-y-2">
              <Label>
                调度规则 <span className="text-destructive">*</span>
              </Label>

              <div className="flex items-center gap-2 mb-2">
                <Button
                  variant={scheduleMode === 'simple' ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setScheduleMode('simple')}
                >
                  简单模式
                </Button>
                <Button
                  variant={scheduleMode === 'advanced' ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setScheduleMode('advanced')}
                >
                  高级模式
                </Button>
              </div>

              {scheduleMode === 'simple' ? (
                <Select value={formCron} onValueChange={setFormCron}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择执行频率" />
                  </SelectTrigger>
                  <SelectContent>
                    {SCHEDULE_PRESETS.map((preset) => (
                      <SelectItem key={preset.value} value={preset.value}>
                        {preset.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <>
                  <Input
                    placeholder="0 20 * * *"
                    className="font-mono"
                    value={formCron}
                    onChange={(e) => setFormCron(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    标准 Cron 表达式：分 时 日 月 周（例如 <code className="bg-muted px-1 rounded">0 20 * * *</code>{' '}
                    表示每天 20:00）
                  </p>
                </>
              )}
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="ct-enabled">启用</Label>
              <Switch id="ct-enabled" checked={formEnabled} onCheckedChange={setFormEnabled} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? '保存中...' : editingTask ? '更新' : '添加'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除定时任务</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除 <strong>{deleteTarget?.name}</strong> 吗？此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleting ? '删除中...' : '确认删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
