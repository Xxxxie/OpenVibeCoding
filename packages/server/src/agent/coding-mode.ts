const DEV_SERVER_PORT = 5173

/**
 * The correct vite.config.ts content for CloudBase sandbox preview.
 * - base "./" for static hosting deployment (relative asset paths)
 * - dev server is launched with --base=/preview/ CLI flag which overrides this
 * - server.host "0.0.0.0" lets the CloudBase gateway proxy reach the dev server
 * - server.allowedHosts true allows requests from the gateway domain
 */
const SANDBOX_VITE_CONFIG = `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// CloudBase sandbox preview setup:
// - base "./" for static hosting deployment (relative asset paths)
// - dev server is launched with --base=/preview/ CLI flag which overrides this
// - server.host "0.0.0.0" lets the CloudBase gateway proxy reach the dev server
// - server.allowedHosts true allows requests from the gateway domain
export default defineConfig({
  plugins: [react()],
  base: "./",
  server: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: true,
  },
});
`

// ─── Exports ───────────────────────────────────────────────────────────────

/**
 * Returns the system prompt for coding mode.
 * The project is seeded from a CloudBase Web template (React + Vite + Tailwind + DaisyUI).
 * The agent should modify the existing template rather than scaffold from scratch.
 */
export function getCodingSystemPrompt(envId: string, publishableKey: string): string {
  return `<coding-mode>
当前处于 Coding 模式，你正在一个基于 CloudBase Web 项目模板的 React 应用中工作。
模板已包含完整的项目脚手架，请基于已有代码进行页面修改和功能开发，不要从零搭建项目。

<IMPORTANT>
IMPORTANT: 必须先读取 src/utils/cloudbase.ts，将其中的 ENV_ID 和 PUBLISHABLE_KEY 替换为当前环境的真实值。
IMPORTANT: 直接修改代码而非创建 .env 文件。
- ENV_ID：${envId}
- PUBLISHABLE_KEY：${publishableKey}
<IMPORTANT>

技术栈：
- React 18 + TypeScript
- Vite 6（开发服务器 + 构建工具）
- Tailwind CSS（原子化 CSS 框架）
- React Router（客户端路由）

开发规则：
1. 仅使用以上技术栈，除非用户明确要求，不要引入新框架或库。
2. 新组件放在 src/components/，新页面放在 src/pages/ 并在 src/App.tsx 注册路由。
3. 代码修改后 Vite HMR 会自动热更新，不需要手动重启 dev server。
6. 一轮对话内完成所有工作：写好所有文件、安装依赖、确保应用能运行，不要期望用户追问后再继续。
</coding-mode>`
}

export const CODING_DEV_SERVER_PORT = DEV_SERVER_PORT
