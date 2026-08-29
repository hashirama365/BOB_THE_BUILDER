import { useEffect, useState, useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import StatusBadge from '../components/StatusBadge'
import StatusTimeline from '../components/StatusTimeline'

// ─── Types ────────────────────────────────────────────────────────────────────

interface StatusEntry {
  id: number
  booking_id: number
  status: string
  timestamp: string
  location_name: string | null
  latitude: number | null
  longitude: number | null
}

interface GpsPing {
  id: number
  booking_id: number
  container_number: string
  latitude: number
  longitude: number
  timestamp: string
  status_at_ping: string
}

interface BookingDetail {
  id: number
  booking_number: string
  route: string
  voyage_id: number
  voyage_number: string
  vessel_name: string
  container_type: string
  container_number: string
  cargo_description: string
  gross_weight: number
  weight_unit: string
  hazmat: number
  hazmat_un_number: string | null
  hazmat_imo_class: string | null
  hazmat_packing_group: string | null
  consignor_name: string
  consignor_address: string
  consignor_contact: string
  consignee_name: string
  consignee_address: string
  consignee_contact: string
  payor_name: string
  payor_address: string
  payor_contact: string
  current_status: string
  booking_date: string
  requested_gate_in_date: string
  special_instructions: string | null
  etd: string
  eta: string
  origin_port: string
  destination_port: string
  status_history: StatusEntry[]
  gps_pings: GpsPing[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const LIFECYCLE = [
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
]

const CUTOFF_STATUS_INDEX = LIFECYCLE.indexOf('Gated In (Origin)') // 2

const ROUTE_LABELS: Record<string, string> = {
  'JAX-SJU': 'Jacksonville → San Juan',
  'TAC-ANC': 'Tacoma → Anchorage',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(ts: string | undefined | null): string {
  if (!ts) return '—'
  try {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
    }).format(new Date(ts))
  } catch {
    return ts
  }
}

function fmtDateTime(ts: string | undefined | null): string {
  if (!ts) return '—'
  try {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
      timeZoneName: 'short',
    }).format(new Date(ts))
  } catch {
    return ts
  }
}

function isPastCutoff(booking: BookingDetail): { locked: boolean; reason: string } {
  const now = new Date()
  const etd = new Date(booking.etd)
  if (etd <= now) {
    return { locked: true, reason: `Voyage ETD (${fmt(booking.etd)}) has passed` }
  }
  const statusIdx = LIFECYCLE.indexOf(booking.current_status)
  if (statusIdx > CUTOFF_STATUS_INDEX) {
    return {
      locked: true,
      reason: `Status "${booking.current_status}" is past the edit/cancel cutoff`,
    }
  }
  return { locked: false, reason: '' }
}

function getNextStatus(currentStatus: string): string | null {
  const idx = LIFECYCLE.indexOf(currentStatus)
  if (idx === -1 || idx === LIFECYCLE.length - 1) return null
  return LIFECYCLE[idx + 1]
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</dt>
      <dd className="mt-0.5 text-sm text-gray-900">{value || '—'}</dd>
    </div>
  )
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-gray-200 rounded-lg p-5">
      <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4 pb-2 border-b border-gray-100">
        {title}
      </h2>
      {children}
    </section>
  )
}

function PartyBlock({
  role,
  name,
  address,
  contact,
}: {
  role: string
  name: string
  address: string
  contact: string
}) {
  return (
    <div className="flex-1 min-w-0">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{role}</p>
      <dl className="space-y-1.5">
        <Field label="Name" value={name} />
        <Field label="Address" value={address} />
        <Field label="Contact" value={contact} />
      </dl>
    </div>
  )
}

// ─── Cancel Modal ────────────────────────────────────────────────────────────

interface CancelModalProps {
  bookingNumber: string
  onConfirm: (reason: string) => void
  onClose: () => void
  loading: boolean
}

function CancelModal({ bookingNumber, onConfirm, onClose, loading }: CancelModalProps) {
  const [reason, setReason] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onConfirm(reason)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-1">Cancel Booking</h3>
        <p className="text-sm text-gray-500 mb-4">
          Are you sure you want to cancel <strong>{bookingNumber}</strong>? This cannot be undone.
        </p>

        <form onSubmit={handleSubmit}>
          <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="cancel-reason">
            Reason <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <textarea
            id="cancel-reason"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400 resize-none"
            rows={3}
            placeholder="Enter cancellation reason…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={loading}
          />

          <div className="flex justify-end gap-2 mt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-1.5 rounded text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 disabled:opacity-50"
            >
              Keep Booking
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-1.5 rounded text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-60"
            >
              {loading ? 'Cancelling…' : 'Confirm Cancel'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BookingDetailPage() {
  const { id } = useParams<{ id: string }>()

  const [booking, setBooking] = useState<BookingDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Action states
  const [advancing, setAdvancing] = useState(false)
  const [advanceError, setAdvanceError] = useState<string | null>(null)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  const fetchBooking = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/bookings/${id}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? `HTTP ${res.status}`)
        return
      }
      const data: BookingDetail = await res.json()
      setBooking(data)
    } catch (err) {
      setError('Network error — could not load booking.')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchBooking()
  }, [fetchBooking])

  // ─── Actions ──────────────────────────────────────────────────────────────

  async function handleAdvanceStatus() {
    if (!booking) return
    setAdvancing(true)
    setAdvanceError(null)
    setActionSuccess(null)
    try {
      const res = await fetch(`/api/bookings/${id}/advance-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const body = await res.json()
      if (!res.ok) {
        setAdvanceError(body.error ?? `HTTP ${res.status}`)
        return
      }
      setActionSuccess(`Status advanced to "${body.new_status}"`)
      await fetchBooking()
    } catch {
      setAdvanceError('Network error — could not advance status.')
    } finally {
      setAdvancing(false)
    }
  }

  async function handleCancel(reason: string) {
    if (!booking) return
    setCancelling(true)
    setCancelError(null)
    setActionSuccess(null)
    try {
      const res = await fetch(`/api/bookings/${id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      const body = await res.json()
      if (!res.ok) {
        setCancelError(body.error ?? `HTTP ${res.status}`)
        setShowCancelModal(false)
        return
      }
      setShowCancelModal(false)
      setActionSuccess('Booking has been cancelled.')
      await fetchBooking()
    } catch {
      setCancelError('Network error — could not cancel booking.')
      setShowCancelModal(false)
    } finally {
      setCancelling(false)
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="p-6 text-sm text-gray-500">Loading booking…</div>
    )
  }

  if (error || !booking) {
    return (
      <div className="p-6">
        <p className="text-sm text-red-600 mb-3">{error ?? 'Booking not found.'}</p>
        <Link to="/bookings" className="text-sm text-blue-600 hover:underline">
          ← Back to Bookings
        </Link>
      </div>
    )
  }

  const cutoff = isPastCutoff(booking)
  const isCancelled = booking.current_status === 'Cancelled'
  const nextStatus = getNextStatus(booking.current_status)
  const canAdvance = !isCancelled && nextStatus !== null
  const canCancel = !isCancelled && !cutoff.locked

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">

      {/* ── Top bar: back link + action buttons ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <Link
          to="/bookings"
          className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
        >
          ← Back to Bookings
        </Link>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Edit Booking */}
          {cutoff.locked ? (
            <div className="relative group">
              <span
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-sm font-medium
                           text-gray-400 bg-gray-100 border border-gray-200 cursor-not-allowed select-none"
              >
                🔒 Edit Booking
              </span>
              <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 z-20
                              w-56 rounded bg-gray-800 text-white text-xs px-2.5 py-1.5
                              opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none text-center shadow-lg">
                {cutoff.reason}
              </div>
            </div>
          ) : (
            <Link
              to={`/bookings/${id}/edit`}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-sm font-medium
                         text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 transition-colors"
            >
              ✏️ Edit Booking
            </Link>
          )}

          {/* Advance Status */}
          {canAdvance && (
            <button
              onClick={handleAdvanceStatus}
              disabled={advancing}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-sm font-medium
                         text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 transition-colors"
            >
              {advancing ? 'Advancing…' : `Advance → ${nextStatus}`}
            </button>
          )}

          {/* Cancel Booking */}
          {canCancel && (
            <button
              onClick={() => { setCancelError(null); setShowCancelModal(true) }}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-sm font-medium
                         text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 transition-colors"
            >
              🚫 Cancel Booking
            </button>
          )}
        </div>
      </div>

      {/* ── Feedback banners ── */}
      {actionSuccess && (
        <div className="rounded bg-green-50 border border-green-200 text-green-800 text-sm px-4 py-2.5 flex items-center justify-between">
          <span>✅ {actionSuccess}</span>
          <button onClick={() => setActionSuccess(null)} className="text-green-600 hover:text-green-800 text-lg leading-none">×</button>
        </div>
      )}
      {advanceError && (
        <div className="rounded bg-red-50 border border-red-200 text-red-800 text-sm px-4 py-2.5 flex items-center justify-between">
          <span>⚠️ {advanceError}</span>
          <button onClick={() => setAdvanceError(null)} className="text-red-600 hover:text-red-800 text-lg leading-none">×</button>
        </div>
      )}
      {cancelError && (
        <div className="rounded bg-red-50 border border-red-200 text-red-800 text-sm px-4 py-2.5 flex items-center justify-between">
          <span>⚠️ {cancelError}</span>
          <button onClick={() => setCancelError(null)} className="text-red-600 hover:text-red-800 text-lg leading-none">×</button>
        </div>
      )}

      {/* ── Header card: booking # + status + route ── */}
      <SectionCard title="">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Booking Number</p>
            <p className="text-xl font-bold text-gray-900 tracking-tight">{booking.booking_number}</p>
            <div className="flex items-center gap-2 mt-1">
              <StatusBadge status={booking.current_status} />
              {isCancelled && (
                <span className="text-xs text-red-500 font-medium">This booking is cancelled</span>
              )}
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-x-8 gap-y-3 sm:text-right">
            <Field label="Route" value={ROUTE_LABELS[booking.route] ?? booking.route} />
            <Field label="Container Type" value={booking.container_type} />
            <Field label="Container #" value={booking.container_number} />
            <Field label="Vessel" value={booking.vessel_name} />
            <Field label="Voyage #" value={booking.voyage_number} />
            <Field label="ETD" value={fmt(booking.etd)} />
            <Field label="ETA" value={fmt(booking.eta)} />
            <Field label="Booking Date" value={fmtDateTime(booking.booking_date)} />
          </dl>
        </div>
      </SectionCard>

      {/* ── Two-column layout: left = details, right = timeline ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* ── Left: 2/3 width ── */}
        <div className="lg:col-span-2 space-y-5">

          {/* Voyage / schedule */}
          <SectionCard title="Voyage & Schedule">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
              <Field label="Origin Port" value={booking.origin_port} />
              <Field label="Destination Port" value={booking.destination_port} />
              <Field label="Requested Gate-In Date" value={fmt(booking.requested_gate_in_date)} />
              <Field label="Estimated Departure" value={fmtDateTime(booking.etd)} />
              <Field label="Estimated Arrival" value={fmtDateTime(booking.eta)} />
            </dl>
          </SectionCard>

          {/* Cargo */}
          <SectionCard title="Cargo">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
              <div className="sm:col-span-2">
                <Field label="Cargo Description" value={booking.cargo_description} />
              </div>
              <Field
                label="Gross Weight"
                value={`${booking.gross_weight.toLocaleString()} ${booking.weight_unit}`}
              />
              <Field
                label="Hazardous Material"
                value={
                  booking.hazmat
                    ? <span className="inline-flex items-center gap-1 text-orange-700 font-medium">⚠️ Yes</span>
                    : <span className="text-gray-500">No</span>
                }
              />
              {!!booking.hazmat && (
                <>
                  <Field label="UN Number" value={booking.hazmat_un_number} />
                  <Field label="IMO Class" value={booking.hazmat_imo_class} />
                  <Field label="Packing Group" value={booking.hazmat_packing_group} />
                </>
              )}
              {booking.special_instructions && (
                <div className="sm:col-span-2">
                  <Field label="Special Instructions" value={booking.special_instructions} />
                </div>
              )}
            </dl>
          </SectionCard>

          {/* Parties: three-column */}
          <SectionCard title="Parties">
            <div className="flex flex-col sm:flex-row gap-6 divide-y sm:divide-y-0 sm:divide-x divide-gray-100">
              <PartyBlock
                role="Consignor"
                name={booking.consignor_name}
                address={booking.consignor_address}
                contact={booking.consignor_contact}
              />
              <div className="pt-4 sm:pt-0 sm:pl-6 flex-1 min-w-0">
                <PartyBlock
                  role="Consignee"
                  name={booking.consignee_name}
                  address={booking.consignee_address}
                  contact={booking.consignee_contact}
                />
              </div>
              <div className="pt-4 sm:pt-0 sm:pl-6 flex-1 min-w-0">
                <PartyBlock
                  role="Payor"
                  name={booking.payor_name}
                  address={booking.payor_address}
                  contact={booking.payor_contact}
                />
              </div>
            </div>
          </SectionCard>
        </div>

        {/* ── Right: 1/3 width — timeline ── */}
        <div className="lg:col-span-1">
          <SectionCard title="Status Timeline">
            <StatusTimeline
              entries={booking.status_history}
              currentStatus={booking.current_status}
            />
          </SectionCard>
        </div>
      </div>

      {/* ── Cancel Modal ── */}
      {showCancelModal && (
        <CancelModal
          bookingNumber={booking.booking_number}
          onConfirm={handleCancel}
          onClose={() => setShowCancelModal(false)}
          loading={cancelling}
        />
      )}
    </div>
  )
}
