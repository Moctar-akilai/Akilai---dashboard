const agents = [
  { name: 'Support Agent', status: 'active', conversations: 142, success: 96 },
  { name: 'Sales Agent', status: 'active', conversations: 87, success: 91 },
  { name: 'Onboarding Agent', status: 'idle', conversations: 34, success: 88 },
  { name: 'Analytics Agent', status: 'training', conversations: 0, success: 0 },
]

const statusStyle = {
  active: 'bg-green-100 text-green-700',
  idle: 'bg-yellow-100 text-yellow-700',
  training: 'bg-blue-100 text-blue-700',
}

export default function AgentStatus() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <h2 className="font-semibold text-gray-900">AI Agents</h2>
        <button className="text-sm bg-purple-600 text-white px-3 py-1.5 rounded-lg hover:bg-purple-700 transition-colors font-medium">
          + New Agent
        </button>
      </div>
      <div className="p-4 space-y-3">
        {agents.map(agent => (
          <div key={agent.name} className="flex items-center gap-4 p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors">
            <div className="w-10 h-10 rounded-xl bg-purple-600 flex items-center justify-center text-white text-lg shrink-0">🤖</div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-900">{agent.name}</div>
              <div className="text-xs text-gray-500">{agent.conversations} conversations</div>
            </div>
            <div className="text-right shrink-0">
              <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusStyle[agent.status]}`}>
                {agent.status}
              </span>
              {agent.success > 0 && (
                <div className="text-xs text-gray-500 mt-1">{agent.success}% success</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
