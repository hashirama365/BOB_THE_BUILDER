# ChangeGuard Analysis

Generated: 2026-08-30T04:15:38Z

## Logical Dependencies

### CG-101 → CG-102

**Confidence:** 95%


### CG-101 → CG-103

**Confidence:** 98%


### CG-105 → CG-101

**Confidence:** 95%


### CG-105 → CG-102

**Confidence:** 95%


## Change Collisions

### CG-101 ↔ CG-102

**Confidence:** 92%


### CG-101 ↔ CG-103

**Confidence:** 95%


### CG-101 ↔ CG-104

**Confidence:** 90%


### CG-101 ↔ CG-105

**Confidence:** 100%


### CG-101 ↔ CG-106

**Confidence:** 95%


### CG-102 ↔ CG-103

**Confidence:** 95%


### CG-102 ↔ CG-105

**Confidence:** 100%


### CG-102 ↔ CG-106

**Confidence:** 95%


### CG-103 ↔ CG-104

**Confidence:** 82%


### CG-103 ↔ CG-105

**Confidence:** 95%


### CG-103 ↔ CG-106

**Confidence:** 95%


### CG-104 ↔ CG-105

**Confidence:** 90%


### CG-104 ↔ CG-106

**Confidence:** 75%


### CG-105 ↔ CG-106

**Confidence:** 95%


## Independent Changes

_All tickets have at least one dependency or collision relationship._

## Graph

```mermaid
graph TD

CG101["CG-101 - Add Container Hold Status"]
CG102["CG-102 - Block Billing Actions for Containers on Hold"]
CG103["CG-103 - Emit Audit Events on Hold Status Transitions"]
CG104["CG-104 - Add CSV Export for Bookings List"]
CG105["CG-105 - Refactor Booking Cutoff Logic into a Shared Policy Module"]
CG106["CG-106 - Enforce Route Consistency Between Bookings and Voyages"]

CG101 -->|dependency| CG102
CG101 -->|dependency| CG103
CG105 -->|dependency| CG101
CG105 -->|dependency| CG102
CG101 -. collision .- CG102
CG101 -. collision .- CG103
CG101 -. collision .- CG104
CG101 -. collision .- CG105
CG101 -. collision .- CG106
CG102 -. collision .- CG103
CG102 -. collision .- CG105
CG102 -. collision .- CG106
CG103 -. collision .- CG104
CG103 -. collision .- CG105
CG103 -. collision .- CG106
CG104 -. collision .- CG105
CG104 -. collision .- CG106
CG105 -. collision .- CG106
```
