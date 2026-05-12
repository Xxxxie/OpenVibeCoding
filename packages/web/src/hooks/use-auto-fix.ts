/**
 * useAutoFix — 预览错误自动修复调度
 *
 * 触发源（外部调用 scheduleAutoFix）：
 *   1. iframe 预览内 postMessage({type:'preview-error', ...})
 *   2. 一轮对话完成时后端探测 `/api/tasks/:id/preview-errors`
 *
 * 行为：
 *   - 仅当 chatStream 当前 phase='idle'（canFetchMessages() === true）才发送
 *   - 单 task 自动修复最多 MAX_AUTO_FIX 次；超过后 toast 一次提示，不再自动发
 *   - 同一指纹（source+message前200字符）5s 内不重复发送
 *   - taskId 切换 → 计数 / 防抖 / toast 状态全重置
 *   - 调用方用户手动发 prompt 时需显式调 notifyUserSend() → 计数归零
 */

import { useCallback, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import type { useChatStream } from './use-chat-stream'

const MAX_AUTO_FIX = 3
const DEDUP_WINDOW_MS = 5_000
const FP_MESSAGE_SLICE = 200

export interface AutoFixError {
  /** 错误来源，如 'postMessage' / 'onStreamComplete' / 'manual-button' */
  source: string
  /** 给 LLM 的主描述（简短） */
  summary: string
  /** 详细信息（stack / componentStack / build frame 等，可选） */
  detail?: string
}

type ChatStreamLike = Pick<ReturnType<typeof useChatStream>, 'canFetchMessages' | 'sendMessage'>

export function useAutoFix(
  taskId: string,
  opts: {
    chatStream: ChatStreamLike
  },
) {
  const countRef = useRef(0)
  const lastFingerprintRef = useRef<{ fp: string; at: number } | null>(null)
  const exhaustedNotifiedRef = useRef(false)

  // taskId 变更：整体重置
  useEffect(() => {
    countRef.current = 0
    lastFingerprintRef.current = null
    exhaustedNotifiedRef.current = false
  }, [taskId])

  const scheduleAutoFix = useCallback(
    (err: AutoFixError) => {
      // 1) 只在 idle 时发；否则静默丢弃（下次 onStreamComplete 或 postMessage 会再触发）
      if (!opts.chatStream.canFetchMessages()) return

      // 2) 计数超上限 → 一次性 toast
      if (countRef.current >= MAX_AUTO_FIX) {
        if (!exhaustedNotifiedRef.current) {
          toast.error(`已自动修复 ${MAX_AUTO_FIX} 次仍有错误，请手动检查`)
          exhaustedNotifiedRef.current = true
        }
        return
      }

      // 3) 指纹防抖
      const fp = `${err.source}|${err.summary.slice(0, FP_MESSAGE_SLICE)}`
      const now = Date.now()
      const last = lastFingerprintRef.current
      if (last && last.fp === fp && now - last.at < DEDUP_WINDOW_MS) return
      lastFingerprintRef.current = { fp, at: now }

      // 4) 组装 prompt
      const prompt = [
        '预览页面报错了，请定位并修复：',
        '',
        `来源：${err.source}`,
        err.summary,
        ...(err.detail ? ['', err.detail] : []),
      ].join('\n')

      countRef.current += 1
      // 不恢复 draft（用户没有输入），忽略返回的 promise（不 await — hook 触发点不等）
      void opts.chatStream.sendMessage(prompt, () => {}, undefined, { isAutoFix: true })
    },
    [opts.chatStream],
  )

  /** 用户手动发送 prompt 时调用：计数 + toast 状态全重置 */
  const notifyUserSend = useCallback(() => {
    countRef.current = 0
    exhaustedNotifiedRef.current = false
    lastFingerprintRef.current = null
  }, [])

  return {
    scheduleAutoFix,
    notifyUserSend,
    /** 暴露当前计数（可选，供调试/展示） */
    getCount: () => countRef.current,
    MAX_AUTO_FIX,
  }
}
