import { Outlet } from 'react-router-dom'

export const MainLayout = () => {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  )
}
