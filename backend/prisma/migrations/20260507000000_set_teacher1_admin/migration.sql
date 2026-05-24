-- Data migration: ensure the demo admin teacher account has isAdmin = true.
-- This runs automatically on deploy and is idempotent (safe to re-apply).
-- The seed sets this flag during local development, but the seed does not
-- run automatically in production — only migrations do.

UPDATE "User"
SET    "isAdmin" = true
WHERE  "email"   = 'teacher1@demo.com';
