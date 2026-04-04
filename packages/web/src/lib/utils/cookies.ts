// Cookie utility functions using document.cookie (no js-cookie dependency)

function getCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
  return match ? decodeURIComponent(match[2]) : undefined
}

function setCookie(name: string, value: string, days = 365): void {
  if (typeof document === 'undefined') return
  const expires = new Date(Date.now() + days * 864e5).toUTCString()
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Strict`
}

function removeCookie(name: string): void {
  if (typeof document === 'undefined') return
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Strict`
}

const SIDEBAR_WIDTH_COOKIE = 'sidebar-width'
const SIDEBAR_OPEN_COOKIE = 'sidebar-open'
const INSTALL_DEPENDENCIES_COOKIE = 'install-dependencies'
const MAX_DURATION_COOKIE = 'max-duration'
const KEEP_ALIVE_COOKIE = 'keep-alive'
const SELECTED_OWNER_COOKIE = 'selected-owner'
const SELECTED_REPO_COOKIE = 'selected-repo'
const ENABLE_BROWSER_COOKIE = 'enable-browser'
const DEFAULT_SIDEBAR_WIDTH = 288
const DEFAULT_SIDEBAR_OPEN = false

export function getSidebarWidth(): number {
  const cookieValue = getCookie(SIDEBAR_WIDTH_COOKIE)
  if (cookieValue) {
    const width = parseInt(cookieValue, 10)
    if (!isNaN(width) && width >= 200 && width <= 600) {
      return width
    }
  }
  return DEFAULT_SIDEBAR_WIDTH
}

export function setSidebarWidth(width: number): void {
  if (width >= 200 && width <= 600) {
    setCookie(SIDEBAR_WIDTH_COOKIE, width.toString())
  }
}

export function getSidebarOpen(): boolean {
  const cookieValue = getCookie(SIDEBAR_OPEN_COOKIE)
  if (cookieValue) {
    return cookieValue === 'true'
  }
  return DEFAULT_SIDEBAR_OPEN
}

export function setSidebarOpen(isOpen: boolean): void {
  setCookie(SIDEBAR_OPEN_COOKIE, isOpen.toString())
}

export function setInstallDependencies(installDeps: boolean): void {
  setCookie(INSTALL_DEPENDENCIES_COOKIE, installDeps.toString())
}

export function setMaxDuration(duration: number): void {
  setCookie(MAX_DURATION_COOKIE, duration.toString())
}

export function setKeepAlive(keepAlive: boolean): void {
  setCookie(KEEP_ALIVE_COOKIE, keepAlive.toString())
}

export function setSelectedOwner(owner: string): void {
  if (owner) {
    setCookie(SELECTED_OWNER_COOKIE, owner)
  } else {
    removeCookie(SELECTED_OWNER_COOKIE)
  }
}

export function setSelectedRepo(repo: string): void {
  if (repo) {
    setCookie(SELECTED_REPO_COOKIE, repo)
  } else {
    removeCookie(SELECTED_REPO_COOKIE)
  }
}

export function setEnableBrowser(enable: boolean): void {
  setCookie(ENABLE_BROWSER_COOKIE, enable.toString())
}

// Logs pane
const LOGS_PANE_HEIGHT_COOKIE = 'logs-pane-height'
const LOGS_PANE_COLLAPSED_COOKIE = 'logs-pane-collapsed'
const DEFAULT_LOGS_PANE_HEIGHT = 200
const DEFAULT_LOGS_PANE_COLLAPSED = true

export function getLogsPaneHeight(): number {
  const cookieValue = getCookie(LOGS_PANE_HEIGHT_COOKIE)
  if (cookieValue) {
    const height = parseInt(cookieValue, 10)
    if (!isNaN(height) && height >= 100 && height <= 600) {
      return height
    }
  }
  return DEFAULT_LOGS_PANE_HEIGHT
}

export function setLogsPaneHeight(height: number): void {
  if (height >= 100 && height <= 600) {
    setCookie(LOGS_PANE_HEIGHT_COOKIE, height.toString())
  }
}

export function getLogsPaneCollapsed(): boolean {
  const cookieValue = getCookie(LOGS_PANE_COLLAPSED_COOKIE)
  if (cookieValue !== undefined) {
    return cookieValue === 'true'
  }
  return DEFAULT_LOGS_PANE_COLLAPSED
}

export function setLogsPaneCollapsed(isCollapsed: boolean): void {
  setCookie(LOGS_PANE_COLLAPSED_COOKIE, isCollapsed.toString())
}

// Pane visibility
const SHOW_FILES_PANE_COOKIE = 'show-files-pane'
const SHOW_CODE_PANE_COOKIE = 'show-code-pane'
const SHOW_PREVIEW_PANE_COOKIE = 'show-preview-pane'
const SHOW_CHAT_PANE_COOKIE = 'show-chat-pane'

export function getShowFilesPane(): boolean {
  const cookieValue = getCookie(SHOW_FILES_PANE_COOKIE)
  if (cookieValue !== undefined) return cookieValue === 'true'
  return true
}

export function setShowFilesPane(show: boolean): void {
  setCookie(SHOW_FILES_PANE_COOKIE, show.toString())
}

export function getShowCodePane(): boolean {
  const cookieValue = getCookie(SHOW_CODE_PANE_COOKIE)
  if (cookieValue !== undefined) return cookieValue === 'true'
  return true
}

export function setShowCodePane(show: boolean): void {
  setCookie(SHOW_CODE_PANE_COOKIE, show.toString())
}

export function getShowPreviewPane(): boolean {
  const cookieValue = getCookie(SHOW_PREVIEW_PANE_COOKIE)
  if (cookieValue !== undefined) return cookieValue === 'true'
  return false
}

export function setShowPreviewPane(show: boolean): void {
  setCookie(SHOW_PREVIEW_PANE_COOKIE, show.toString())
}

export function getShowChatPane(): boolean {
  const cookieValue = getCookie(SHOW_CHAT_PANE_COOKIE)
  if (cookieValue !== undefined) return cookieValue === 'true'
  return true
}

export function setShowChatPane(show: boolean): void {
  setCookie(SHOW_CHAT_PANE_COOKIE, show.toString())
}

// Pane widths
const FILES_PANE_WIDTH_COOKIE = 'files_pane_width'
const CHAT_PANE_WIDTH_COOKIE = 'chat_pane_width'

export function getFilesPaneWidth(): number {
  const cookieValue = getCookie(FILES_PANE_WIDTH_COOKIE)
  if (cookieValue) {
    const width = parseInt(cookieValue, 10)
    if (!isNaN(width) && width >= 150 && width <= 600) return width
  }
  return 250
}

export function setFilesPaneWidth(width: number): void {
  setCookie(FILES_PANE_WIDTH_COOKIE, width.toString())
}

export function getChatPaneWidth(): number {
  const cookieValue = getCookie(CHAT_PANE_WIDTH_COOKIE)
  if (cookieValue) {
    const width = parseInt(cookieValue, 10)
    if (!isNaN(width) && width >= 200 && width <= 600) return width
  }
  return 300
}

export function setChatPaneWidth(width: number): void {
  setCookie(CHAT_PANE_WIDTH_COOKIE, width.toString())
}
