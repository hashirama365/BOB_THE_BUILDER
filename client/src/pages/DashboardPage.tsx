import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

// ─── Types ────────────────────────────────────────────────────────────────────

interface StatusCount {
  status: string
  count: number
}

interface HazmatSummary {
  hazmat: number
  non_hazmat: number
  total: number
}

interface UpcomingVoyage {
  id: number
  voyage_number: string
  vessel_name: string
  route: string
  origin_port: string
  destination_port: string
  etd: string
  eta: string
  capacity: number
  available_slots: number
  status: string
}

interface DashboardData {
  status_counts: StatusCount[]
  hazmat_summary: HazmatSummary
  upcoming_voyages: UpcomingVoyage[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

// All lifecycle statuses in order — cards are shown in this order
const ALL_STATUSES = [
  'Booking Confirmed',
  'Documentation Submitted',
  'Gated In (Origin)',
  'Loaded on Vessel',
  'Departed Origin Port',
  'At Sea',
  'Arrived Destination Port',
  'Customs Cleared',
  'Available for Pickup',
  'Delivered',
  'Cancelled',
]

// Per-status accent colours (left border + count text)
const STATUS_ACCENT: Record<string, string> = {
  'Booking Confirmed':        'border-gray-400 text-gray-700',
  'Documentation Submitted':  'border-blue-400 text-blue-700',
  'Gated In (Origin)':        'border-yellow-400 text-yellow-700',
  'Loaded on Vessel':         'border-orange-400 text-orange-700',
  'Departed Origin Port':     'border-indigo-400 text-indigo-700',
  'At Sea':                   'border-sky-400 text-sky-700',
  'Arrived Destination Port': 'border-teal-400 text-teal-700',
  'Customs Cleared':          'border-violet-400 text-violet-700',
  'Available for Pickup':     'border-lime-500 text-lime-700',
  'Delivered':                'border-green-500 text-green-700',
  'Cancelled':                'border-red-400 text-red-600',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

function routeLabel(route: string): string {
  if (route === 'JAX-SJU') return 'JAX → SJU'
  if (route === 'TAC-ANC') return 'TAC → ANC'
  return route
}

function slotsBadge(available: number, capacity: number) {
  const pct = capacity > 0 ? available / capacity : 1
  let cls = 'bg-green-50 text-green-700'
  if (pct < 0.1) cls = 'bg-red-50 text-red-700'
  else if (pct < 0.3) cls = 'bg-yellow-50 text-yellow-700'
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {available} / {capacity}
    </span>
  )
}

function voyageStatusBadge(status: string) {
  const cls =
    status === 'Departed'  ? 'bg-indigo-50 text-indigo-700' :
    status === 'Arrived'   ? 'bg-teal-50 text-teal-700' :
    /* Scheduled */           'bg-blue-50 text-blue-700'
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {status}
    </span>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="flex items-center justify-center h-40 text-gray-400 text-sm gap-2">
      <svg className="animate-spin h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
      Loading…
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const navigate = useNavigate()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/dashboard')
      .then(r => { if (!r.ok) throw new Error(`Server error: ${r.status}`); return r.json() })
      .then((d: DashboardData) => setData(d))
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load dashboard'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Spinner />
  if (error) {
    return (
      <div className="flex items-center justify-center h-40 text-red-600 text-sm">
        ⚠ {error}
      </div>
    )
  }
  if (!data) return null

  // Build a lookup map: status → count (default 0 for statuses not in the response)
  const countMap: Record<string, number> = {}
  for (const sc of data.status_counts) {
    countMap[sc.status] = Number(sc.count)
  }

  const { hazmat_summary: hz, upcoming_voyages } = data

  return (
    <div className="space-y-8">

      {/* ── Status Count Cards ──────────────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Bookings by Status
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {ALL_STATUSES.map(status => {
            const count = countMap[status] ?? 0
            const accent = STATUS_ACCENT[status] ?? 'border-gray-300 text-gray-700'
            // split into border colour and text colour
            const [borderCls, textCls] = accent.split(' ')
            const isEmpty = count === 0
            return (
              <button
                key={status}
                onClick={() => navigate(`/bookings?status=${encodeURIComponent(status)}`)}
                className={[
                  'group text-left bg-white border border-gray-200 border-l-4 rounded-lg px-4 py-3',
                  'hover:shadow-sm hover:border-gray-300 active:bg-gray-50 transition-all',
                  borderCls,
                  isEmpty ? 'opacity-50' : '',
                ].join(' ')}
              >
                <div className={`text-2xl font-bold leading-none ${textCls}`}>{count}</div>
                <div className="mt-1 text-xs text-gray-500 leading-snug">{status}</div>
              </button>
            )
          })}
        </div>
      </section>

      {/* ── Hazmat Summary ──────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Hazmat Summary
        </h2>
        <div className="grid grid-cols-3 gap-3 max-w-sm">
          <div className="bg-white border border-gray-200 border-l-4 border-l-red-400 rounded-lg px-4 py-3">
            <div className="text-2xl font-bold text-red-600">{hz.hazmat}</div>
            <div className="mt-1 text-xs text-gray-500">Hazmat</div>
          </div>
          <div className="bg-white border border-gray-200 border-l-4 border-l-gray-300 rounded-lg px-4 py-3">
            <div className="text-2xl font-bold text-gray-700">{hz.non_hazmat}</div>
            <div className="mt-1 text-xs text-gray-500">Non-Hazmat</div>
          </div>
          <div className="bg-white border border-gray-200 border-l-4 border-l-blue-400 rounded-lg px-4 py-3">
            <div className="text-2xl font-bold text-blue-700">{hz.total}</div>
            <div className="mt-1 text-xs text-gray-500">Total</div>
          </div>
        </div>
      </section>

      {/* ── Upcoming Voyages ────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Upcoming Voyages <span className="normal-case font-normal text-gray-400">(ETD within next 30 days)</span>
        </h2>
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          {upcoming_voyages.length === 0 ? (
            <div className="flex items-center justify-center h-24 text-sm text-gray-400">
              No voyages departing in the next 30 days
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {['Vessel', 'Route', 'Voyage #', 'ETD', 'ETA', 'Slots', 'Status'].map(h => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {upcoming_voyages.map(v => (
                    <tr key={v.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">{v.vessel_name}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{routeLabel(v.route)}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-700 whitespace-nowrap">{v.voyage_number}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatDate(v.etd)}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatDate(v.eta)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{slotsBadge(v.available_slots, v.capacity)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{voyageStatusBadge(v.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

    </div>
  )
}
