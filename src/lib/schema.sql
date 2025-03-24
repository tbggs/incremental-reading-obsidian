CREATE TABLE IF NOT EXISTS extract (
  -- id INTEGER PRIMARY KEY,
  source TEXT NOT NULL,
  reference TEXT NOT NULL, -- pointer to the extract's location in the vault
  next_review TIMESTAMP,
  dismissed integer DEFAULT 0,
  CHECK(next_review IS NOT NULL OR dismissed = TRUE)
);

CREATE TABLE IF NOT EXISTS extract_review_log (
  -- review_id serial PRIMARY KEY,
  extract_id number REFERENCES extract(rowid),
  review_time TIMESTAMP NOT NULL
);
