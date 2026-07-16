export const STOCK_REQUEST_STATUS = {
  PENDING:    'PENDING',
  APPROVED:   'APPROVED',
  REJECTED:   'REJECTED',
  DISPATCHED: 'DISPATCHED',
  RECEIVED:   'RECEIVED',
  CANCELLED:  'CANCELLED',
} as const;

export type StockRequestStatus = typeof STOCK_REQUEST_STATUS[keyof typeof STOCK_REQUEST_STATUS];

// Allowed transitions — State Machine
export const ALLOWED_TRANSITIONS: Record<StockRequestStatus, StockRequestStatus[]> = {
  PENDING:    ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED:   ['DISPATCHED', 'CANCELLED'],
  DISPATCHED: ['RECEIVED'],
  REJECTED:   [],
  RECEIVED:   [],
  CANCELLED:  [],
};
