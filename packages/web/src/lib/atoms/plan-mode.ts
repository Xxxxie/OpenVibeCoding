import { atom } from 'jotai'
import { atomFamily } from 'jotai/utils'

/**
 * PlanMode 状态（按 taskId 隔离）。
 *
 * Plan 模式（参考 CodeBuddy Code 反编译 02-state-management.ts 的 planMode 设计）
 * 含三种"边界":
 *
 * 1. **会话级开关**：`active` 反映当前会话是否处于 `permissionMode: 'plan'`。
 *    - 用户主动 `/plan` 开启
 *    - 服务端在 Agent 退出时自动复位（reject_and_exit_plan 或 turn end）
 *
 * 2. **计划内容缓存**：`planContent` 保存最近一次 `ExitPlanMode` 工具提交的 Markdown，
 *    供 PlanModeCard 展示 / 重新打开回顾。
 *
 * 3. **打断 ID 锚点**：`toolCallId` 是当前 Plan 审批对应的 ExitPlanMode 工具调用 ID，
 *    用于把用户的三值决策（allow / deny / reject_and_exit_plan）绑定到该中断。
 */
export interface PlanModeState {
  /** 会话是否处于 Plan 模式 */
  active: boolean
  /** 最近一次 ExitPlanMode 呈交的 Markdown 计划内容 */
  planContent: string | null
  /** 当前待确认的 ExitPlanMode 工具调用 ID */
  toolCallId: string | null
}

const INITIAL: PlanModeState = {
  active: false,
  planContent: null,
  toolCallId: null,
}

export const planModeAtomFamily = atomFamily((_taskId: string) => atom<PlanModeState>(INITIAL))
