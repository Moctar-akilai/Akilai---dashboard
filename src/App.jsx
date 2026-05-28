import { useState } from 'react'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'

const placeholderPages = {
  conversations: { title: 'Conversations', icon: '💬' },
  agents: { title: 'Agents', icon: '🤖' },
  analytics: { title: 'Analytics', icon: '📊' },
  settings: { title: 'Settings', icon: '⚙️' },
}

export default function App() {
  const [activePage, setActivePage] = useState('dashboard')

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar active={activePage} onNav={setActivePage} />
      <main className="flex-1 p-8 overflow-auto">
        {activePage === 'dashboard' ? (
          <Dashboard />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center pt-24">
            <div className="text-6xl mb-4">{placeholderPages[activePage]?.icon}</div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">{placeholderPages[activePage]?.title}</h1>
            <p className="text-gray-500">This section is coming soon.</p>
          </div>
        )}
      </main>
    </div>
  )
}
