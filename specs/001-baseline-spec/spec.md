# Feature Specification: Baseline Casper POS Desktop

**Feature Branch**: `001-baseline-spec`  
**Created**: 2026-02-24  
**Status**: Draft  
**Input**: User description: "Build baseline feature specification for Casper POS Desktop"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Seamless Offline Sales (Priority: P1)

As a POS operator, I want to process sales when the internet is down, so that customers can be served without interruption.

**Why this priority**: Core business value; fundamental to the "Offline-First" principle of Casper POS.

**Independent Test**: Can be fully tested by disabling the network adapter and completing a sale; delivers immediate business continuity.

**Acceptance Scenarios**:

1. **Given** the application is in "Offline Mode", **When** a user adds items to the cart and clicks "Pay", **Then** the transaction is persisted to local IndexedDB and a success toast is shown.
2. **Given** a pending offline transaction, **When** the network connection is restored, **Then** the system automatically synchronizes the transaction with the remote server in the background.

---

### User Story 2 - Automated Data Safety (Priority: P1)

As a business owner, I want my sales data to be automatically backed up to my computer's storage, so that I don't lose data if the browser cache is cleared.

**Why this priority**: Essential for data durability and trust; guarantees "zero data loss" on desktop.

**Independent Test**: Verified by checking the `backups/` directory for a fresh SQLite export after the 5-minute interval.

**Acceptance Scenarios**:

1. **Given** the application has been running for 5 minutes, **When** the auto-backup task triggers, **Then** a mirrored snapshot of the local IndexedDB is saved to the local filesystem via Electron IPC.
2. **Given** a new application start with an empty browser cache, **When** a local filesystem snapshot exists, **Then** the system automatically restores the data into IndexedDB before the user logs in.

---

### User Story 3 - Rapid Physical Feedback (Priority: P2)

As a POS operator, I want to print receipts instantly with a single click, so that the checkout process is as fast as possible.

**Why this priority**: Critical for operational speed and throughput in high-traffic retail environments.

**Independent Test**: Can be tested by clicking the "Speed Print" button and measuring the time until the thermal printer starts.

**Acceptance Scenarios**:

1. **Given** an open order, **When** the user clicks the "Speed Print" button, **Then** the thermal printer immediately prints the default receipt layout without opening a print dialog.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST process transactions against local IndexedDB when network latency exceeds 5s or connection is lost.
- **FR-002**: System MUST utilize Electron IPC to mirror local data to the host filesystem every 5 minutes.
- **FR-003**: System MUST execute `PRAGMA integrity_check` on the local SQLite backup during application initialization.
- **FR-004**: System MUST allow manual "Vacuuming" and "Backup" via a dedicated Desktop Status UI component.
- **FR-005**: System MUST provide a "Speed Print" capability that bypasses the OS print dialog for thermal receipts.
- **FR-006**: System MUST support localized Arabic UI elements with RTL support for receipts and status indicators.

### Key Entities

- **Transaction**: Represents a sale; includes items, totals, payment method, and synchronization status.
- **LocalBackup**: Represents a filesystem snapshot of the application state; includes timestamp and integrity status.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can process a sale in under 15 seconds, regardless of network status.
- **SC-002**: Data restoration from a filesystem backup must complete in under 3 seconds on application startup.
- **SC-003**: "Speed Print" physical activation must occur in under 1 second after user click.
- **SC-004**: System maintains 100% data consistency between IndexedDB and local filesystem backups.
