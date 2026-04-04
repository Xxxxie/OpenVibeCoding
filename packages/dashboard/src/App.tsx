import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { Toaster } from 'sonner'
import ProvisionGate from './components/ProvisionGate'
import { NavigationIconRail } from './components/navigation/NavigationIconRail'
import { ProductMenu } from './components/navigation/ProductMenu'
import { MainLayout } from './components/layouts/MainLayout'
import HomePage from './pages/HomePage'
import DatabasePage from './pages/DatabasePage'
import StoragePage from './pages/StoragePage'
import SqlPage from './pages/SqlPage'
import FunctionsPage from './pages/FunctionsPage'

// 不需要 ProductMenu 侧栏的路由
const NO_SIDEBAR_ROUTES = ['/', '/sql', '/functions']

// 嵌入模式：隐藏导航栏和侧栏，用于 iframe 嵌入
const isEmbedded = new URLSearchParams(window.location.search).get('embedded') === '1'

function AppShell() {
  const location = useLocation()
  const showSidebar = !isEmbedded && !NO_SIDEBAR_ROUTES.includes(location.pathname)

  if (isEmbedded) {
    // 嵌入模式：无导航栏，无侧栏，全屏内容
    return (
      <div className="flex h-screen w-full bg-bg-default overflow-hidden">
        <Routes>
          <Route element={<MainLayout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/database" element={<DatabasePage />} />
            <Route path="/storage" element={<StoragePage />} />
            <Route path="/sql" element={<SqlPage />} />
            <Route path="/functions" element={<FunctionsPage />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Route>
        </Routes>
      </div>
    )
  }

  return (
    <div className="flex h-screen w-full bg-bg-default overflow-hidden">
      <NavigationIconRail />

      {showSidebar ? (
        <PanelGroup direction="horizontal" autoSaveId="dashboard-sidebar-layout">
          <Panel defaultSize={20} minSize={15} maxSize={30}>
            <ProductMenu />
          </Panel>
          <PanelResizeHandle className="w-px bg-border-muted hover:bg-brand transition-colors duration-150 cursor-col-resize" />
          <Panel>
            <Routes>
              <Route element={<MainLayout />}>
                <Route path="/database" element={<DatabasePage />} />
                <Route path="/storage" element={<StoragePage />} />
                <Route path="*" element={<Navigate to="/" />} />
              </Route>
            </Routes>
          </Panel>
        </PanelGroup>
      ) : (
        <div className="flex-1 overflow-hidden">
          <Routes>
            <Route element={<MainLayout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/sql" element={<SqlPage />} />
              <Route path="/functions" element={<FunctionsPage />} />
              <Route path="*" element={<Navigate to="/" />} />
            </Route>
          </Routes>
        </div>
      )}
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Toaster theme="system" position="bottom-right" richColors />
      <ProvisionGate>
        <AppShell />
      </ProvisionGate>
    </BrowserRouter>
  )
}
