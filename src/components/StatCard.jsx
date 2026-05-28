export default function StatCard({ title, value, change, icon, color }) {
  const isPositive = change >= 0
  return (
    <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
      <div className="flex items-start justify-between mb-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl ${color}`}>
          {icon}
        </div>
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${isPositive ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>
          {isPositive ? '+' : ''}{change}%
        </span>
      </div>
      <div className="text-2xl font-bold text-gray-900 mb-1">{value}</div>
      <div className="text-sm text-gray-500">{title}</div>
    </div>
  )
}
