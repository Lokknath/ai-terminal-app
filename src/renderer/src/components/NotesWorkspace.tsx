import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Check, Copy, FileText, NotebookPen, Plus, Search, Trash2, Undo2 } from 'lucide-react'

interface Note {
  id: string
  title: string
  content: string
  updatedAt: number
}

const storageKey = 'nexus-notes-v1'

function makeNote(): Note {
  return { id: crypto.randomUUID(), title: 'Untitled note', content: '', updatedAt: Date.now() }
}

function readNotes(): Note[] {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey) || '[]')
    if (Array.isArray(raw)) {
      const notes = raw.filter(
        (item): item is Note =>
          item &&
          typeof item.id === 'string' &&
          typeof item.title === 'string' &&
          typeof item.content === 'string' &&
          typeof item.updatedAt === 'number'
      )
      if (notes.length) return notes.slice(0, 100)
    }
  } catch {
    // Start a new local notebook if an older saved value is malformed.
  }
  return [makeNote()]
}

function formatTimestamp(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(timestamp)
}

export default function NotesWorkspace(): JSX.Element {
  const [notes, setNotes] = useState<Note[]>(readNotes)
  const [selectedId, setSelectedId] = useState(() => notes[0]?.id || '')
  const [query, setQuery] = useState('')
  const [saveState, setSaveState] = useState<'saving' | 'saved' | 'error' | 'limit' | 'copy-error'>(
    'saved'
  )
  const [deleted, setDeleted] = useState<{ note: Note; replacementId?: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const notesRef = useRef(notes)

  useLayoutEffect(() => {
    notesRef.current = notes
  }, [notes])
  const selected = notes.find((note) => note.id === selectedId) || notes[0]
  const filtered = useMemo(
    () =>
      notes
        .filter((note) =>
          `${note.title} ${note.content}`.toLowerCase().includes(query.toLowerCase())
        )
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [notes, query]
  )

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(notes))
        setSaveState('saved')
      } catch {
        setSaveState('error')
      }
    }, 350)
    return () => clearTimeout(timer)
  }, [notes])

  useEffect(() => {
    const flush = (): void => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(notesRef.current))
      } catch {
        // The visible save state already reports storage failures while mounted.
      }
    }
    window.addEventListener('pagehide', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      flush() // Switching workspace modes can unmount before the debounce fires.
    }
  }, [])

  const update = (patch: Partial<Note>): void => {
    if (!selected) return
    setSaveState('saving')
    setDeleted(null)
    setNotes((current) =>
      current.map((note) =>
        note.id === selected.id ? { ...note, ...patch, updatedAt: Date.now() } : note
      )
    )
  }

  const create = (): void => {
    if (notes.length >= 100) {
      setSaveState('limit')
      return
    }
    const note = makeNote()
    setSaveState('saving')
    setNotes((current) => [note, ...current])
    setSelectedId(note.id)
    setDeleted(null)
  }

  const remove = (): void => {
    if (!selected) return
    setSaveState('saving')
    const remaining = notes.filter((note) => note.id !== selected.id)
    if (remaining.length) {
      setDeleted({ note: selected })
      setNotes(remaining)
      setSelectedId(remaining[0].id)
    } else {
      const replacement = makeNote()
      setDeleted({ note: selected, replacementId: replacement.id })
      setNotes([replacement])
      setSelectedId(replacement.id)
    }
  }

  const undoDelete = (): void => {
    if (!deleted) return
    setSaveState('saving')
    setNotes((current) => [
      deleted.note,
      ...current.filter((note) => note.id !== deleted.replacementId)
    ])
    setSelectedId(deleted.note.id)
    setDeleted(null)
  }

  const copy = async (): Promise<void> => {
    if (!selected) return
    try {
      await window.api.writeClipboardText(`# ${selected.title}\n\n${selected.content}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      setSaveState('copy-error')
    }
  }

  const words = selected?.content.trim().split(/\s+/).filter(Boolean).length || 0

  return (
    <main className="studio-workspace notes-workspace">
      <div className="studio-page-heading">
        <div>
          <span className="section-overline">IDEAS · PROJECT CONTEXT</span>
          <h1>Notes</h1>
          <p>
            Keep a thought beside your terminals. Your notebook saves automatically on this device.
          </p>
        </div>
        <button className="studio-primary" type="button" onClick={create}>
          <Plus size={16} /> New note
        </button>
      </div>
      <div className="notes-layout">
        <aside className="studio-sidepanel notes-list" aria-label="Notebook">
          <label className="notes-search">
            <Search size={15} />
            <span className="sr-only">Search notes</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search notes"
            />
          </label>
          <div className="studio-side-heading">
            <NotebookPen size={16} />
            <strong>My notebook</strong>
            <span>{notes.length}</span>
          </div>
          {filtered.length ? (
            filtered.map((note) => (
              <button
                type="button"
                key={note.id}
                className={`note-list-item${note.id === selected?.id ? ' is-active' : ''}`}
                onClick={() => setSelectedId(note.id)}
              >
                <strong>{note.title || 'Untitled note'}</strong>
                <span>{note.content.trim().split('\n').find(Boolean) || 'Start writing…'}</span>
                <small>{formatTimestamp(note.updatedAt)}</small>
              </button>
            ))
          ) : (
            <p className="studio-muted">No notes match your search.</p>
          )}
        </aside>
        <section className="studio-card note-editor" aria-label="Note editor">
          <div className="note-editor-toolbar">
            <div className="note-save-state" role="status">
              {saveState === 'saved' ? (
                <>
                  <Check size={14} /> Saved locally
                </>
              ) : saveState === 'saving' ? (
                'Saving…'
              ) : saveState === 'limit' ? (
                'Notebook is full (100 notes).'
              ) : saveState === 'copy-error' ? (
                'Could not copy this note.'
              ) : (
                'Could not save. Check available storage.'
              )}
            </div>
            <div className="note-actions">
              <button type="button" onClick={() => void copy()} title="Copy note as Markdown">
                <Copy size={15} /> {copied ? 'Copied' : 'Copy'}
              </button>
              <button type="button" onClick={remove} title="Delete note">
                <Trash2 size={15} /> Delete
              </button>
            </div>
          </div>
          {deleted && (
            <div className="studio-feedback is-success" role="status">
              Note deleted.{' '}
              <button type="button" onClick={undoDelete}>
                <Undo2 size={14} /> Undo
              </button>
            </div>
          )}
          <label className="sr-only" htmlFor="note-title">
            Note title
          </label>
          <input
            id="note-title"
            className="note-title"
            value={selected?.title || ''}
            onChange={(event) => update({ title: event.target.value })}
            placeholder="Untitled note"
            maxLength={120}
          />
          <div className="note-meta">
            <FileText size={14} /> Edited {selected ? formatTimestamp(selected.updatedAt) : 'now'}{' '}
            <span>·</span> {words} words
          </div>
          <label className="sr-only" htmlFor="note-content">
            Note content
          </label>
          <textarea
            id="note-content"
            className="note-content"
            value={selected?.content || ''}
            onChange={(event) => update({ content: event.target.value })}
            placeholder={
              'Start writing…\n\nIdeas, TODOs, commands, and project context belong here.'
            }
            spellCheck
          />
        </section>
      </div>
    </main>
  )
}
