const activities = [
  { id: 1, type: 'conversation', user: 'Sarah K.', action: 'Started a new conversation', time: '2 min ago', avatar: 'S' },
  { id: 2, type: 'agent', user: 'Support Agent', action: 'Resolved 12 tickets automatically', time: '15 min ago', avatar: '🤖' },
  { id: 3, type: 'alert', user: 'System', action: 'Model accuracy reached 98.4%', time: '1 hour ago', avatar: '📈' },
  { id: 4, type: 'conversation', user: 'Alex M.', action: 'Escalated conversation to human', time: '2 hours ago', avatar: 'A' },
  { id: 5, type: 'agent', user: 'Sales Agent', action: 'Qualified 3 new leads', time: '3 hours ago', avatar: '🤖' },
]

export default function RecentActivity() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <h2 className="font-semibold text-gray-900">Recent Activity</h2>
        <button className="text-sm text-purple-600 hover:text-purple-700 font-medium">View all</button>
      </div>
      <div className="divide-y divide-gray-50">
        {activities.map(item => (
          <div key={item.id} className="px-6 py-4 flex items-center gap-4 hover:bg-gray-50 transition-colors">
            <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-sm font-semibold text-purple-600 shrink-0">
              {item.avatar}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-900">{item.user}</div>
              <div className="text-xs text-gray-500 truncate">{item.action}</div>
            </div>
            <div className="text-xs text-gray-400 shrink-0">{item.time}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
