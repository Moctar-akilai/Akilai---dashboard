import StatCard from '../components/StatCard'
import RecentActivity from '../components/RecentActivity'
import AgentStatus from '../components/AgentStatus'

const stats = [
  { title: 'Total Conversations', value: '12,483', change: 18, icon: '💬', color: 'bg-purple-100' },
  { title: 'Active Agents', value: '8', change: 12, icon: '🤖', color: 'bg-blue-100' },
  { title: 'Avg. Resolution Time', value: '1m 42s', change: -23, icon: '⚡', color: 'bg-yellow-100' },
  { title: 'Satisfaction Score', value: '4.8/5', change: 5, icon: '⭐', color: 'bg-green-100' },
]

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Welcome back, Moctar — here's what's happening today.</p>
        </div>
        <div className="flex gap-2">
          <button className="text-sm border border-gray-200 px-4 py-2 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors">Export</button>
          <button className="text-sm bg-purple-600 text-white px-4 py-2 rounded-xl hover:bg-purple-700 transition-colors font-medium">New Conversation</button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {stats.map(stat => <StatCard key={stat.title} {...stat} />)}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RecentActivity />
        <AgentStatus />
      </div>
    </div>
  )
}
