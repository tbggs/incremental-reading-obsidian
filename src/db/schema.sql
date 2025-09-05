CREATE TABLE IF NOT EXISTS snippet (
  id INTEGER NOT NULL PRIMARY KEY, -- alias for rowid
  -- source TEXT NOT NULL, -- use source property in the snippet instead so Obsidian updates it properly
  reference TEXT NOT NULL UNIQUE, -- pointer to the snippet's location in the vault
  next_review INTEGER, -- unix timestamp
  dismissed integer DEFAULT 0
  -- CHECK(next_review IS NOT NULL OR dismissed = TRUE) -- Enable this after testing
);

-- Log of all snippet reviews
CREATE TABLE IF NOT EXISTS snippet_review (
  id INTEGER NOT NULL PRIMARY KEY,
  snippet_id number REFERENCES snippet(rowid),
  review_time INTEGER NOT NULL,
  reference TEXT NOT NULL
);
