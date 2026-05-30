-- Make password_hash nullable for OAuth-only users
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- Add google_id field
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT UNIQUE;
