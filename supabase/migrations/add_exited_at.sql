-- Migration: Add exited_at column to access_logs table
ALTER TABLE access_logs
ADD COLUMN IF NOT EXISTS exited_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN access_logs.exited_at IS 'Timestamp when the faculty member exited the laboratory';
