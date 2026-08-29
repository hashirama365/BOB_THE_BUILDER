import StatusBadge from './StatusBadge'

interface StatusEntry {
  id: number
  booking_id: number
  status: string
  timestamp: string
  location_name: string | null
  latitude: number | null
  longitude: number | null
}

interface StatusTimelineProps {
  entries: StatusEntry[]
  currentStatus: string
}

function formatTimestamp(ts: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(new Date(ts))
  } catch {
    return ts
  }
}

export default function StatusTimeline({ entries, currentStatus }: StatusTimelineProps) {
  if (entries.length === 0) {
    return <p className="text-sm text-gray-400 italic">No status history available.</p>
  }

  return (
    <ol className="relative border-l-2 border-gray-200 ml-3">
      {entries.map((entry, idx) => {
        const isCurrent = entry.status === currentStatus && idx === entries.length - 1
        const isPast = idx < entries.length - 1

        return (
          <li key={entry.id} className="mb-6 ml-6 last:mb-0">
            {/* Dot */}
            <span
              className={`absolute -left-[9px] flex h-4 w-4 items-center justify-center rounded-full ring-2 ring-white
                ${isCurrent
                  ? 'bg-blue-600'
                  : isPast
                  ? 'bg-gray-400'
                  : 'bg-gray-200'}`}
            />

            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <StatusBadge status={entry.status} />
                {isCurrent && (
                  <span className="text-xs font-medium text-blue-600 uppercase tracking-wide">
                    Current
                  </span>
                )}
              </div>

              <time className="text-xs text-gray-500 mt-0.5">
                {formatTimestamp(entry.timestamp)}
              </time>

              {entry.location_name && (
                <span className="text-xs text-gray-500">📍 {entry.location_name}</span>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
