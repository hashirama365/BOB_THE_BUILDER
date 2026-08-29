const STATUS_STYLES: Record<string, string> = {
  'Booking Confirmed':        'bg-gray-100 text-gray-700',
  'Documentation Submitted':  'bg-blue-50 text-blue-700',
  'Gated In (Origin)':        'bg-yellow-50 text-yellow-700',
  'Loaded on Vessel':         'bg-orange-50 text-orange-700',
  'Departed Origin Port':     'bg-indigo-50 text-indigo-700',
  'At Sea':                   'bg-sky-100 text-sky-700',
  'Arrived Destination Port': 'bg-teal-50 text-teal-700',
  'Customs Cleared':          'bg-violet-50 text-violet-700',
  'Available for Pickup':     'bg-lime-50 text-lime-700',
  'Delivered':                'bg-green-100 text-green-700',
  'Cancelled':                'bg-red-100 text-red-700',
}

const DEFAULT_STYLE = 'bg-gray-100 text-gray-600'

interface StatusBadgeProps {
  status: string
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const cls = STATUS_STYLES[status] ?? DEFAULT_STYLE
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${cls}`}
    >
      {status}
    </span>
  )
}
