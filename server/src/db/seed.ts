/**
 * seed.ts — drops and re-populates all dummy data.
 * Run via:  npm run seed
 *
 * Produces:
 *  - 4 voyages on JAX→SJU, 3 voyages on TAC→ANC
 *  - 15 bookings spread across both lanes, every lifecycle status, hazmat + non-hazmat
 *  - Realistic GPS pings for bookings that are at sea / arrived
 */

import { db } from './database';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function isoDate(offsetDays: number, baseDate = new Date('2025-04-01')): string {
  const d = new Date(baseDate);
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString();
}

function dateOnly(offsetDays: number, baseDate = new Date('2025-04-01')): string {
  return isoDate(offsetDays, baseDate).split('T')[0];
}

/** Interpolate n points between two lat/lng pairs (inclusive of start and end). */
function interpolate(
  startLat: number, startLng: number,
  endLat: number,   endLng: number,
  steps: number
): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    pts.push([
      startLat + (endLat - startLat) * t,
      startLng + (endLng - startLng) * t,
    ]);
  }
  return pts;
}

// ─────────────────────────────────────────────────────────────────────────────
// GPS waypoint routes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * JAX (30.33, -81.66) → San Juan (18.47, -66.12)
 * Route: departs JAX, hugs FL/GA coast south, through Bahamas, Caribbean.
 */
const JAX_SJU_WAYPOINTS: Array<[number, number]> = [
  [30.33, -81.66],   // Jacksonville port
  [29.95, -81.30],   // St. Augustine area
  [29.10, -80.90],   // Offshore Daytona
  [28.10, -80.60],   // Cape Canaveral area
  [27.00, -80.10],   // Offshore West Palm Beach
  [25.80, -79.90],   // Offshore Miami
  [25.05, -79.10],   // Florida Straits
  [24.50, -78.00],   // Bahamas (NW Providence Channel)
  [23.50, -76.50],   // Eleuthera area
  [22.50, -75.00],   // Great Bahama Bank exit
  [21.00, -73.00],   // Open Atlantic
  [20.00, -71.00],   // North of Hispaniola
  [19.50, -70.00],   // Monte Cristi approach
  [18.90, -68.50],   // North coast Hispaniola
  [18.50, -67.00],   // Puerto Rico approach
  [18.47, -66.12],   // San Juan port
];

/**
 * Tacoma (47.25, -122.43) → Anchorage (61.22, -149.90)
 * Route: departs Tacoma, north through Puget Sound, Strait of Juan de Fuca,
 * Inside Passage, Gulf of Alaska.
 */
const TAC_ANC_WAYPOINTS: Array<[number, number]> = [
  [47.25, -122.43],  // Tacoma port
  [47.60, -122.55],  // Puget Sound north
  [48.10, -122.75],  // Admiralty Inlet
  [48.40, -122.90],  // Strait of Juan de Fuca entry
  [48.55, -123.50],  // Mid-Strait of Juan de Fuca
  [48.80, -124.70],  // Pacific entry / Cape Flattery
  [49.20, -125.30],  // West Vancouver Island
  [50.00, -127.00],  // NW Vancouver Island
  [51.00, -128.00],  // Queen Charlotte Sound
  [52.00, -128.50],  // Bella Bella area (Inside Passage)
  [53.00, -131.00],  // Haida Gwaii area
  [54.50, -132.00],  // Dixon Entrance
  [55.35, -131.65],  // Ketchikan
  [56.80, -132.37],  // Wrangell area
  [57.05, -135.33],  // Sitka
  [58.30, -136.50],  // Cross Sound
  [59.00, -138.00],  // Gulf of Alaska coast
  [59.50, -141.00],  // Yakutat Bay approach
  [59.80, -144.00],  // Mid Gulf of Alaska
  [60.00, -147.00],  // Prince William Sound approach
  [60.56, -146.50],  // Valdez area
  [61.22, -149.90],  // Anchorage port
];

/** Build a list of GPS ping records for a booking moving along a waypoint route.
 *  pingCount controls how many pings to emit (sampled evenly from the waypoint list).
 *  fractionComplete (0–1) indicates how far along the route the vessel currently is.
 *  startTime is the departure ISO timestamp.
 *  durationHours is the total voyage transit time.
 */
function buildGpsPings(
  bookingId: number,
  containerNumber: string,
  waypoints: Array<[number, number]>,
  fractionComplete: number,
  startTimeIso: string,
  durationHours: number,
  statusAtPing: string
): Array<{
  booking_id: number;
  container_number: string;
  latitude: number;
  longitude: number;
  timestamp: string;
  status_at_ping: string;
}> {
  const totalPts = waypoints.length;
  const lastIdx = Math.round((totalPts - 1) * fractionComplete);
  const pingWaypoints = waypoints.slice(0, lastIdx + 1);
  if (pingWaypoints.length === 0) return [];

  const startMs = new Date(startTimeIso).getTime();
  const totalMs = durationHours * 60 * 60 * 1000;

  return pingWaypoints.map(([lat, lng], i) => {
    const fraction = pingWaypoints.length > 1 ? i / (pingWaypoints.length - 1) : 1;
    const ts = new Date(startMs + fraction * totalMs).toISOString();
    return {
      booking_id: bookingId,
      container_number: containerNumber,
      latitude: lat,
      longitude: lng,
      timestamp: ts,
      status_at_ping: statusAtPing,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Main seed
// ─────────────────────────────────────────────────────────────────────────────

function seed(): void {
  console.log('🌱  Seeding database…');

  // ── Wipe existing data (order matters due to FK constraints) ────────────────
  db.exec(`
    DELETE FROM gps_pings;
    DELETE FROM status_history;
    DELETE FROM bookings;
    DELETE FROM voyages;
    -- Reset auto-increment counters
    DELETE FROM sqlite_sequence WHERE name IN ('gps_pings','status_history','bookings','voyages');
  `);
  console.log('  ✓ Cleared existing data');

  // ── Insert voyages ──────────────────────────────────────────────────────────
  const insertVoyage = db.prepare(`
    INSERT INTO voyages
      (voyage_number, vessel_name, route,
       origin_port, origin_lat, origin_lng,
       destination_port, dest_lat, dest_lng,
       etd, eta, capacity, available_slots, status)
    VALUES
      (@voyage_number, @vessel_name, @route,
       @origin_port, @origin_lat, @origin_lng,
       @destination_port, @dest_lat, @dest_lng,
       @etd, @eta, @capacity, @available_slots, @status)
  `);

  const voyageData = [
    // ── JAX → SJU ──────────────────────────────────────────────────────────
    {
      voyage_number: 'CAR-2501',
      vessel_name: 'Caribbean Pioneer',
      route: 'JAX-SJU',
      origin_port: 'Jacksonville, FL',
      origin_lat: 30.33, origin_lng: -81.66,
      destination_port: 'San Juan, PR',
      dest_lat: 18.47, dest_lng: -66.12,
      etd: isoDate(-30),  // Departed 30 days ago
      eta: isoDate(-24),
      capacity: 300, available_slots: 285,
      status: 'Arrived',
    },
    {
      voyage_number: 'CAR-2502',
      vessel_name: 'Atlantic Star',
      route: 'JAX-SJU',
      origin_port: 'Jacksonville, FL',
      origin_lat: 30.33, origin_lng: -81.66,
      destination_port: 'San Juan, PR',
      dest_lat: 18.47, dest_lng: -66.12,
      etd: isoDate(-10),  // Departed 10 days ago
      eta: isoDate(-4),
      capacity: 300, available_slots: 295,
      status: 'Arrived',
    },
    {
      voyage_number: 'CAR-2503',
      vessel_name: 'Caribbean Pioneer',
      route: 'JAX-SJU',
      origin_port: 'Jacksonville, FL',
      origin_lat: 30.33, origin_lng: -81.66,
      destination_port: 'San Juan, PR',
      dest_lat: 18.47, dest_lng: -66.12,
      etd: isoDate(5),   // Departs in 5 days
      eta: isoDate(11),
      capacity: 300, available_slots: 292,
      status: 'Scheduled',
    },
    {
      voyage_number: 'CAR-2504',
      vessel_name: 'Atlantic Star',
      route: 'JAX-SJU',
      origin_port: 'Jacksonville, FL',
      origin_lat: 30.33, origin_lng: -81.66,
      destination_port: 'San Juan, PR',
      dest_lat: 18.47, dest_lng: -66.12,
      etd: isoDate(20),  // Future
      eta: isoDate(26),
      capacity: 300, available_slots: 300,
      status: 'Scheduled',
    },
    // ── TAC → ANC ──────────────────────────────────────────────────────────
    {
      voyage_number: 'AKP-2501',
      vessel_name: 'Northern Passage',
      route: 'TAC-ANC',
      origin_port: 'Tacoma, WA',
      origin_lat: 47.25, origin_lng: -122.43,
      destination_port: 'Anchorage, AK',
      dest_lat: 61.22, dest_lng: -149.90,
      etd: isoDate(-25),  // Departed 25 days ago
      eta: isoDate(-18),
      capacity: 250, available_slots: 240,
      status: 'Arrived',
    },
    {
      voyage_number: 'AKP-2502',
      vessel_name: 'Alaska Frontier',
      route: 'TAC-ANC',
      origin_port: 'Tacoma, WA',
      origin_lat: 47.25, origin_lng: -122.43,
      destination_port: 'Anchorage, AK',
      dest_lat: 61.22, dest_lng: -149.90,
      etd: isoDate(-7),   // Departed 7 days ago — in transit
      eta: isoDate(0),
      capacity: 250, available_slots: 244,
      status: 'Departed',
    },
    {
      voyage_number: 'AKP-2503',
      vessel_name: 'Northern Passage',
      route: 'TAC-ANC',
      origin_port: 'Tacoma, WA',
      origin_lat: 47.25, origin_lng: -122.43,
      destination_port: 'Anchorage, AK',
      dest_lat: 61.22, dest_lng: -149.90,
      etd: isoDate(12),  // Future
      eta: isoDate(19),
      capacity: 250, available_slots: 250,
      status: 'Scheduled',
    },
  ];

  const voyageIds: Record<string, number> = {};
  for (const v of voyageData) {
    const result = insertVoyage.run(v);
    voyageIds[v.voyage_number] = result.lastInsertRowid as number;
  }
  console.log(`  ✓ Inserted ${voyageData.length} voyages`);

  // ── Booking helpers ─────────────────────────────────────────────────────────
  const insertBooking = db.prepare(`
    INSERT INTO bookings (
      booking_number, route, voyage_id,
      container_type, container_number, cargo_description,
      gross_weight, weight_unit,
      hazmat, hazmat_un_number, hazmat_imo_class, hazmat_packing_group,
      consignor_name, consignor_address, consignor_contact,
      consignee_name, consignee_address, consignee_contact,
      payor_name, payor_address, payor_contact,
      current_status, booking_date, requested_gate_in_date, special_instructions
    ) VALUES (
      @booking_number, @route, @voyage_id,
      @container_type, @container_number, @cargo_description,
      @gross_weight, @weight_unit,
      @hazmat, @hazmat_un_number, @hazmat_imo_class, @hazmat_packing_group,
      @consignor_name, @consignor_address, @consignor_contact,
      @consignee_name, @consignee_address, @consignee_contact,
      @payor_name, @payor_address, @payor_contact,
      @current_status, @booking_date, @requested_gate_in_date, @special_instructions
    )
  `);

  const insertStatusHistory = db.prepare(`
    INSERT INTO status_history (booking_id, status, timestamp, location_name, latitude, longitude)
    VALUES (@booking_id, @status, @timestamp, @location_name, @latitude, @longitude)
  `);

  const insertGpsPing = db.prepare(`
    INSERT INTO gps_pings (booking_id, container_number, latitude, longitude, timestamp, status_at_ping)
    VALUES (@booking_id, @container_number, @latitude, @longitude, @timestamp, @status_at_ping)
  `);

  // Status lifecycle order (for reference when building history chains)
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
  ];

  function buildHistory(
    bookingId: number,
    upToStatus: string,
    startOffset: number,  // days from base date
    portName: string,
    portLat: number,
    portLng: number,
    destPortName: string,
    destLat: number,
    destLng: number
  ): void {
    const idx = LIFECYCLE.indexOf(upToStatus);
    for (let i = 0; i <= idx; i++) {
      const status = LIFECYCLE[i];
      let locName: string;
      let lat: number;
      let lng: number;
      if (i < 3) {
        locName = portName;
        lat = portLat;
        lng = portLng;
      } else if (i >= 6) {
        locName = destPortName;
        lat = destLat;
        lng = destLng;
      } else {
        locName = 'At Sea';
        lat = (portLat + destLat) / 2;
        lng = (portLng + destLng) / 2;
      }
      insertStatusHistory.run({
        booking_id: bookingId,
        status,
        timestamp: isoDate(startOffset + i * 2),
        location_name: locName,
        latitude: lat,
        longitude: lng,
      });
    }
  }

  // ── Bookings data ───────────────────────────────────────────────────────────
  interface BookingInput {
    booking_number: string;
    route: string;
    voyage_number: string;
    container_type: string;
    container_number: string;
    cargo_description: string;
    gross_weight: number;
    weight_unit: string;
    hazmat: number;
    hazmat_un_number: string | null;
    hazmat_imo_class: string | null;
    hazmat_packing_group: string | null;
    consignor_name: string;
    consignor_address: string;
    consignor_contact: string;
    consignee_name: string;
    consignee_address: string;
    consignee_contact: string;
    payor_name: string;
    payor_address: string;
    payor_contact: string;
    current_status: string;
    booking_date: string;
    requested_gate_in_date: string;
    special_instructions: string | null;
  }

  const bookings: BookingInput[] = [
    // ──────────────────────────────────────────────────────────────────────────
    // JAX → SJU bookings
    // ──────────────────────────────────────────────────────────────────────────

    // 1. Delivered — voyage CAR-2501 (arrived -24 days ago)
    {
      booking_number: 'BK-20250001',
      route: 'JAX-SJU',
      voyage_number: 'CAR-2501',
      container_type: '40GP',
      container_number: 'CSNU4012301',
      cargo_description: 'Household Appliances',
      gross_weight: 18500,
      weight_unit: 'KG',
      hazmat: 0,
      hazmat_un_number: null, hazmat_imo_class: null, hazmat_packing_group: null,
      consignor_name: 'HomeGoods USA Inc.',
      consignor_address: '150 Commerce Blvd, Jacksonville, FL 32202',
      consignor_contact: 'maria.santos@homegoodsusa.com',
      consignee_name: 'Caribbean Home Distributors',
      consignee_address: 'Calle Tanca 56, San Juan, PR 00901',
      consignee_contact: 'pedro.rivera@caribhome.pr',
      payor_name: 'HomeGoods USA Inc.',
      payor_address: '150 Commerce Blvd, Jacksonville, FL 32202',
      payor_contact: 'billing@homegoodsusa.com',
      current_status: 'Delivered',
      booking_date: dateOnly(-40),
      requested_gate_in_date: dateOnly(-33),
      special_instructions: null,
    },

    // 2. Customs Cleared — voyage CAR-2501
    {
      booking_number: 'BK-20250002',
      route: 'JAX-SJU',
      voyage_number: 'CAR-2501',
      container_type: '20GP',
      container_number: 'MSCU1987654',
      cargo_description: 'Electronic Components — Circuit Boards',
      gross_weight: 7200,
      weight_unit: 'KG',
      hazmat: 0,
      hazmat_un_number: null, hazmat_imo_class: null, hazmat_packing_group: null,
      consignor_name: 'TechParts Florida LLC',
      consignor_address: '901 Industrial Pkwy, Jacksonville, FL 32218',
      consignor_contact: 'ops@techpartsfla.com',
      consignee_name: 'IslaElectrónica S.A.',
      consignee_address: 'Av. Fernández Juncos 300, San Juan, PR 00907',
      consignee_contact: 'recepcion@islaelectronica.pr',
      payor_name: 'IslaElectrónica S.A.',
      payor_address: 'Av. Fernández Juncos 300, San Juan, PR 00907',
      payor_contact: 'cuentas@islaelectronica.pr',
      current_status: 'Customs Cleared',
      booking_date: dateOnly(-42),
      requested_gate_in_date: dateOnly(-34),
      special_instructions: 'Handle with care — fragile electronics',
    },

    // 3. At Sea — voyage CAR-2502 (arrived destination -4 days ago, but mark at-sea for GPS demo)
    {
      booking_number: 'BK-20250003',
      route: 'JAX-SJU',
      voyage_number: 'CAR-2502',
      container_type: '40HC',
      container_number: 'HLXU8765432',
      cargo_description: 'Furniture and Fixtures',
      gross_weight: 21000,
      weight_unit: 'KG',
      hazmat: 0,
      hazmat_un_number: null, hazmat_imo_class: null, hazmat_packing_group: null,
      consignor_name: 'Southern Furnishings Co.',
      consignor_address: '2200 Atlantic Blvd, Jacksonville, FL 32207',
      consignor_contact: 'logistics@southernfurnishings.com',
      consignee_name: 'Plaza Furniture Puerto Rico',
      consignee_address: 'Carr. 1 Km 25, Caguas, PR 00725',
      consignee_contact: 'almacen@plazafurniture.pr',
      payor_name: 'Southern Furnishings Co.',
      payor_address: '2200 Atlantic Blvd, Jacksonville, FL 32207',
      payor_contact: 'accounts@southernfurnishings.com',
      current_status: 'Arrived Destination Port',
      booking_date: dateOnly(-22),
      requested_gate_in_date: dateOnly(-14),
      special_instructions: 'Stackable — use proper dunnage',
    },

    // 4. HAZMAT — At Sea — voyage CAR-2502
    {
      booking_number: 'BK-20250004',
      route: 'JAX-SJU',
      voyage_number: 'CAR-2502',
      container_type: '20GP',
      container_number: 'TRLU5544331',
      cargo_description: 'Industrial Cleaning Chemicals (Sodium Hypochlorite Solution)',
      gross_weight: 14000,
      weight_unit: 'KG',
      hazmat: 1,
      hazmat_un_number: 'UN1791',
      hazmat_imo_class: '8',
      hazmat_packing_group: 'III',
      consignor_name: 'CleanChem Industries',
      consignor_address: '450 Chemical Way, Jacksonville, FL 32219',
      consignor_contact: 'hazmat@cleanchem.com',
      consignee_name: 'PR Industrial Supply',
      consignee_address: 'Parque Industrial Amelia, Guaynabo, PR 00965',
      consignee_contact: 'recibo@prindustrial.pr',
      payor_name: 'CleanChem Industries',
      payor_address: '450 Chemical Way, Jacksonville, FL 32219',
      payor_contact: 'freight@cleanchem.com',
      current_status: 'Arrived Destination Port',
      booking_date: dateOnly(-20),
      requested_gate_in_date: dateOnly(-13),
      special_instructions: 'HAZMAT — segregate from foodstuffs. MSDS attached.',
    },

    // 5. Departed Origin Port — voyage CAR-2503 (departs in 5 days — mislabelled for realism; treat as "in transit" demo)
    //    Using CAR-2502 which has already departed
    {
      booking_number: 'BK-20250005',
      route: 'JAX-SJU',
      voyage_number: 'CAR-2502',
      container_type: '40GP',
      container_number: 'OOLU2233445',
      cargo_description: 'Non-Perishable Food Products',
      gross_weight: 22000,
      weight_unit: 'KG',
      hazmat: 0,
      hazmat_un_number: null, hazmat_imo_class: null, hazmat_packing_group: null,
      consignor_name: 'Sunshine Foods Corp.',
      consignor_address: '780 Food Processing Dr, Jacksonville, FL 32208',
      consignor_contact: 'shipping@sunshinefoods.com',
      consignee_name: 'SuperMax Puerto Rico',
      consignee_address: 'Blvd. Baldorioty de Castro 600, San Juan, PR 00907',
      consignee_contact: 'recibo.mercancias@supermax.pr',
      payor_name: 'SuperMax Puerto Rico',
      payor_address: 'Blvd. Baldorioty de Castro 600, San Juan, PR 00907',
      payor_contact: 'cuentas.pagar@supermax.pr',
      current_status: 'At Sea',
      booking_date: dateOnly(-18),
      requested_gate_in_date: dateOnly(-12),
      special_instructions: null,
    },

    // 6. Gated In (Origin) — voyage CAR-2503 (future)
    {
      booking_number: 'BK-20250006',
      route: 'JAX-SJU',
      voyage_number: 'CAR-2503',
      container_type: '20RF',
      container_number: 'YMLU3344556',
      cargo_description: 'Refrigerated Pharmaceutical Products',
      gross_weight: 9500,
      weight_unit: 'KG',
      hazmat: 0,
      hazmat_un_number: null, hazmat_imo_class: null, hazmat_packing_group: null,
      consignor_name: 'MedLogistics Jacksonville',
      consignor_address: '1100 Pharma Park, Jacksonville, FL 32256',
      consignor_contact: 'cold-chain@medlogistics.com',
      consignee_name: 'Farmacia Isla Grande',
      consignee_address: 'Calle Loíza 1401, San Juan, PR 00911',
      consignee_contact: 'almacen@farmaciaislaqrande.pr',
      payor_name: 'MedLogistics Jacksonville',
      payor_address: '1100 Pharma Park, Jacksonville, FL 32256',
      payor_contact: 'billing@medlogistics.com',
      current_status: 'Gated In (Origin)',
      booking_date: dateOnly(-8),
      requested_gate_in_date: dateOnly(-2),
      special_instructions: 'Maintain 2–8°C. Temp logger attached.',
    },

    // 7. Documentation Submitted — voyage CAR-2503
    {
      booking_number: 'BK-20250007',
      route: 'JAX-SJU',
      voyage_number: 'CAR-2503',
      container_type: '40HC',
      container_number: 'COSU6677889',
      cargo_description: 'Construction Materials — Steel Rebar',
      gross_weight: 28000,
      weight_unit: 'KG',
      hazmat: 0,
      hazmat_un_number: null, hazmat_imo_class: null, hazmat_packing_group: null,
      consignor_name: 'Florida Steel Distributors',
      consignor_address: '3300 Port Industrial Rd, Jacksonville, FL 32226',
      consignor_contact: 'exports@flasteel.com',
      consignee_name: 'PR Construction Supply',
      consignee_address: 'Ave. Las Palmas 800, Ponce, PR 00730',
      consignee_contact: 'compras@prconstructionsupply.com',
      payor_name: 'PR Construction Supply',
      payor_address: 'Ave. Las Palmas 800, Ponce, PR 00730',
      payor_contact: 'pagos@prconstructionsupply.com',
      current_status: 'Documentation Submitted',
      booking_date: dateOnly(-5),
      requested_gate_in_date: dateOnly(2),
      special_instructions: 'Heavy cargo — use reinforced deck position',
    },

    // 8. Booking Confirmed — voyage CAR-2504 (future)
    {
      booking_number: 'BK-20250008',
      route: 'JAX-SJU',
      voyage_number: 'CAR-2504',
      container_type: '40GP',
      container_number: 'EISU9988770',
      cargo_description: 'Automotive Parts and Accessories',
      gross_weight: 16000,
      weight_unit: 'KG',
      hazmat: 0,
      hazmat_un_number: null, hazmat_imo_class: null, hazmat_packing_group: null,
      consignor_name: 'AutoParts Depot Inc.',
      consignor_address: '500 Auto Mall Dr, Jacksonville, FL 32210',
      consignor_contact: 'freight@autopartsdepot.com',
      consignee_name: 'Distributor Auto PR',
      consignee_address: 'Carr. 2 Km 11.5, Bayamón, PR 00959',
      consignee_contact: 'almacen@distributorauto.pr',
      payor_name: 'AutoParts Depot Inc.',
      payor_address: '500 Auto Mall Dr, Jacksonville, FL 32210',
      payor_contact: 'ap@autopartsdepot.com',
      current_status: 'Booking Confirmed',
      booking_date: dateOnly(-2),
      requested_gate_in_date: dateOnly(16),
      special_instructions: null,
    },

    // 9. Cancelled — voyage CAR-2503
    {
      booking_number: 'BK-20250009',
      route: 'JAX-SJU',
      voyage_number: 'CAR-2503',
      container_type: '20GP',
      container_number: 'MSKU4455667',
      cargo_description: 'Textile Products',
      gross_weight: 8000,
      weight_unit: 'KG',
      hazmat: 0,
      hazmat_un_number: null, hazmat_imo_class: null, hazmat_packing_group: null,
      consignor_name: 'Sunshine Textiles LLC',
      consignor_address: '200 Garment District, Jacksonville, FL 32204',
      consignor_contact: 'exports@sunshinetextiles.com',
      consignee_name: 'Moda Isla S.R.L.',
      consignee_address: 'Calle Fortaleza 150, San Juan, PR 00901',
      consignee_contact: 'compras@modaisla.pr',
      payor_name: 'Moda Isla S.R.L.',
      payor_address: 'Calle Fortaleza 150, San Juan, PR 00901',
      payor_contact: 'facturas@modaisla.pr',
      current_status: 'Cancelled',
      booking_date: dateOnly(-7),
      requested_gate_in_date: dateOnly(3),
      special_instructions: 'Cancelled — customer withdrew purchase order',
    },

    // ──────────────────────────────────────────────────────────────────────────
    // TAC → ANC bookings
    // ──────────────────────────────────────────────────────────────────────────

    // 10. Delivered — voyage AKP-2501 (arrived -18 days ago)
    {
      booking_number: 'BK-20250010',
      route: 'TAC-ANC',
      voyage_number: 'AKP-2501',
      container_type: '40GP',
      container_number: 'PCIU3301122',
      cargo_description: 'Grocery and Consumer Goods',
      gross_weight: 20000,
      weight_unit: 'KG',
      hazmat: 0,
      hazmat_un_number: null, hazmat_imo_class: null, hazmat_packing_group: null,
      consignor_name: 'Pacific Provisions LLC',
      consignor_address: '1200 Port of Tacoma Rd, Tacoma, WA 98421',
      consignor_contact: 'shipping@pacificprovisions.com',
      consignee_name: 'Alaska General Stores',
      consignee_address: '500 E Ship Creek Ave, Anchorage, AK 99501',
      consignee_contact: 'receiving@akgenstores.com',
      payor_name: 'Pacific Provisions LLC',
      payor_address: '1200 Port of Tacoma Rd, Tacoma, WA 98421',
      payor_contact: 'accounts@pacificprovisions.com',
      current_status: 'Delivered',
      booking_date: dateOnly(-38),
      requested_gate_in_date: dateOnly(-28),
      special_instructions: null,
    },

    // 11. Available for Pickup — voyage AKP-2501
    {
      booking_number: 'BK-20250011',
      route: 'TAC-ANC',
      voyage_number: 'AKP-2501',
      container_type: '20GP',
      container_number: 'TGHU8819283',
      cargo_description: 'Hardware and Building Supplies',
      gross_weight: 11500,
      weight_unit: 'KG',
      hazmat: 0,
      hazmat_un_number: null, hazmat_imo_class: null, hazmat_packing_group: null,
      consignor_name: 'Northwest Hardware Wholesale',
      consignor_address: '8800 Commerce St, Tacoma, WA 98422',
      consignor_contact: 'logistics@nwhardware.com',
      consignee_name: 'Glacier Point Supply Co.',
      consignee_address: '300 Merrill Field Dr, Anchorage, AK 99501',
      consignee_contact: 'orders@glacierpoint.ak',
      payor_name: 'Northwest Hardware Wholesale',
      payor_address: '8800 Commerce St, Tacoma, WA 98422',
      payor_contact: 'ap@nwhardware.com',
      current_status: 'Available for Pickup',
      booking_date: dateOnly(-36),
      requested_gate_in_date: dateOnly(-27),
      special_instructions: null,
    },

    // 12. HAZMAT — At Sea — voyage AKP-2502 (in transit)
    {
      booking_number: 'BK-20250012',
      route: 'TAC-ANC',
      voyage_number: 'AKP-2502',
      container_type: '20GP',
      container_number: 'FSCU7723401',
      cargo_description: 'Paint and Coatings (Flammable Liquid)',
      gross_weight: 12000,
      weight_unit: 'KG',
      hazmat: 1,
      hazmat_un_number: 'UN1263',
      hazmat_imo_class: '3',
      hazmat_packing_group: 'II',
      consignor_name: 'Cascade Coatings Inc.',
      consignor_address: '2200 Industrial Ave, Tacoma, WA 98424',
      consignor_contact: 'hazmat@cascadecoatings.com',
      consignee_name: 'Arctic Hardware & Coatings',
      consignee_address: '100 W Dimond Blvd, Anchorage, AK 99515',
      consignee_contact: 'receiving@arctichardware.ak',
      payor_name: 'Cascade Coatings Inc.',
      payor_address: '2200 Industrial Ave, Tacoma, WA 98424',
      payor_contact: 'billing@cascadecoatings.com',
      current_status: 'At Sea',
      booking_date: dateOnly(-15),
      requested_gate_in_date: dateOnly(-9),
      special_instructions: 'Class 3 Flammable — stow away from heat sources',
    },

    // 13. Departed Origin Port — voyage AKP-2502
    {
      booking_number: 'BK-20250013',
      route: 'TAC-ANC',
      voyage_number: 'AKP-2502',
      container_type: '40HC',
      container_number: 'APZU4501234',
      cargo_description: 'Industrial Equipment — Mining Machinery Parts',
      gross_weight: 26000,
      weight_unit: 'KG',
      hazmat: 0,
      hazmat_un_number: null, hazmat_imo_class: null, hazmat_packing_group: null,
      consignor_name: 'Pacific Mining Equipment',
      consignor_address: '5500 Port Access Rd, Tacoma, WA 98421',
      consignor_contact: 'freight@pacificmining.com',
      consignee_name: 'Alaska Mineral Corp.',
      consignee_address: '1000 E 1st Ave, Anchorage, AK 99501',
      consignee_contact: 'logistics@akmineralcorp.com',
      payor_name: 'Alaska Mineral Corp.',
      payor_address: '1000 E 1st Ave, Anchorage, AK 99501',
      payor_contact: 'ap@akmineralcorp.com',
      current_status: 'Departed Origin Port',
      booking_date: dateOnly(-12),
      requested_gate_in_date: dateOnly(-8),
      special_instructions: 'Over-weight — confirm deck load approval',
    },

    // 14. Loaded on Vessel — voyage AKP-2502
    {
      booking_number: 'BK-20250014',
      route: 'TAC-ANC',
      voyage_number: 'AKP-2502',
      container_type: '40RF',
      container_number: 'KNLU1234567',
      cargo_description: 'Frozen Seafood (Salmon, Halibut)',
      gross_weight: 18000,
      weight_unit: 'KG',
      hazmat: 0,
      hazmat_un_number: null, hazmat_imo_class: null, hazmat_packing_group: null,
      consignor_name: 'Pacific Seafood Processors',
      consignor_address: '300 Marine View Dr, Tacoma, WA 98422',
      consignor_contact: 'coldchain@pacificseafood.com',
      consignee_name: 'AK Seafood Distributors',
      consignee_address: '200 W Fireweed Ln, Anchorage, AK 99503',
      consignee_contact: 'receiving@akseafooddist.com',
      payor_name: 'Pacific Seafood Processors',
      payor_address: '300 Marine View Dr, Tacoma, WA 98422',
      payor_contact: 'billing@pacificseafood.com',
      current_status: 'Loaded on Vessel',
      booking_date: dateOnly(-10),
      requested_gate_in_date: dateOnly(-7),
      special_instructions: 'Maintain -18°C. Do not break reefer power.',
    },

    // 15. Booking Confirmed — voyage AKP-2503 (future)
    {
      booking_number: 'BK-20250015',
      route: 'TAC-ANC',
      voyage_number: 'AKP-2503',
      container_type: '45HC',
      container_number: 'HDMU2233445',
      cargo_description: 'Retail Merchandise — General Goods',
      gross_weight: 14500,
      weight_unit: 'KG',
      hazmat: 0,
      hazmat_un_number: null, hazmat_imo_class: null, hazmat_packing_group: null,
      consignor_name: 'Northwest Retail Logistics',
      consignor_address: '600 Pacific Hwy, Tacoma, WA 98424',
      consignor_contact: 'shipping@nwretaillogistics.com',
      consignee_name: 'Arctic Trading Company',
      consignee_address: '550 W 7th Ave, Anchorage, AK 99501',
      consignee_contact: 'stock@arctictrading.ak',
      payor_name: 'Arctic Trading Company',
      payor_address: '550 W 7th Ave, Anchorage, AK 99501',
      payor_contact: 'finance@arctictrading.ak',
      current_status: 'Booking Confirmed',
      booking_date: dateOnly(-1),
      requested_gate_in_date: dateOnly(10),
      special_instructions: null,
    },

    // 16. DEMO BUG — route/voyage lane mismatch. Voyage CAR-2503 is a JAX-SJU
    //     sailing, but this booking's `route` field is (incorrectly) TAC-ANC,
    //     so it won't show up when the board is filtered to JAX-SJU. Used to
    //     demo the DB Assistant chat feature diagnosing a "missing booking".
    {
      booking_number: 'BK-20250016',
      route: 'TAC-ANC',
      voyage_number: 'CAR-2503',
      container_type: '40GP',
      container_number: 'SWRE3624492',
      cargo_description: 'General retail goods - palletized dry goods',
      gross_weight: 18500,
      weight_unit: 'KG',
      hazmat: 0,
      hazmat_un_number: null, hazmat_imo_class: null, hazmat_packing_group: null,
      consignor_name: 'Sunbelt Distributors Inc',
      consignor_address: '4200 Talleyrand Ave, Jacksonville, FL 32206',
      consignor_contact: 'shipping@sunbeltdist.com',
      consignee_name: 'Isla Verde Retail Group',
      consignee_address: 'Calle Loiza 1950, San Juan, PR 00913',
      consignee_contact: 'receiving@islaverde.com',
      payor_name: 'Sunbelt Distributors Inc',
      payor_address: '4200 Talleyrand Ave, Jacksonville, FL 32206',
      payor_contact: 'billing@sunbeltdist.com',
      current_status: 'Booking Confirmed',
      booking_date: dateOnly(0),
      requested_gate_in_date: dateOnly(5),
      special_instructions: null,
    },
  ];

  // Insert bookings and their status history + GPS pings in a transaction
  const insertAll = db.transaction(() => {
    for (const b of bookings) {
      const voyageId = voyageIds[b.voyage_number];
      if (!voyageId) throw new Error(`Unknown voyage_number: ${b.voyage_number}`);

      const result = insertBooking.run({ ...b, voyage_id: voyageId });
      const bookingId = result.lastInsertRowid as number;

      // Determine port coords from route
      const isJAX = b.route === 'JAX-SJU';
      const originPort = isJAX ? 'Jacksonville, FL' : 'Tacoma, WA';
      const originLat  = isJAX ? 30.33 : 47.25;
      const originLng  = isJAX ? -81.66 : -122.43;
      const destPort   = isJAX ? 'San Juan, PR' : 'Anchorage, AK';
      const destLat    = isJAX ? 18.47 : 61.22;
      const destLng    = isJAX ? -66.12 : -149.90;
      const waypoints  = isJAX ? JAX_SJU_WAYPOINTS : TAC_ANC_WAYPOINTS;

      const status = b.current_status;

      if (status === 'Cancelled') {
        // Build history up to Booking Confirmed, then add Cancelled entry
        insertStatusHistory.run({
          booking_id: bookingId,
          status: 'Booking Confirmed',
          timestamp: isoDate(-7),
          location_name: originPort,
          latitude: originLat,
          longitude: originLng,
        });
        insertStatusHistory.run({
          booking_id: bookingId,
          status: 'Cancelled',
          timestamp: isoDate(-3),
          location_name: originPort,
          latitude: originLat,
          longitude: originLng,
        });
      } else {
        const startOffset = -(LIFECYCLE.indexOf(status) * 2 + 10);
        buildHistory(bookingId, status, startOffset, originPort, originLat, originLng, destPort, destLat, destLng);
      }

      // GPS pings for in-transit / arrived / delivered bookings
      const pingSatuses = ['At Sea','Departed Origin Port','Loaded on Vessel','Arrived Destination Port','Customs Cleared','Available for Pickup','Delivered'];
      if (pingSatuses.includes(status)) {
        let fractionComplete = 0.5;
        if (status === 'Departed Origin Port') fractionComplete = 0.15;
        else if (status === 'Loaded on Vessel') fractionComplete = 0.05;
        else if (status === 'At Sea') fractionComplete = 0.55;
        else if (status === 'Arrived Destination Port') fractionComplete = 1.0;
        else if (status === 'Customs Cleared') fractionComplete = 1.0;
        else if (status === 'Available for Pickup') fractionComplete = 1.0;
        else if (status === 'Delivered') fractionComplete = 1.0;

        const durationHours = isJAX ? 144 : 168; // 6 days JAX, 7 days TAC
        const pings = buildGpsPings(
          bookingId,
          b.container_number,
          waypoints,
          fractionComplete,
          isoDate(-14),
          durationHours,
          status
        );
        for (const ping of pings) {
          insertGpsPing.run(ping);
        }
      }
    }
  });

  insertAll();
  console.log(`  ✓ Inserted ${bookings.length} bookings with status history and GPS pings`);
  console.log('🌱  Seed complete!');
}

seed();
