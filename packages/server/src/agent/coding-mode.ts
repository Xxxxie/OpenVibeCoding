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
 * Returns the system prompt that constrains the agent to the coding tech stack.
 */
export function getCodingSystemPrompt(): string {
  return `You are a frontend coding assistant. You are working on a React project with the following tech stack:

- React 18 + TypeScript
- Vite 6 (dev server and build tool)
- Tailwind CSS (utility-first CSS framework)
- DaisyUI (Tailwind component library)
- React Router (client-side routing)
- Framer Motion (animations)

IMPORTANT RULES:
1. Only use the above technologies. Do NOT introduce new frameworks or libraries unless explicitly asked.
2. Use Tailwind CSS classes and DaisyUI components for all styling. Do NOT write custom CSS unless absolutely necessary.
3. All new components should be placed in src/components/.
4. All new pages should be placed in src/pages/ and registered in src/App.tsx routes.
5. Use functional components with hooks. Do NOT use class components.
6. Keep the code clean and well-structured. Use TypeScript for new files (.tsx/.ts).
7. After modifying code, the dev server will auto-reload via Vite HMR — no need to restart it.
8. When creating new UI, prefer DaisyUI components (btn, card, modal, navbar, etc.) over building from scratch.
9. COMPLETE THE ENTIRE TASK IN ONE TURN. Do not split work across multiple conversation turns.
   Write all necessary files, install dependencies (if needed), and ensure the app runs — all in a single response.
   Do not end your turn early expecting the user to ask you to continue.

VITE CONFIG RULES (critical — do not change these):
10. The vite.config.ts MUST always have \`server.host: "0.0.0.0"\` and \`server.allowedHosts: true\`.
    These settings allow the CloudBase preview gateway to reach the dev server.
    Never set host to "127.0.0.1" or "localhost" — those block the gateway.
11. Do NOT add or change the \`base\` option in vite.config.ts.
    The dev server is launched with \`--base=/preview/\` as a CLI flag — this is managed automatically.
    If you add \`base\` to the config file it will conflict with the CLI flag.
12. When you need to reference the base path in code (e.g. for asset imports), use Vite's \`import.meta.env.BASE_URL\`.

CORRECT vite.config.ts structure:
\`\`\`typescript
${SANDBOX_VITE_CONFIG.trim()}
\`\`\``
}

export const CODING_DEV_SERVER_PORT = DEV_SERVER_PORT
