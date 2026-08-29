import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import StatusBadge from '../components/StatusBadge'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Booking {
  id: number
  booking_number: string
  route: string
  container_number: string
  container_type: string
  voyage_number: string
  vessel_name: string
  current_status: string
  booking_date: string
  hazmat: number
}

interface Filters {
  route: string
  status: string
  hazmat: string
  container_type: string
  date_from: string
  date_to: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ROUTES = [
  { value: '', label: 'All Routes' },
  { value: 'JAX-SJU', label: 'Jacksonville → San Juan' },
  { value: 'TAC-ANC', label: 'Tacoma → Anchorage' },
]

const STATUSES = [
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

const CONTAINER_TYPES = [
  { value: '', label: 'All Types' },
  { value: '20GP', label: '20GP — 20ft Standard' },
  { value: '40GP', label: '40GP — 40ft Standard' },
  { value: '40HC', label: '40HC — 40ft High Cube' },
  { value: '45HC', label: '45HC — 45ft High Cube' },
  { value: '20RF', label: '20RF — 20ft Reefer' },
  { value: '40RF', label: '40RF — 40ft Reefer' },
]

const EMPTY_FILTERS: Filters = {
  route: '',
  status: '',
  hazmat: '',
  container_type: '',
  date_from: '',
  date_to: '',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildQueryString(filters: Filters): string {
  const params = new URLSearchParams()
  if (filters.route)          params.set('route', filters.route)
  if (filters.status)         params.set('status', filters.status)
  if (filters.hazmat !== '')  params.set('hazmat', filters.hazmat)
  if (filters.container_type) params.set('container_type', filters.container_type)
  if (filters.date_from)      params.set('date_from', filters.date_from)
  if (filters.date_to)        params.set('date_to', filters.date_to)
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

function formatDate(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function routeLabel(route: string): string {
  if (route === 'JAX-SJU') return 'JAX → SJU'
  if (route === 'TAC-ANC') return 'TAC → ANC'
  return route
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function BookingsListPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<Filters>({
    ...EMPTY_FILTERS,
    route:          searchParams.get('route')          ?? '',
    status:         searchParams.get('status')         ?? '',
    hazmat:         searchParams.get('hazmat')         ?? '',
    container_type: searchParams.get('container_type') ?? '',
    date_from:      searchParams.get('date_from')      ?? '',
    date_to:        searchParams.get('date_to')        ?? '',
  })

  const fetchBookings = useCallback(async (f: Filters) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/bookings${buildQueryString(f)}`)
      if (!res.ok) throw new Error(`Server error: ${res.status}`)
      const data = await res.json()
      setBookings(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load bookings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchBookings(filters)
  }, [filters, fetchBookings])

  function handleFilterChange(key: keyof Filters, value: string) {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  function handleClearFilters() {
    setFilters(EMPTY_FILTERS)
  }

  const hasActiveFilters = Object.values(filters).some(v => v !== '')

  return (
    <div className="space-y-4">
      {/* Page action bar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {loading ? 'Loading…' : `${bookings.length} booking${bookings.length !== 1 ? 's' : ''} found`}
        </p>
        <button
          onClick={() => navigate('/bookings/new')}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 active:bg-blue-800 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New Booking
        </button>
      </div>

      {/* Filter bar */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Route */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Route</label>
            <select
              value={filters.route}
              onChange={e => handleFilterChange('route', e.target.value)}
              className="text-sm border border-gray-300 rounded px-2 py-1.5 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {ROUTES.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Status</label>
            <select
              value={filters.status}
              onChange={e => handleFilterChange('status', e.target.value)}
              className="text-sm border border-gray-300 rounded px-2 py-1.5 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Statuses</option>
              {STATUSES.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Container Type */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Container Type</label>
            <select
              value={filters.container_type}
              onChange={e => handleFilterChange('container_type', e.target.value)}
              className="text-sm border border-gray-300 rounded px-2 py-1.5 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {CONTAINER_TYPES.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          {/* Hazmat */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Hazmat</label>
            <select
              value={filters.hazmat}
              onChange={e => handleFilterChange('hazmat', e.target.value)}
              className="text-sm border border-gray-300 rounded px-2 py-1.5 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </div>

          {/* Date From */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Booked From</label>
            <input
              type="date"
              value={filters.date_from}
              onChange={e => handleFilterChange('date_from', e.target.value)}
              className="text-sm border border-gray-300 rounded px-2 py-1.5 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Date To */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Booked To</label>
            <input
              type="date"
              value={filters.date_to}
              onChange={e => handleFilterChange('date_to', e.target.value)}
              className="text-sm border border-gray-300 rounded px-2 py-1.5 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {hasActiveFilters && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <button
              onClick={handleClearFilters}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              ✕ Clear all filters
            </button>
          </div>
        )}
      </div>

      {/* Table area */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {error ? (
          <div className="flex items-center justify-center h-40 text-red-600 text-sm">
            <span>⚠ {error}</span>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
            <svg className="animate-spin mr-2 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Loading bookings…
          </div>
        ) : bookings.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-gray-400">
            <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 17v-2a4 4 0 014-4h0a4 4 0 014 4v2M3 21h18M12 3a4 4 0 100 8 4 4 0 000-8z" />
            </svg>
            <p className="text-sm font-medium text-gray-400">No bookings match your filters</p>
            {hasActiveFilters && (
              <button
                onClick={handleClearFilters}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                Clear filters to see all bookings
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                    Booking #
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Route
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                    Container #
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Voyage
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                    Booking Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Hazmat
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {bookings.map(b => (
                  <tr
                    key={b.id}
                    onClick={() => navigate(`/bookings/${b.id}`)}
                    className="hover:bg-blue-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-blue-700 font-medium whitespace-nowrap">
                      {b.booking_number}
                    </td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                      {routeLabel(b.route)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600 whitespace-nowrap">
                      {b.container_number}
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {b.container_type}
                    </td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                      <span className="font-medium">{b.voyage_number}</span>
                      <span className="text-gray-400 text-xs ml-1">({b.vessel_name})</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <StatusBadge status={b.current_status} />
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {formatDate(b.booking_date)}
                    </td>
                    <td className="px-4 py-3">
                      {b.hazmat ? (
                        <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-700">
                          Hazmat
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
