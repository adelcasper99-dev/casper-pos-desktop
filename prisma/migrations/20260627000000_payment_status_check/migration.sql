-- PostgreSQL-only check for Ticket.paymentStatus
-- This adds a strict check constraint to ensure paymentStatus is one of the allowed Zod enum values.

DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'Ticket') THEN
    ALTER TABLE "Ticket" DROP CONSTRAINT IF EXISTS "ticket_payment_status_check";
    ALTER TABLE "Ticket" ADD CONSTRAINT "ticket_payment_status_check" CHECK ("paymentStatus" IN ('unpaid', 'partial', 'paid', 'refunded'));
  END IF;
END $$;
