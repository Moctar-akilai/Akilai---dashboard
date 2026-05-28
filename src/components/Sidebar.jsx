const navItems = [
  { icon: '⊞', label: 'Dashboard', id: 'dashboard' },
  { icon: '💬', label: 'Conversations', id: 'conversations' },
  { icon: '🤖', label: 'Agents', id: 'agents' },
  { icon: '📊', label: 'Analytics', id: 'analytics' },
  { icon: '⚙️', label: 'Settings', id: 'settings' },
]

export default function Sidebar({ active, onNav }) {
  return (
    <aside className="w-64 min-h-screen bg-gray-950 text-white flex flex-col border-r border-gray-800">
      <div className="p-6 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-600 flex items-center justify-center text-lg font-bold">A</div>
          <div>
            <div className="font-semibold text-white text-sm">AkilAI</div>
            <div className="text-xs text-gray-400">Dashboard v1.0</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {navItems.map(item => (
          <button
            key={item.id}
            onClick={() => onNav(item.id)}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
              active === item.id
                ? 'bg-purple-600 text-white'
                : 'text-gray-400 hover:bg-gray-800 hover:text-white'
            }`}
          >
            <span>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      <div className="p-4 border-t border-gray-800">
        <div className="flex items-center gap-3 px-4 py-2.5">
          <div className="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center text-xs font-bold">M</div>
          <div className="text-sm">
            <div className="text-white font-medium">Moctar</div>
            <div className="text-gray-400 text-xs">Admin</div>
          </div>
        </div>
      </div>
    </aside>
  )
}
