import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'

// ── Types ──────────────────────────────────────────────────────────────────

interface Voyage {
  id: number
  voyage_number: string
  vessel_name: string
  route: string
  etd: string
  eta: string
  available_slots: number
}

interface BookingData {
  id: number
  booking_number: string
  container_number: string
  route: string
  voyage_id: number
  container_type: string
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
  requested_gate_in_date: string
  special_instructions: string | null
  current_status: string
  etd: string // from voyage JOIN
}

// ── Constants ──────────────────────────────────────────────────────────────

const ROUTES = [
  { value: 'JAX-SJU', label: 'Jacksonville, FL → San Juan, PR' },
  { value: 'TAC-ANC', label: 'Tacoma, WA → Anchorage, AK' },
]

const CONTAINER_TYPES = ['20GP', '40GP', '40HC', '40RF', '45HC', '20RF']

const PACKING_GROUPS = ['I', 'II', 'III']

// Statuses past the edit cutoff (mirroring server logic)
const CUTOFF_STATUS_INDEX_MAP: Record<string, number> = {
  'Booking Confirmed': 0,
  'Documentation Submitted': 1,
  'Gated In (Origin)': 2,
  'Loaded on Vessel': 3,
  'Departed Origin Port': 4,
  'At Sea': 5,
  'Arrived Destination Port': 6,
  'Customs Cleared': 7,
  'Available for Pickup': 8,
  'Delivered': 9,
}

function isStatusPastCutoff(status: string): boolean {
  const idx = CUTOFF_STATUS_INDEX_MAP[status]
  return idx !== undefined && idx > 2
}

// ── Empty form state factory ───────────────────────────────────────────────

function emptyForm() {
  return {
    route: '',
    voyage_id: '',
    container_type: '',
    cargo_description: '',
    gross_weight: '',
    weight_unit: 'LB',
    hazmat: 'no' as 'yes' | 'no',
    hazmat_un_number: '',
    hazmat_imo_class: '',
    hazmat_packing_group: '',
    consignor_name: '',
    consignor_address: '',
    consignor_contact: '',
    consignee_name: '',
    consignee_address: '',
    consignee_contact: '',
    payor_name: '',
    payor_address: '',
    payor_contact: '',
    requested_gate_in_date: '',
    special_instructions: '',
  }
}

type FormState = ReturnType<typeof emptyForm>
type FormErrors = Partial<Record<keyof FormState, string>>

// ── Component ──────────────────────────────────────────────────────────────

export default function BookingFormPage() {
  const { id } = useParams<{ id: string }>()
  const isEdit = Boolean(id)
  const navigate = useNavigate()

  const [form, setForm] = useState<FormState>(emptyForm())
  const [errors, setErrors] = useState<FormErrors>({})
  const [voyages, setVoyages] = useState<Voyage[]>([])
  const [existingBooking, setExistingBooking] = useState<BookingData | null>(null)
  const [lockMessage, setLockMessage] = useState<string | null>(null)
  const [apiError, setApiError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(isEdit)
  const [sameAsConsignor, setSameAsConsignor] = useState(false)

  // ── Load voyages whenever route changes ─────────────────────────────────

  const fetchVoyages = useCallback(async (route: string) => {
    if (!route) { setVoyages([]); return }
    try {
      const res = await fetch(`/api/voyages?route=${encodeURIComponent(route)}`)
      const data: Voyage[] = await res.json()
      setVoyages(data)
    } catch {
      setVoyages([])
    }
  }, [])

  useEffect(() => {
    fetchVoyages(form.route)
  }, [form.route, fetchVoyages])

  // ── Load existing booking in edit mode ──────────────────────────────────

  useEffect(() => {
    if (!isEdit) return
    setLoading(true)
    fetch(`/api/bookings/${id}`)
      .then(r => r.json())
      .then((data: BookingData) => {
        setExistingBooking(data)

        // Determine lock state
        const statusLocked = isStatusPastCutoff(data.current_status)
        const etdPassed = new Date(data.etd) <= new Date()

        if (statusLocked) {
          setLockMessage(
            `This booking is locked — container has already been ${data.current_status.toLowerCase()} (status: "${data.current_status}").`
          )
        } else if (etdPassed) {
          setLockMessage(
            `This booking is locked — the voyage has already departed (ETD: ${new Date(data.etd).toLocaleDateString()}).`
          )
        }

        // Pre-populate form
        setForm({
          route: data.route,
          voyage_id: String(data.voyage_id),
          container_type: data.container_type,
          cargo_description: data.cargo_description,
          gross_weight: String(data.gross_weight),
          weight_unit: data.weight_unit,
          hazmat: data.hazmat ? 'yes' : 'no',
          hazmat_un_number: data.hazmat_un_number ?? '',
          hazmat_imo_class: data.hazmat_imo_class ?? '',
          hazmat_packing_group: data.hazmat_packing_group ?? '',
          consignor_name: data.consignor_name,
          consignor_address: data.consignor_address,
          consignor_contact: data.consignor_contact,
          consignee_name: data.consignee_name,
          consignee_address: data.consignee_address,
          consignee_contact: data.consignee_contact,
          payor_name: data.payor_name,
          payor_address: data.payor_address,
          payor_contact: data.payor_contact,
          requested_gate_in_date: data.requested_gate_in_date
            ? data.requested_gate_in_date.slice(0, 10)
            : '',
          special_instructions: data.special_instructions ?? '',
        })
      })
      .catch(() => setApiError('Failed to load booking.'))
      .finally(() => setLoading(false))
  }, [id, isEdit])

  // ── Field helpers ────────────────────────────────────────────────────────

  function set(field: keyof FormState, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
    setErrors(prev => ({ ...prev, [field]: undefined }))
  }

  function handleSameAsConsignor(checked: boolean) {
    setSameAsConsignor(checked)
    if (checked) {
      setForm(prev => ({
        ...prev,
        payor_name: prev.consignor_name,
        payor_address: prev.consignor_address,
        payor_contact: prev.consignor_contact,
      }))
    }
  }

  // Keep payor in sync while checkbox is active
  function setConsignorField(field: 'consignor_name' | 'consignor_address' | 'consignor_contact', value: string) {
    setForm(prev => {
      const updated = { ...prev, [field]: value }
      if (sameAsConsignor) {
        const payorField = field.replace('consignor_', 'payor_') as keyof FormState
        updated[payorField] = value as any
      }
      return updated
    })
    setErrors(prev => ({ ...prev, [field]: undefined }))
  }

  // ── Validation ───────────────────────────────────────────────────────────

  function validate(): FormErrors {
    const e: FormErrors = {}
    const req = (f: keyof FormState, label: string) => {
      if (!form[f] || String(form[f]).trim() === '') e[f] = `${label} is required`
    }
    req('route', 'Route')
    req('voyage_id', 'Voyage')
    req('container_type', 'Container Type')
    req('cargo_description', 'Cargo Description')
    req('gross_weight', 'Gross Weight')
    req('consignor_name', 'Consignor Name')
    req('consignor_address', 'Consignor Address')
    req('consignor_contact', 'Consignor Contact')
    req('consignee_name', 'Consignee Name')
    req('consignee_address', 'Consignee Address')
    req('consignee_contact', 'Consignee Contact')
    req('payor_name', 'Payor Name')
    req('payor_address', 'Payor Address')
    req('payor_contact', 'Payor Contact')
    req('requested_gate_in_date', 'Requested Gate-In Date')

    const weight = parseFloat(form.gross_weight)
    if (!isNaN(weight) && weight <= 0) {
      e.gross_weight = 'Gross Weight must be a positive number'
    }

    if (form.hazmat === 'yes') {
      if (!form.hazmat_un_number.trim()) e.hazmat_un_number = 'UN Number is required for hazmat cargo'
      if (!form.hazmat_imo_class.trim()) e.hazmat_imo_class = 'IMO/Hazard Class is required for hazmat cargo'
      if (!form.hazmat_packing_group.trim()) e.hazmat_packing_group = 'Packing Group is required for hazmat cargo'
    }

    return e
  }

  // ── Submit ───────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setApiError(null)

    const errs = validate()
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      // Scroll to first error
      const firstErrEl = document.querySelector('[data-error]')
      firstErrEl?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }

    setSubmitting(true)

    const payload = {
      route: form.route,
      voyage_id: Number(form.voyage_id),
      container_type: form.container_type,
      cargo_description: form.cargo_description,
      gross_weight: parseFloat(form.gross_weight),
      weight_unit: form.weight_unit,
      hazmat: form.hazmat === 'yes',
      hazmat_un_number: form.hazmat === 'yes' ? form.hazmat_un_number : null,
      hazmat_imo_class: form.hazmat === 'yes' ? form.hazmat_imo_class : null,
      hazmat_packing_group: form.hazmat === 'yes' ? form.hazmat_packing_group : null,
      consignor_name: form.consignor_name,
      consignor_address: form.consignor_address,
      consignor_contact: form.consignor_contact,
      consignee_name: form.consignee_name,
      consignee_address: form.consignee_address,
      consignee_contact: form.consignee_contact,
      payor_name: form.payor_name,
      payor_address: form.payor_address,
      payor_contact: form.payor_contact,
      requested_gate_in_date: form.requested_gate_in_date,
      special_instructions: form.special_instructions || null,
    }

    try {
      const url = isEdit ? `/api/bookings/${id}` : '/api/bookings'
      const method = isEdit ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()

      if (res.status === 403) {
        setLockMessage(`This booking is locked and cannot be edited. ${data.reason ?? ''}`)
        setSubmitting(false)
        return
      }
      if (!res.ok) {
        setApiError(data.error ?? 'An unexpected error occurred.')
        setSubmitting(false)
        return
      }

      const newId = isEdit ? id : data.id
      navigate(`/bookings/${newId}`)
    } catch {
      setApiError('Network error — please try again.')
      setSubmitting(false)
    }
  }

  // ── Render helpers ───────────────────────────────────────────────────────

  const isReadOnly = Boolean(lockMessage)

  function inputCls(err?: string) {
    return `block w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
      err ? 'border-red-400 bg-red-50' : 'border-gray-300 bg-white'
    } ${isReadOnly ? 'bg-gray-50 text-gray-600 cursor-default' : ''}`
  }

  function FieldError({ msg }: { msg?: string }) {
    if (!msg) return null
    return <p className="mt-1 text-xs text-red-600" data-error>{msg}</p>
  }

  function SectionHeading({ title }: { title: string }) {
    return (
      <h2 className="text-base font-semibold text-gray-800 border-b border-gray-200 pb-2 mb-4 mt-6">
        {title}
      </h2>
    )
  }

  // ── Loading state ────────────────────────────────────────────────────────

  if (loading) {
    return <div className="p-6 text-gray-500 text-sm">Loading booking…</div>
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* Page title */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            {isEdit ? `Edit Booking ${existingBooking?.booking_number ?? ''}` : 'New Booking'}
          </h1>
          {isEdit && existingBooking && (
            <p className="text-xs text-gray-500 mt-0.5">
              Container: {existingBooking.container_number}
            </p>
          )}
        </div>
        <Link
          to={isEdit ? `/bookings/${id}` : '/bookings'}
          className="text-sm text-blue-600 hover:underline"
        >
          ← {isEdit ? 'Back to Detail' : 'Back to Bookings'}
        </Link>
      </div>

      {/* Lock banner */}
      {lockMessage && (
        <div className="mb-6 flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <svg className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
          </svg>
          <span>{lockMessage} All fields are shown in read-only mode.</span>
        </div>
      )}

      {/* API error banner */}
      {apiError && (
        <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          {apiError}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>

        {/* ── Section: Voyage & Container ── */}
        <SectionHeading title="Voyage & Container" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

          {/* Route */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Route <span className="text-red-500">*</span>
            </label>
            <select
              value={form.route}
              onChange={e => { set('route', e.target.value); set('voyage_id', '') }}
              disabled={isReadOnly}
              className={inputCls(errors.route)}
            >
              <option value="">— Select route —</option>
              {ROUTES.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            <FieldError msg={errors.route} />
          </div>

          {/* Voyage */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Voyage <span className="text-red-500">*</span>
            </label>
            <select
              value={form.voyage_id}
              onChange={e => set('voyage_id', e.target.value)}
              disabled={isReadOnly || !form.route}
              className={inputCls(errors.voyage_id)}
            >
              <option value="">
                {form.route ? '— Select voyage —' : '— Select a route first —'}
              </option>
              {voyages.map(v => (
                <option key={v.id} value={String(v.id)}>
                  {v.voyage_number} — {v.vessel_name} (ETD: {new Date(v.etd).toLocaleDateString()}, {v.available_slots} slots)
                </option>
              ))}
            </select>
            <FieldError msg={errors.voyage_id} />
          </div>

          {/* Container Type */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Container Type <span className="text-red-500">*</span>
            </label>
            <select
              value={form.container_type}
              onChange={e => set('container_type', e.target.value)}
              disabled={isReadOnly}
              className={inputCls(errors.container_type)}
            >
              <option value="">— Select type —</option>
              {CONTAINER_TYPES.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <FieldError msg={errors.container_type} />
          </div>

          {/* Container Number (read-only / auto-generated) */}
          {isEdit && existingBooking && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Container Number <span className="text-gray-400 font-normal">(auto-generated)</span>
              </label>
              <input
                type="text"
                value={existingBooking.container_number}
                readOnly
                className="block w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500 cursor-default"
              />
            </div>
          )}

          {/* Requested Gate-In Date */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Requested Gate-In Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={form.requested_gate_in_date}
              onChange={e => set('requested_gate_in_date', e.target.value)}
              readOnly={isReadOnly}
              className={inputCls(errors.requested_gate_in_date)}
            />
            <FieldError msg={errors.requested_gate_in_date} />
          </div>
        </div>

        {/* ── Section: Cargo Details ── */}
        <SectionHeading title="Cargo Details" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

          {/* Cargo Description */}
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Cargo Description <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.cargo_description}
              onChange={e => set('cargo_description', e.target.value)}
              readOnly={isReadOnly}
              placeholder="e.g. Automotive Parts, Refrigerated Seafood"
              className={inputCls(errors.cargo_description)}
            />
            <FieldError msg={errors.cargo_description} />
          </div>

          {/* Gross Weight */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Gross Weight <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                min="0"
                step="any"
                value={form.gross_weight}
                onChange={e => set('gross_weight', e.target.value)}
                readOnly={isReadOnly}
                placeholder="e.g. 18000"
                className={`${inputCls(errors.gross_weight)} flex-1`}
              />
              <select
                value={form.weight_unit}
                onChange={e => set('weight_unit', e.target.value)}
                disabled={isReadOnly}
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-20"
              >
                <option value="LB">lbs</option>
                <option value="KG">kg</option>
              </select>
            </div>
            <FieldError msg={errors.gross_weight} />
          </div>
        </div>

        {/* ── Section: Hazmat ── */}
        <SectionHeading title="Hazardous Materials" />
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">
              Contains Hazardous Materials?
            </label>
            <div className="flex gap-6">
              {(['no', 'yes'] as const).map(val => (
                <label key={val} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="hazmat"
                    value={val}
                    checked={form.hazmat === val}
                    onChange={() => !isReadOnly && set('hazmat', val)}
                    disabled={isReadOnly}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  {val === 'yes' ? 'Yes' : 'No'}
                </label>
              ))}
            </div>
          </div>

          {/* Hazmat sub-fields — only when hazmat = yes */}
          {form.hazmat === 'yes' && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 rounded-md border border-orange-200 bg-orange-50 p-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  UN Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.hazmat_un_number}
                  onChange={e => set('hazmat_un_number', e.target.value)}
                  readOnly={isReadOnly}
                  placeholder="e.g. UN1203"
                  className={inputCls(errors.hazmat_un_number)}
                />
                <FieldError msg={errors.hazmat_un_number} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  IMO / Hazard Class <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.hazmat_imo_class}
                  onChange={e => set('hazmat_imo_class', e.target.value)}
                  readOnly={isReadOnly}
                  placeholder="e.g. 3 (Flammable)"
                  className={inputCls(errors.hazmat_imo_class)}
                />
                <FieldError msg={errors.hazmat_imo_class} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Packing Group <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.hazmat_packing_group}
                  onChange={e => set('hazmat_packing_group', e.target.value)}
                  disabled={isReadOnly}
                  className={inputCls(errors.hazmat_packing_group)}
                >
                  <option value="">— Select —</option>
                  {PACKING_GROUPS.map(pg => (
                    <option key={pg} value={pg}>PG {pg}</option>
                  ))}
                </select>
                <FieldError msg={errors.hazmat_packing_group} />
              </div>
            </div>
          )}
        </div>

        {/* ── Section: Consignor ── */}
        <SectionHeading title="Consignor (Shipper)" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.consignor_name}
              onChange={e => setConsignorField('consignor_name', e.target.value)}
              readOnly={isReadOnly}
              className={inputCls(errors.consignor_name)}
            />
            <FieldError msg={errors.consignor_name} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Contact <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.consignor_contact}
              onChange={e => setConsignorField('consignor_contact', e.target.value)}
              readOnly={isReadOnly}
              placeholder="Phone or email"
              className={inputCls(errors.consignor_contact)}
            />
            <FieldError msg={errors.consignor_contact} />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Address <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.consignor_address}
              onChange={e => setConsignorField('consignor_address', e.target.value)}
              readOnly={isReadOnly}
              className={inputCls(errors.consignor_address)}
            />
            <FieldError msg={errors.consignor_address} />
          </div>
        </div>

        {/* ── Section: Consignee ── */}
        <SectionHeading title="Consignee (Recipient)" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.consignee_name}
              onChange={e => { set('consignee_name', e.target.value) }}
              readOnly={isReadOnly}
              className={inputCls(errors.consignee_name)}
            />
            <FieldError msg={errors.consignee_name} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Contact <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.consignee_contact}
              onChange={e => set('consignee_contact', e.target.value)}
              readOnly={isReadOnly}
              placeholder="Phone or email"
              className={inputCls(errors.consignee_contact)}
            />
            <FieldError msg={errors.consignee_contact} />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Address <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.consignee_address}
              onChange={e => set('consignee_address', e.target.value)}
              readOnly={isReadOnly}
              className={inputCls(errors.consignee_address)}
            />
            <FieldError msg={errors.consignee_address} />
          </div>
        </div>

        {/* ── Section: Payor / Bill-To ── */}
        <SectionHeading title="Payor / Bill-To" />
        {!isReadOnly && (
          <label className="mb-4 flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={sameAsConsignor}
              onChange={e => handleSameAsConsignor(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-gray-700">Same as Consignor</span>
          </label>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.payor_name}
              onChange={e => set('payor_name', e.target.value)}
              readOnly={isReadOnly || sameAsConsignor}
              className={inputCls(errors.payor_name)}
            />
            <FieldError msg={errors.payor_name} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Contact <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.payor_contact}
              onChange={e => set('payor_contact', e.target.value)}
              readOnly={isReadOnly || sameAsConsignor}
              placeholder="Phone or email"
              className={inputCls(errors.payor_contact)}
            />
            <FieldError msg={errors.payor_contact} />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Address <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.payor_address}
              onChange={e => set('payor_address', e.target.value)}
              readOnly={isReadOnly || sameAsConsignor}
              className={inputCls(errors.payor_address)}
            />
            <FieldError msg={errors.payor_address} />
          </div>
        </div>

        {/* ── Section: Additional Info ── */}
        <SectionHeading title="Additional Information" />
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Special Instructions <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <textarea
            rows={3}
            value={form.special_instructions}
            onChange={e => set('special_instructions', e.target.value)}
            readOnly={isReadOnly}
            placeholder="Any special handling, delivery notes, etc."
            className={`${inputCls()} resize-y`}
          />
        </div>

        {/* ── Actions ── */}
        <div className="mt-8 flex items-center gap-4 border-t border-gray-200 pt-5">
          {!isReadOnly && (
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {submitting
                ? (isEdit ? 'Saving…' : 'Creating…')
                : (isEdit ? 'Save Changes' : 'Create Booking')}
            </button>
          )}
          <Link
            to={isEdit ? `/bookings/${id}` : '/bookings'}
            className="text-sm text-gray-600 hover:text-gray-900 hover:underline"
          >
            {isReadOnly ? 'Back' : 'Cancel'}
          </Link>
        </div>

      </form>
    </div>
  )
}
