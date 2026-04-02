-- Migration: add_loss_fields (SQLite-compatible)
-- Adds lossResponsibility and excessLossAmount to the Ticket table
-- These fields are required for the Profit-First Loss Absorption protocol

ALTER TABLE "Ticket" ADD COLUMN "lossResponsibility" TEXT;
ALTER TABLE "Ticket" ADD COLUMN "excessLossAmount" DECIMAL NOT NULL DEFAULT 0.00;
