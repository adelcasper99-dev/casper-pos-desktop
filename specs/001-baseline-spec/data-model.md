# Data Model: Baseline Casper POS Desktop

## Entities

### Transaction (IndexedDB & SQLite)

- `id`: UUID (Primary Key)
- `orderNumber`: String (Unique)
- `items`: JSON (Array of {id, name, price, quantity, tax})
- `totalAmount`: Decimal
- `paymentMethod`: Enum (CASH, CARD, MULTI)
- `timestamp`: DateTime
- `syncStatus`: Enum (PENDING, SYNCED, ERROR)
- `offlineFlag`: Boolean (True if created without network)

### LocalBackup (Filesystem Metadata)

- `id`: Int (Auto-increment)
- `backupPath`: String (Absolute path to .sqlite file)
- `createdAt`: DateTime
- `fileSize`: Int (Bytes)
- `integrityStatus`: Enum (VALID, CORRUPT, UNCHECKED)
- `lastRestoredAt`: DateTime (Optional)

## Relationships

- A **LocalBackup** contains a snapshot of multiple **Transactions**.
- **Transactions** are synced one-to-one with the cloud.

## Validation Rules

- `totalAmount` MUST be greater than zero.
- `items` array MUST NOT be empty.
- `syncStatus` MUST be PENDING for all new offline transactions.
