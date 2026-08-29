import { NavLink } from 'react-router-dom'

const navItems = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/bookings', label: 'Bookings' },
  { to: '/map', label: 'Map View' },
]

export default function Sidebar() {
  return (
    <aside className="w-56 shrink-0 bg-gray-900 text-gray-100 flex flex-col">
      <div className="px-5 py-4 border-b border-gray-700">
        <span className="text-sm font-semibold tracking-wide uppercase text-gray-400">
          Container Mgmt
        </span>
      </div>
      <nav className="flex-1 py-4">
        <ul className="space-y-1 px-2">
          {navItems.map(({ to, label, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  [
                    'block px-3 py-2 rounded text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-300 hover:bg-gray-700 hover:text-white',
                  ].join(' ')
                }
              >
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  )
}
