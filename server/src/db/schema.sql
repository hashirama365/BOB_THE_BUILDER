PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ─────────────────────────────────────────────
-- voyages
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS voyages (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  voyage_number     TEXT    NOT NULL UNIQUE,
  vessel_name       TEXT    NOT NULL,
  route             TEXT    NOT NULL,           -- 'JAX-SJU' | 'TAC-ANC'
  origin_port       TEXT    NOT NULL,
  origin_lat        REAL    NOT NULL,
  origin_lng        REAL    NOT NULL,
  destination_port  TEXT    NOT NULL,
  dest_lat          REAL    NOT NULL,
  dest_lng          REAL    NOT NULL,
  etd               TEXT    NOT NULL,           -- ISO-8601
  eta               TEXT    NOT NULL,
  capacity          INTEGER NOT NULL,
  available_slots   INTEGER NOT NULL,
  status            TEXT    NOT NULL DEFAULT 'Scheduled'
                    CHECK(status IN ('Scheduled','Departed','Arrived','Cancelled'))
);

-- ─────────────────────────────────────────────
-- bookings
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bookings (
  id                        INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_number            TEXT    NOT NULL UNIQUE,
  route                     TEXT    NOT NULL,
  voyage_id                 INTEGER NOT NULL REFERENCES voyages(id),
  container_type            TEXT    NOT NULL CHECK(container_type IN ('20GP','40GP','40HC','45HC','20RF','40RF')),
  container_number          TEXT    NOT NULL UNIQUE,
  cargo_description         TEXT    NOT NULL,
  gross_weight              REAL    NOT NULL,
  weight_unit               TEXT    NOT NULL DEFAULT 'KG' CHECK(weight_unit IN ('KG','LB')),
  hazmat                    INTEGER NOT NULL DEFAULT 0 CHECK(hazmat IN (0,1)),
  hazmat_un_number          TEXT,
  hazmat_imo_class          TEXT,
  hazmat_packing_group      TEXT,
  consignor_name            TEXT    NOT NULL,
  consignor_address         TEXT    NOT NULL,
  consignor_contact         TEXT    NOT NULL,
  consignee_name            TEXT    NOT NULL,
  consignee_address         TEXT    NOT NULL,
  consignee_contact         TEXT    NOT NULL,
  payor_name                TEXT    NOT NULL,
  payor_address             TEXT    NOT NULL,
  payor_contact             TEXT    NOT NULL,
  current_status            TEXT    NOT NULL DEFAULT 'Booking Confirmed',
  booking_date              TEXT    NOT NULL,
  requested_gate_in_date    TEXT    NOT NULL,
  special_instructions      TEXT
);

-- ─────────────────────────────────────────────
-- status_history
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS status_history (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id    INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  status        TEXT    NOT NULL,
  timestamp     TEXT    NOT NULL,
  location_name TEXT,
  latitude      REAL,
  longitude     REAL
);

-- ─────────────────────────────────────────────
-- gps_pings
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gps_pings (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id      INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  container_number TEXT   NOT NULL,
  latitude        REAL    NOT NULL,
  longitude       REAL    NOT NULL,
  timestamp       TEXT    NOT NULL,
  status_at_ping  TEXT    NOT NULL
);
