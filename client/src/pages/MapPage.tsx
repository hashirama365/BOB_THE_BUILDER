import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap,
} from 'react-leaflet'
import L from 'leaflet'

// ─────────────────────────────────────────────────────────────────────────────
// Fix Leaflet default icon issue with Vite bundler
// Leaflet tries to resolve icon URLs from CSS; Vite breaks that resolution.
// Import the PNGs directly and override the defaults.
// ─────────────────────────────────────────────────────────────────────────────
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
})

// ─────────────────────────────────────────────────────────────────────────────
// Leaflet CSS must be imported here (side-effect import)
// ─────────────────────────────────────────────────────────────────────────────
import 'leaflet/dist/leaflet.css'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface MapContainer {
  id: number
  booking_number: string
  container_number: string
  container_type: string
  cargo_description: string
  hazmat: boolean
  current_status: string
  route: string
  vessel_name: string
  voyage_number: string
  origin_port: string
  origin_lat: number
  origin_lng: number
  destination_port: string
  dest_lat: number
  dest_lng: number
  position: { lat: number; lng: number }
  position_source: string
}

type PingsMap = Record<string, [number, number][]>

// ─────────────────────────────────────────────────────────────────────────────
// Port definitions (fixed reference markers)
// ─────────────────────────────────────────────────────────────────────────────
const PORTS = [
  { name: 'Jacksonville, FL', lat: 30.3322, lng: -81.6557, route: 'JAX-SJU' },
  { name: 'San Juan, PR',      lat: 18.4655, lng: -66.1057, route: 'JAX-SJU' },
  { name: 'Tacoma, WA',        lat: 47.2529, lng: -122.4443, route: 'TAC-ANC' },
  { name: 'Anchorage, AK',     lat: 61.2181, lng: -149.9003, route: 'TAC-ANC' },
]

// ─────────────────────────────────────────────────────────────────────────────
// Custom icons
// ─────────────────────────────────────────────────────────────────────────────
const portIcon = L.divIcon({
  className: '',
  html: `<div style="
    width:22px; height:22px; border-radius:50%;
    background:#1e40af; border:3px solid #fff;
    box-shadow:0 0 0 2px #1e40af;
    display:flex; align-items:center; justify-content:center;
    font-size:11px; color:#fff; font-weight:bold;
  ">⚓</div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  popupAnchor: [0, -14],
})

const makeContainerIcon = (status: string) => {
  const color =
    status === 'At Sea' || status === 'Loaded on Vessel'
      ? '#16a34a'
      : status.startsWith('Arrived') || status === 'Delivered' || status === 'Available for Pickup' || status === 'Customs Cleared'
      ? '#9333ea'
      : '#d97706'

  return L.divIcon({
    className: '',
    html: `<div style="
      width:18px; height:18px; border-radius:3px; transform:rotate(45deg);
      background:${color}; border:2px solid #fff;
      box-shadow:0 1px 3px rgba(0,0,0,0.4);
    "></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -12],
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: normalise route string → 'JAX-SJU' or 'TAC-ANC'
// The DB stores the full label so we normalise for comparison.
// ─────────────────────────────────────────────────────────────────────────────
function normaliseRoute(route: string): 'JAX-SJU' | 'TAC-ANC' | 'other' {
  const r = route.toUpperCase()
  if (r.includes('JAX') || r.includes('JACKSONVILLE') || r.includes('SAN JUAN') || r.includes('SJU'))
    return 'JAX-SJU'
  if (r.includes('TAC') || r.includes('TACOMA') || r.includes('ANC') || r.includes('ANCHORAGE'))
    return 'TAC-ANC'
  return 'other'
}

// Route line colours
const ROUTE_COLOURS: Record<string, string> = {
  'JAX-SJU': '#f59e0b',
  'TAC-ANC': '#06b6d4',
}

// ─────────────────────────────────────────────────────────────────────────────
// Tiny helper: recenter map when initialView prop changes
// ─────────────────────────────────────────────────────────────────────────────
function MapInitialView({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap()
  useEffect(() => {
    map.setView(center, zoom)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// MapPage
// ─────────────────────────────────────────────────────────────────────────────
type RouteFilter = 'all' | 'JAX-SJU' | 'TAC-ANC'

export default function MapPage() {
  const navigate = useNavigate()
  const [containers, setContainers] = useState<MapContainer[]>([])
  const [pings, setPings] = useState<PingsMap>({})
  const [routeFilter, setRouteFilter] = useState<RouteFilter>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch('/api/map/containers').then((r) => r.json()),
      fetch('/api/map/pings').then((r) => r.json()),
    ])
      .then(([containerData, pingsData]) => {
        setContainers(containerData)
        setPings(pingsData)
      })
      .catch(() => setError('Failed to load map data'))
      .finally(() => setLoading(false))
  }, [])

  const filteredContainers = containers.filter((c) => {
    if (routeFilter === 'all') return true
    return normaliseRoute(c.route) === routeFilter
  })

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 160px)', minHeight: 400 }}>
      {/* ── Filter toolbar ── */}
      <div className="flex items-center gap-3 px-1 py-3 shrink-0">
        <span className="text-sm font-medium text-gray-600">Route:</span>
        {(['all', 'JAX-SJU', 'TAC-ANC'] as RouteFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => setRouteFilter(f)}
            className={[
              'px-3 py-1 rounded text-sm font-medium border transition-colors',
              routeFilter === f
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400',
            ].join(' ')}
          >
            {f === 'all' ? 'All Routes' : f === 'JAX-SJU' ? 'JAX → San Juan' : 'Tacoma → Anchorage'}
          </button>
        ))}
        <span className="ml-auto text-xs text-gray-400">
          {loading ? 'Loading…' : error ? error : `${filteredContainers.length} container(s) shown`}
        </span>
      </div>

      {/* ── Legend ── */}
      <div className="flex items-center gap-4 px-1 pb-2 shrink-0 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span style={{ display:'inline-block', width:12, height:12, borderRadius:'50%', background:'#1e40af' }} /> Port
        </span>
        <span className="flex items-center gap-1">
          <span style={{ display:'inline-block', width:10, height:10, transform:'rotate(45deg)', background:'#16a34a' }} /> At Sea
        </span>
        <span className="flex items-center gap-1">
          <span style={{ display:'inline-block', width:10, height:10, transform:'rotate(45deg)', background:'#d97706' }} /> Pre-departure
        </span>
        <span className="flex items-center gap-1">
          <span style={{ display:'inline-block', width:10, height:10, transform:'rotate(45deg)', background:'#9333ea' }} /> Arrived/Delivered
        </span>
        <span className="flex items-center gap-1">
          <span style={{ display:'inline-block', width:24, height:3, background:'#f59e0b', borderRadius:2 }} /> JAX→SJU path
        </span>
        <span className="flex items-center gap-1">
          <span style={{ display:'inline-block', width:24, height:3, background:'#06b6d4', borderRadius:2 }} /> TAC→ANC path
        </span>
      </div>

      {/* ── Map ── */}
      <div className="flex-1 rounded-lg overflow-hidden border border-gray-200">
        <MapContainer
          style={{ height: '100%', width: '100%' }}
          center={[40, -100]}
          zoom={3}
          scrollWheelZoom
        >
          <MapInitialView center={[40, -100]} zoom={3} />

          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* ── Port markers ── */}
          {PORTS.filter((p) => routeFilter === 'all' || p.route === routeFilter).map((port) => (
            <Marker key={port.name} position={[port.lat, port.lng]} icon={portIcon}>
              <Popup>
                <strong>{port.name}</strong>
                <br />
                <span className="text-xs text-gray-500">{port.route === 'JAX-SJU' ? 'JAX → San Juan lane' : 'Tacoma → Anchorage lane'}</span>
              </Popup>
            </Marker>
          ))}

          {/* ── Container polylines ── */}
          {filteredContainers.map((c) => {
            const path = pings[c.id]
            if (!path || path.length < 2) return null
            const colour = ROUTE_COLOURS[normaliseRoute(c.route)] ?? '#6b7280'
            return (
              <Polyline
                key={`poly-${c.id}`}
                positions={path}
                pathOptions={{ color: colour, weight: 2.5, opacity: 0.75 }}
              />
            )
          })}

          {/* ── Container markers ── */}
          {filteredContainers.map((c) => (
            <Marker
              key={`con-${c.id}`}
              position={[c.position.lat, c.position.lng]}
              icon={makeContainerIcon(c.current_status)}
              eventHandlers={{
                click: () => navigate(`/bookings/${c.id}`),
              }}
            >
              <Popup>
                <div style={{ minWidth: 190 }}>
                  <p style={{ fontWeight: 700, marginBottom: 4 }}>{c.booking_number}</p>
                  <p style={{ fontSize: 12, marginBottom: 2 }}>
                    <span style={{ color: '#6b7280' }}>Container: </span>{c.container_number}
                  </p>
                  <p style={{ fontSize: 12, marginBottom: 2 }}>
                    <span style={{ color: '#6b7280' }}>Cargo: </span>{c.cargo_description}
                  </p>
                  <p style={{ fontSize: 12, marginBottom: 2 }}>
                    <span style={{ color: '#6b7280' }}>Status: </span>{c.current_status}
                  </p>
                  <p style={{ fontSize: 12, marginBottom: 6 }}>
                    <span style={{ color: '#6b7280' }}>Route: </span>
                    {c.origin_port} → {c.destination_port}
                  </p>
                  <button
                    onClick={() => navigate(`/bookings/${c.id}`)}
                    style={{
                      fontSize: 12, padding: '3px 10px', background: '#2563eb',
                      color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer',
                    }}
                  >
                    View Booking →
                  </button>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  )
}
