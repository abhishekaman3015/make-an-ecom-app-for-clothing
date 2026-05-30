-- Extend Sellers table with branding and verification fields
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS banner_url TEXT;
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS document_url TEXT;
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS admin_comment TEXT;

-- Extend Users table for profile fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Create Address Book table
CREATE TABLE IF NOT EXISTS addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  address_name TEXT NOT NULL, -- e.g. "Home", "Office"
  recipient_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address_line1 TEXT NOT NULL,
  address_line2 TEXT,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  postal_code TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'India',
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast user addresses lookups
CREATE INDEX IF NOT EXISTS idx_addresses_user ON addresses(user_id);
