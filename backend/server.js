// backend/server.js
const express = require("express");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
require("dotenv").config();

const {
  getAddressSummary,
  getAddressUtxos,
  submitTx,
} = require("./blockchainService");

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

// SQLite
const dbPath = path.resolve(__dirname, "notes.db");
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("❌ Error opening database:", err.message);
  } else {
    console.log("✅ Connected to SQLite database at", dbPath);
  }
});

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

// Helper
const handleDbError = (res, err) => {
  console.error("DB error:", err.message);
  res.status(500).json({ error: "Database error", details: err.message });
};

// ========== NOTES CRUD ==========

app.get("/api/notes", (req, res) => {
  db.all(
    "SELECT * FROM notes ORDER BY created_at DESC",
    [],
    (err, rows) => {
      if (err) return handleDbError(res, err);
      res.json(rows);
    }
  );
});

app.get("/api/notes/:id", (req, res) => {
  db.get(
    "SELECT * FROM notes WHERE id = ?",
    [req.params.id],
    (err, row) => {
      if (err) return handleDbError(res, err);
      if (!row) return res.status(404).json({ error: "Note not found" });
      res.json(row);
    }
  );
});

app.post("/api/notes", (req, res) => {
  const { title, content } = req.body;
  if (!title || !content) {
    return res.status(400).json({ error: "Title and content are required" });
  }

  db.run(
    "INSERT INTO notes (title, content, created_at, updated_at) VALUES (?, ?, datetime('now'), datetime('now'))",
    [title, content],
    function (err) {
      if (err) return handleDbError(res, err);
      res.status(201).json({
        id: this.lastID,
        title,
        content,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
  );
});

app.put("/api/notes/:id", (req, res) => {
  const { title, content } = req.body;
  const id = req.params.id;

  if (!title || !content) {
    return res.status(400).json({ error: "Title and content are required" });
  }

  db.run(
    "UPDATE notes SET title = ?, content = ?, updated_at = datetime('now') WHERE id = ?",
    [title, content, id],
    function (err) {
      if (err) return handleDbError(res, err);
      if (this.changes === 0) {
        return res.status(404).json({ error: "Note not found" });
      }
      res.json({ message: "Note updated successfully" });
    }
  );
});

app.delete("/api/notes/:id", (req, res) => {
  const id = req.params.id;
  db.run("DELETE FROM notes WHERE id = ?", [id], function (err) {
    if (err) return handleDbError(res, err);
    if (this.changes === 0) {
      return res.status(404).json({ error: "Note not found" });
    }
    res.json({ message: "Note deleted successfully" });
  });
});


// ========== BLOCKCHAIN INTEGRATION ==========

// Wallet summary (ADA + utxos) via Blockfrost
app.get("/api/wallet/:address/summary", async (req, res) => {
  try {
    const summary = await getAddressSummary(req.params.address);
    res.json(summary);
  } catch (err) {
    console.error("Blockfrost summary error:", err);
    res.status(500).json({ error: "Failed to fetch wallet summary" });
  }
});

// UTxOs (raw) for building tx on frontend
app.get("/api/wallet/:address/utxos", async (req, res) => {
  try {
    const utxos = await getAddressUtxos(req.params.address);
    res.json(utxos);
  } catch (err) {
    console.error("Blockfrost utxos error:", err);
    res.status(500).json({ error: "Failed to fetch UTxOs" });
  }
});

// Submit signed tx from frontend (hex string)
app.post("/api/tx/submit", async (req, res) => {
  try {
    const { signedTxHex } = req.body;
    if (!signedTxHex) {
      return res.status(400).json({ error: "signedTxHex is required" });
    }

    const txHash = await submitTx(signedTxHex);
    res.json({ txHash });
  } catch (err) {
    console.error("Blockfrost submit error:", err);
    res.status(500).json({ error: "Failed to submit transaction" });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
