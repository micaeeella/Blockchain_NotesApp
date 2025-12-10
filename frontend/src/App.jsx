// frontend/src/App.jsx
import { useEffect, useState } from "react";
import axios from "axios";
import { FiEdit2, FiTrash2 } from "react-icons/fi";

const API_URL = "http://localhost:5000/api/notes";

function App() {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [search, setSearch] = useState("");

  // Toast State
  const [toast, setToast] = useState(null);

  // Toast handler
  const showToast = (message, type = "success") => {
    setToast({ message, type });

    setTimeout(() => {
      setToast(null);
    }, 2500);
  };

  // Fetch Notes
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

        showToast("Note updated successfully", "success");
      } else {
        await axios.post(API_URL, {
          title: title.trim(),
          content: content.trim(),
        });

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

  const handleDelete = async (id) => {
    try {
      await axios.delete(`${API_URL}/${id}`);
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

  const [deleteConfirm, setDeleteConfirm] = useState(null);


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
          </div>
        </header>

        {/* ERROR BANNER */}
        {error && <div className="alert alert-error">{error}</div>}

        <main className="layout">

          {/* LEFT SIDE – FORM */}
          <section className="card form-card">
            <h2>{isEditing ? "Edit Note" : "Create a Note"}</h2>
            <p className="helper-text">
              {isEditing
                ? "Make your changes and click save."
                : "Write down your thoughts, reminders, or ideas."}
            </p>

            <form onSubmit={handleSubmit} className="note-form">

              {/* TITLE */}
              <label className="field">
                <span>Title</span>
                <input
                  type="text"
                  placeholder="e.g. Meeting Notes, Personal Tasks..."
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>

              {/* CONTENT */}
              <label className="field">
                <span>Content</span>
                <textarea
                  rows="7"
                  placeholder="Start writing here..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                />
              </label>

              {/* ACTION BUTTONS */}
              <div className="form-actions">
                <button type="submit" className="btn primary" disabled={saving}>
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

          {/* RIGHT SIDE – NOTES LIST */}
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
                          onClick={() => setDeleteConfirm(note)}
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
            <div className="modal card delete-modal">
              <h3>Delete this note?</h3>
              <p className="modal-text">
                This action cannot be undone. Are you sure you want to delete{" "}
                <strong>{deleteConfirm.title}</strong>?
              </p>

              <div className="modal-actions">
                <button
                  className="btn danger"
                  onClick={() => handleDelete(deleteConfirm.id)}
                >
                  Delete
                </button>

                <button
                  className="btn ghost"
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
