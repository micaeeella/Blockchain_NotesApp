// frontend/src/App.jsx
import { useEffect, useState } from "react";
import axios from "axios";
import { FiEdit2, FiTrash2 } from "react-icons/fi";
import * as CSL from "@emurgo/cardano-serialization-lib-browser";

const API_URL = "http://localhost:5000/api/notes";
const WALLET_API_URL = "http://localhost:5000/api/wallet";
const TX_API_URL = "http://localhost:5000/api/tx";

/* ----------------- Helper: hex <-> bytes ----------------- */
function hexToBytes(hex) {
  return Uint8Array.from(hex.match(/.{1,2}/g).map((b) => parseInt(b, 16)));
}

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}

/* ----------------------------------------------------------
   Build UNSIGNED Tx BODY hex (1 ADA self-send)
   ---------------------------------------------------------- */
async function buildUnsignedSelfSendTxBodyHex(utxos, fromAddrBech32) {
  const fromAddress = CSL.Address.from_bech32(fromAddrBech32);
  const sendAmount = CSL.BigNum.from_str("1000000"); // 1 ADA

  // Preview-ish protocol params (good for demo)
  const linearFee = CSL.LinearFee.new(
    CSL.BigNum.from_str("44"),
    CSL.BigNum.from_str("155381")
  );
  const coinsPerUtxoByte = CSL.BigNum.from_str("4310");
  const poolDeposit = CSL.BigNum.from_str("500000000");
  const keyDeposit = CSL.BigNum.from_str("2000000");

  const cfg = CSL.TransactionBuilderConfigBuilder.new()
    .fee_algo(linearFee)
    .coins_per_utxo_byte(coinsPerUtxoByte)
    .pool_deposit(poolDeposit)
    .key_deposit(keyDeposit)
    .max_tx_size(16384)
    .max_value_size(5000)
    .build();

  const builder = CSL.TransactionBuilder.new(cfg);

  const cslUtxos = CSL.TransactionUnspentOutputs.new();

  for (const utxo of utxos) {
    const txHash = CSL.TransactionHash.from_bytes(hexToBytes(utxo.tx_hash));
    const index = utxo.output_index;

    const amount = utxo.amount.find((a) => a.unit === "lovelace");
    if (!amount) continue;

    const input = CSL.TransactionInput.new(txHash, index);
    const output = CSL.TransactionOutput.new(
      fromAddress,
      CSL.Value.new(CSL.BigNum.from_str(amount.quantity))
    );

    cslUtxos.add(CSL.TransactionUnspentOutput.new(input, output));
  }

  builder.add_inputs_from(
    cslUtxos,
    CSL.CoinSelectionStrategyCIP2.LargestFirst
  );

  // self-send output
  builder.add_output(
    CSL.TransactionOutput.new(
      fromAddress,
      CSL.Value.new(sendAmount)
    )
  );

  // change back to same address if needed
  builder.add_change_if_needed(fromAddress);

  const txBody = builder.build(); // UNSIGNED BODY
  return bytesToHex(txBody.to_bytes());
}

/* ========================================================= */

function App() {
  // Notes
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [search, setSearch] = useState("");

  // Toast
  const [toast, setToast] = useState(null);

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // Wallet
  const [walletApi, setWalletApi] = useState(null);
  const [walletAddress, setWalletAddress] = useState("");
  const [walletAda, setWalletAda] = useState(null);
  const [walletLoading, setWalletLoading] = useState(false);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2500);
  };

  /* ------------------- Fetch notes ------------------- */
  const fetchNotes = async () => {
    try {
      setLoading(true);
      const res = await axios.get(API_URL);
      setNotes(res.data);
      setError("");
    } catch (err) {
      console.error(err);
      setError("Unable to load notes. Please ensure the backend is running.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotes();
  }, []);

  const resetForm = () => {
    setTitle("");
    setContent("");
    setIsEditing(false);
    setEditingId(null);
  };

  /* ------------------- Wallet connect ------------------- */
  const connectWallet = async () => {
    try {
      if (!window.cardano?.lace) {
        showToast("Lace wallet extension not detected", "danger");
        return;
      }

      const api = await window.cardano.lace.enable();
      setWalletApi(api);

      const addr =
        "addr_test1qqar6m6kk3xkjhwnf5zanwrf7glmjrz2edsp3ucasjz25zua96xxg37tr4zypfygdj9yhwpq0gj6zzk0p082w66657pqrm2pv3";

      setWalletAddress(addr);
      showToast("Wallet connected", "success");
      await refreshWalletSummary(addr);
    } catch (err) {
      console.error(err);
      showToast("Failed to connect Lace wallet", "danger");
    }
  };

  const refreshWalletSummary = async (addressOverride) => {
    const addr = addressOverride || walletAddress;
    if (!addr) return;

    try {
      setWalletLoading(true);
      const res = await axios.get(`${WALLET_API_URL}/${addr}/summary`);
      setWalletAda(res.data.ada);
    } catch (err) {
      console.error(err);
      showToast("Failed to load wallet summary", "danger");
    } finally {
      setWalletLoading(false);
    }
  };

  /* ------------------- REAL blockchain tx ------------------- */
  const sendBlockchainTx = async (label) => {
    if (!walletApi || !walletAddress) {
      showToast("Connect Lace wallet first", "danger");
      return;
    }

    try {
      // 1) Fetch UTxOs from backend
      const utxoRes = await axios.get(`${WALLET_API_URL}/${walletAddress}/utxos`);
      const utxos = utxoRes.data;

      // 2) Build UNSIGNED TxBody hex
      const unsignedBodyHex = await buildUnsignedSelfSendTxBodyHex(
        utxos,
        walletAddress
      );

      // ❗ IMPORTANT STEP — wrap TxBody into full Transaction for Lace
      const txBody = CSL.TransactionBody.from_bytes(hexToBytes(unsignedBodyHex));
      const emptyWitnesses = CSL.TransactionWitnessSet.new();

      // Create minimal transaction that Lace will sign
      const tx = CSL.Transaction.new(txBody, emptyWitnesses, undefined);
      const txHexForLace = bytesToHex(tx.to_bytes());

      // 3) Lace pops up & signs (NOW IT WILL POP UP)
      const witnessHex = await walletApi.signTx(txHexForLace, true);

      // 4) Rebuild full signed transaction
      const witnessSet = CSL.TransactionWitnessSet.from_bytes(
        hexToBytes(witnessHex)
      );

      const signedTx = CSL.Transaction.new(txBody, witnessSet, undefined);
      const signedTxHex = bytesToHex(signedTx.to_bytes());

      // 5) Submit to backend / Blockfrost
      const submitRes = await axios.post(`${TX_API_URL}/submit`, {
        signedTxHex,
      });

      const txHash = submitRes.data.txHash || "submitted";

      showToast(`Tx sent: ${txHash.slice(0, 10)}…`, "success");

      // 6) Refresh ADA
      await refreshWalletSummary();
    } catch (err) {
      console.error("sendBlockchainTx error:", err);
      showToast("Blockchain transaction failed", "danger");
    }
  };


  /* ------------------- CRUD + chain ------------------- */
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!title.trim() || !content.trim()) {
      setError("Please fill in both title and content.");
      return;
    }

    setSaving(true);

    try {
      if (isEditing && editingId !== null) {
        await axios.put(`${API_URL}/${editingId}`, {
          title: title.trim(),
          content: content.trim(),
        });
        await sendBlockchainTx("update");
        showToast("Note updated successfully", "success");
      } else {
        await axios.post(API_URL, {
          title: title.trim(),
          content: content.trim(),
        });
        await sendBlockchainTx("create");
        showToast("Note added successfully", "success");
      }

      await fetchNotes();
      resetForm();
      setError("");
    } catch (err) {
      console.error(err);
      showToast("Failed to save note", "danger");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (note) => {
    setTitle(note.title);
    setContent(note.content);
    setIsEditing(true);
    setEditingId(note.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const askDelete = (note) => {
    setDeleteConfirm(note);
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await axios.delete(`${API_URL}/${deleteConfirm.id}`);
      await sendBlockchainTx("delete");
      await fetchNotes();
      showToast("Note deleted", "danger");
    } catch (err) {
      console.error(err);
      showToast("Failed to delete note", "danger");
    } finally {
      setDeleteConfirm(null);
    }
  };

  const filteredNotes = notes.filter((note) => {
    const q = search.toLowerCase();
    return (
      note.title.toLowerCase().includes(q) ||
      note.content.toLowerCase().includes(q)
    );
  });

  /* ------------------- UI ------------------- */
  return (
    <div className="app-root">
      <div className="app-wrapper">
        {/* HEADER */}
        <header className="header">
          <div className="branding">
            <h1>Note Buddy</h1>
            <p className="subtitle">
              Your friendly companion for organization, clarity, and ideas.
            </p>

            {walletAddress ? (
              <>
                <p style={{ marginTop: "12px", fontSize: "0.9rem" }}>
                  Connected:
                  <code style={{ marginLeft: 4 }}>
                    {walletAddress.slice(0, 10)}…{walletAddress.slice(-6)}
                  </code>
                </p>
                <p style={{ fontSize: "0.9rem", margin: "2px 0 10px" }}>
                  {walletLoading
                    ? "Loading ADA…"
                    : walletAda != null
                      ? `${walletAda} ADA (preview)`
                      : "No balance yet"}
                </p>
                <button
                  type="button"
                  className="btn small ghost"
                  onClick={() => refreshWalletSummary()}
                >
                  Refresh
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn primary"
                style={{ marginTop: "12px" }}
                onClick={connectWallet}
              >
                Connect Lace Wallet
              </button>
            )}
          </div>
        </header>

        {error && <div className="alert alert-error">{error}</div>}

        <main className="layout">
          {/* LEFT – FORM */}
          <section className="card form-card">
            <h2>{isEditing ? "Edit Note" : "Create a Note"}</h2>
            <p className="helper-text">
              {isEditing
                ? "Make your changes and click save."
                : "Write down your thoughts, reminders, or ideas."}
            </p>

            <form onSubmit={handleSubmit} className="note-form">
              <label className="field">
                <span>Title</span>
                <input
                  type="text"
                  placeholder="e.g. Meeting Notes, Personal Tasks..."
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>

              <label className="field">
                <span>Content</span>
                <textarea
                  rows="7"
                  placeholder="Start writing here..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                />
              </label>

              <div className="form-actions">
                <button
                  type="submit"
                  className="btn primary"
                  disabled={saving}
                >
                  {saving
                    ? isEditing
                      ? "Saving..."
                      : "Adding..."
                    : isEditing
                      ? "Save Changes"
                      : "Add Note"}
                </button>

                {isEditing && (
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={resetForm}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </section>

          {/* RIGHT – NOTES LIST */}
          <section className="notes-section">
            <div className="notes-header">
              <h2>Your Notes</h2>
              <input
                type="text"
                className="search-input"
                placeholder="Search notes..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {loading ? (
              <p className="muted">Loading notes...</p>
            ) : filteredNotes.length === 0 ? (
              <div className="empty-state">
                <p className="empty-title">Nothing here yet</p>
                <p className="empty-subtitle">
                  Notes you create will appear in this space.
                </p>
              </div>
            ) : (
              <div className="notes-grid">
                {filteredNotes.map((note) => (
                  <article key={note.id} className="card note-card">
                    <h3 className="note-title">{note.title}</h3>
                    <p className="note-content">
                      {note.content.length > 180
                        ? note.content.slice(0, 180) + "..."
                        : note.content}
                    </p>

                    <div className="note-footer">
                      <span className="note-date">
                        {note.updated_at &&
                          "Updated " +
                          new Date(note.updated_at).toLocaleString()}
                      </span>

                      <div className="note-actions">
                        <button
                          className="icon-btn"
                          title="Edit"
                          onClick={() => handleEdit(note)}
                        >
                          <FiEdit2 size={18} />
                        </button>
                        <button
                          className="icon-btn danger"
                          title="Delete"
                          onClick={() => askDelete(note)}
                        >
                          <FiTrash2 size={18} />
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </main>

        {/* DELETE CONFIRMATION MODAL */}
        {deleteConfirm && (
          <div className="modal-overlay">
            <div className="card delete-modal">
              <h3>Delete this note?</h3>
              <p className="modal-text">
                This action cannot be undone. Are you sure you want to delete{" "}
                <strong>{deleteConfirm.title}</strong>?
              </p>
              <div className="modal-actions">
                <button
                  className="btn danger"
                  type="button"
                  onClick={confirmDelete}
                >
                  Delete
                </button>
                <button
                  className="btn ghost"
                  type="button"
                  onClick={() => setDeleteConfirm(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TOAST */}
        {toast && (
          <div className={`toast toast-${toast.type}`}>
            {toast.message}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
