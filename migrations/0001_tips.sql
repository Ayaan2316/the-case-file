-- Tips from the contact notepad (spec §12). created_at is Unix milliseconds; ip_hash is a salted
-- SHA-256 of the sender's IP (rate limiting without keeping the address).
CREATE TABLE IF NOT EXISTS tips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  ip_hash TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS tips_ip_time ON tips (ip_hash, created_at);
