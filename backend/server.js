// backend/server.js
const express = require("express");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const app = express();
const PORT = 5000;

// Middleware
app.use(cors());
app.use(express.json());

// SQLite database
const dbPath = path.resolve(__dirname, "notes.db");
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("❌ Error opening database:", err.message);
  } else {
    console.log("✅ Connected to SQLite database at", dbPath);
  }
});

// Create table if not exists
db.serialize(() => {
  db.run(
    `CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    (err) => {
      if (err) {
        console.error("❌ Error creating notes table:", err.message);
      } else {
        console.log("📁 Notes table is ready.");
      }
    }
  );
});

// Helper to handle DB errors
const handleDbError = (res, err) => {
  console.error("DB error:", err.message);
  res.status(500).json({ error: "Database error", details: err.message });
};

// ----- ROUTES -----

// GET all notes
app.get("/api/notes", (req, res) => {
  const sql = "SELECT * FROM notes ORDER BY created_at DESC";
  db.all(sql, [], (err, rows) => {
    if (err) return handleDbError(res, err);
    res.json(rows);
  });
});

// GET single note by ID
app.get("/api/notes/:id", (req, res) => {
  const sql = "SELECT * FROM notes WHERE id = ?";
  db.get(sql, [req.params.id], (err, row) => {
    if (err) return handleDbError(res, err);
    if (!row) return res.status(404).json({ error: "Note not found" });
    res.json(row);
  });
});

// CREATE note
app.post("/api/notes", (req, res) => {
  const { title, content } = req.body;

  if (!title || !content) {
    return res.status(400).json({ error: "Title and content are required" });
  }

  const sql =
    "INSERT INTO notes (title, content, created_at, updated_at) VALUES (?, ?, datetime('now'), datetime('now'))";
  db.run(sql, [title, content], function (err) {
    if (err) return handleDbError(res, err);

    res.status(201).json({
      id: this.lastID,
      title,
      content,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  });
});

// UPDATE note
app.put("/api/notes/:id", (req, res) => {
  const { title, content } = req.body;
  const id = req.params.id;

  if (!title || !content) {
    return res.status(400).json({ error: "Title and content are required" });
  }

  const sql =
    "UPDATE notes SET title = ?, content = ?, updated_at = datetime('now') WHERE id = ?";
  db.run(sql, [title, content, id], function (err) {
    if (err) return handleDbError(res, err);
    if (this.changes === 0) {
      return res.status(404).json({ error: "Note not found" });
    }
    res.json({ message: "Note updated successfully" });
  });
});

// DELETE note
app.delete("/api/notes/:id", (req, res) => {
  const id = req.params.id;
  const sql = "DELETE FROM notes WHERE id = ?";

  db.run(sql, [id], function (err) {
    if (err) return handleDbError(res, err);
    if (this.changes === 0) {
      return res.status(404).json({ error: "Note not found" });
    }
    res.json({ message: "Note deleted successfully" });
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
