import { useLocation } from 'react-router-dom'

const routeTitles: { pattern: RegExp; title: string; crumbs: string[] }[] = [
  { pattern: /^\/$/, title: 'Dashboard', crumbs: ['Dashboard'] },
  { pattern: /^\/bookings\/new$/, title: 'New Booking', crumbs: ['Bookings', 'New Booking'] },
  {
    pattern: /^\/bookings\/[^/]+\/edit$/,
    title: 'Edit Booking',
    crumbs: ['Bookings', 'Booking Detail', 'Edit'],
  },
  {
    pattern: /^\/bookings\/[^/]+$/,
    title: 'Booking Detail',
    crumbs: ['Bookings', 'Booking Detail'],
  },
  { pattern: /^\/bookings$/, title: 'Bookings', crumbs: ['Bookings'] },
  { pattern: /^\/map$/, title: 'Map View', crumbs: ['Map View'] },
]

function resolve(pathname: string) {
  for (const entry of routeTitles) {
    if (entry.pattern.test(pathname)) return entry
  }
  return { title: pathname, crumbs: [pathname] }
}

export default function PageHeader() {
  const { pathname } = useLocation()
  const { title, crumbs } = resolve(pathname)

  return (
    <div className="px-6 py-4 border-b border-gray-200 bg-white">
      <nav className="text-xs text-gray-400 mb-1">
        {crumbs.map((crumb, i) => (
          <span key={i}>
            {i > 0 && <span className="mx-1">/</span>}
            <span className={i === crumbs.length - 1 ? 'text-gray-600' : ''}>{crumb}</span>
          </span>
        ))}
      </nav>
      <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
    </div>
  )
}
