import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './supabase.js'

const blank = {
  title: '', sourceName: '', sourceUrl: '', rating: 0, tags: '',
  ingredients: '', steps: '', notes: '', lastMade: '',
}

const hostOf = (url) => {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' }
}
const tagList = (r) => r.tags.split(',').map((t) => t.trim()).filter(Boolean)
const lines = (s) => s.split('\n').map((l) => l.trim()).filter(Boolean)
const Stars = ({ n }) => (
  <span className="stars" role="img" aria-label={`${n} out of 5`}>
    {'★'.repeat(n)}{'☆'.repeat(5 - n)}
  </span>
)

export default function App() {
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  if (session === undefined) return <main className="container py-5">Loading…</main>
  if (!session) return <Login />
  return <Box />
}

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError('Wrong email or password. Check them and try again.')
    setBusy(false)
  }

  return (
    <main className="container py-5" style={{ maxWidth: 420 }}>
      <h1 className="site-title mb-1">Recipe Box</h1>
      <p className="site-sub mb-4">Sign in to see the recipes.</p>
      <form onSubmit={submit} className="d-grid gap-3">
        <div>
          <label className="form-label" htmlFor="email">Email</label>
          <input id="email" className="form-control" type="email" required autoComplete="username"
            value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="form-label" htmlFor="pw">Password</label>
          <input id="pw" className="form-control" type="password" required autoComplete="current-password"
            value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <div className="alert alert-danger mb-0" role="alert">{error}</div>}
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </main>
  )
}

function Box() {
  const [recipes, setRecipes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [tag, setTag] = useState('')
  const [view, setView] = useState(null)
  const [edit, setEdit] = useState(null)
  const fileRef = useRef()
  const [importUrl, setImportUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [importErr, setImportErr] = useState('')

  const refresh = async () => {
    const { data, error } = await supabase
      .from('recipes').select('id, data').order('created_at', { ascending: false })
    if (error) setError(error.message)
    else { setError(''); setRecipes(data.map((r) => ({ ...blank, ...r.data, id: r.id }))) }
    setLoading(false)
  }
  useEffect(() => { refresh() }, [])

  const allTags = useMemo(() => [...new Set(recipes.flatMap(tagList))].sort(), [recipes])

  const shown = useMemo(() => {
    const q = query.toLowerCase()
    return recipes.filter((r) =>
      (!tag || tagList(r).includes(tag)) &&
      (!q || [r.title, r.tags, r.ingredients, r.sourceName].join(' ').toLowerCase().includes(q))
    )
  }, [recipes, query, tag])

  const save = async (r) => {
    const { id, ...fields } = r
    const res = id
      ? await supabase.from('recipes').update({ data: fields }).eq('id', id)
      : await supabase.from('recipes').insert({ data: fields })
    if (res.error) return alert(`Could not save: ${res.error.message}`)
    await refresh()
    setEdit(null)
    setView(null)
  }
  const remove = async (id) => {
    if (!confirm('Delete this recipe for everyone?')) return
    const { error } = await supabase.from('recipes').delete().eq('id', id)
    if (error) return alert(`Could not delete: ${error.message}`)
    await refresh()
    setView(null)
  }

  const importFromLink = async (e) => {
    e.preventDefault()
    setImporting(true)
    setImportErr('')
    const { data, error } = await supabase.functions.invoke('import-recipe', { body: { url: importUrl.trim() } })
    if (error) {
      let msg = 'Could not import that link.'
      try { msg = (await error.context.json()).error || msg } catch { /* keep default */ }
      setImportErr(msg)
    } else {
      setImportUrl('')
      setEdit({ ...blank, ...data })
    }
    setImporting(false)
  }

  const exportJson = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(recipes, null, 2)], { type: 'application/json' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: 'recipe-box.json' })
    a.click()
    URL.revokeObjectURL(url)
  }
  const importJson = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    try {
      const data = JSON.parse(await file.text())
      if (!Array.isArray(data)) throw new Error()
      const rows = data.filter((d) => d.title).map(({ id, ...fields }) => ({ data: { ...blank, ...fields } }))
      const { error } = await supabase.from('recipes').insert(rows)
      if (error) throw error
      await refresh()
    } catch { alert('That file is not a Recipe Box export.') }
    e.target.value = ''
  }

  if (edit) return <Editor initial={edit} onSave={save} onCancel={() => setEdit(null)} />
  if (view) return <Reader r={view} onBack={() => setView(null)} onEdit={() => setEdit(view)} onDelete={() => remove(view.id)} />

  return (
    <main className="container py-5">
      <header className="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-4">
        <div>
          <h1 className="site-title mb-0">Recipe Box</h1>
          <p className="site-sub mb-0">{recipes.length} recipes tried and kept</p>
        </div>
        <div className="d-flex gap-2">
          <button className="btn btn-primary" onClick={() => setEdit(blank)}>Add recipe</button>
          <button className="btn btn-outline-secondary" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </header>

      {error && <div className="alert alert-danger" role="alert">Could not load recipes: {error}</div>}

      <form className="mb-4" onSubmit={importFromLink}>
        <label className="form-label" htmlFor="import-url">Paste a recipe link to fill in the form</label>
        <div className="input-group">
          <input id="import-url" className="form-control" type="url" required placeholder="https://"
            value={importUrl} onChange={(e) => setImportUrl(e.target.value)} />
          <button className="btn btn-primary" disabled={importing}>{importing ? 'Reading page…' : 'Get recipe'}</button>
        </div>
        {importErr && <div className="text-danger mt-2" role="alert">{importErr}</div>}
      </form>

      <div className="row g-2 mb-4">
        <div className="col-md-6">
          <input className="form-control" type="search" placeholder="Search titles, ingredients, tags, sites"
            aria-label="Search recipes" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="col-md-3">
          <select className="form-select" aria-label="Filter by tag" value={tag} onChange={(e) => setTag(e.target.value)}>
            <option value="">All tags</option>
            {allTags.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div className="col-md-3 d-flex gap-2">
          <button className="btn btn-outline-secondary flex-fill" onClick={exportJson}>Export</button>
          <button className="btn btn-outline-secondary flex-fill" onClick={() => fileRef.current.click()}>Import</button>
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={importJson} />
        </div>
      </div>

      {loading ? (
        <p>Loading recipes…</p>
      ) : recipes.length === 0 ? (
        <div className="empty">
          <h2 className="h4">No recipes yet</h2>
          <p className="mb-3">Add the first one you've cooked. Paste the link so you can find the original later.</p>
          <button className="btn btn-primary" onClick={() => setEdit(blank)}>Add recipe</button>
        </div>
      ) : shown.length === 0 ? (
        <p>No recipes match that search.</p>
      ) : (
        <div className="row g-3">
          {shown.map((r) => (
            <div className="col-sm-6 col-lg-4" key={r.id}>
              <article className="recipe-card p-3" tabIndex={0} role="button"
                onClick={() => setView(r)} onKeyDown={(e) => e.key === 'Enter' && setView(r)}>
                <h2 className="card-title">{r.title}</h2>
                <div className="mb-2"><Stars n={r.rating} /></div>
                <div className="small text-secondary mb-2">{r.sourceName || hostOf(r.sourceUrl) || 'My own'}</div>
                <div className="d-flex flex-wrap gap-1">{tagList(r).map((t) => <span className="tag" key={t}>{t}</span>)}</div>
              </article>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}

function Reader({ r, onBack, onEdit, onDelete }) {
  return (
    <main className="container py-5">
      <button className="btn btn-link px-0 mb-3" onClick={onBack}>Back to all recipes</button>
      <h1>{r.title}</h1>
      <div className="d-flex flex-wrap align-items-center gap-3 mb-3">
        <Stars n={r.rating} />
        {r.sourceUrl && (
          <a className="source-link" href={r.sourceUrl} target="_blank" rel="noreferrer">
            {r.sourceName || hostOf(r.sourceUrl)}
          </a>
        )}
        {r.lastMade && <span className="text-secondary">Last made {r.lastMade}</span>}
      </div>
      <div className="d-flex flex-wrap gap-1 mb-4">{tagList(r).map((t) => <span className="tag" key={t}>{t}</span>)}</div>

      <div className="recipe-body">
        <h2 className="h4">Ingredients</h2>
        <ul>{lines(r.ingredients).map((l, i) => <li key={i}>{l}</li>)}</ul>
        <h2 className="h4 mt-4">Steps</h2>
        <ol>{lines(r.steps).map((l, i) => <li key={i}>{l}</li>)}</ol>
        {r.notes && (<><h2 className="h4 mt-4">My notes</h2><p style={{ whiteSpace: 'pre-wrap' }}>{r.notes}</p></>)}
      </div>

      <div className="d-flex gap-2 mt-4">
        <button className="btn btn-primary" onClick={onEdit}>Edit</button>
        <button className="btn btn-outline-danger" onClick={onDelete}>Delete</button>
      </div>
    </main>
  )
}

function Editor({ initial, onSave, onCancel }) {
  const [f, setF] = useState(initial)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const submit = (e) => { e.preventDefault(); onSave(f) }

  return (
    <main className="container py-5" style={{ maxWidth: 760 }}>
      <h1 className="mb-4">{f.id ? 'Edit recipe' : 'Add recipe'}</h1>
      <form onSubmit={submit} className="row g-3">
        <div className="col-12">
          <label className="form-label" htmlFor="title">Title</label>
          <input id="title" className="form-control" required value={f.title} onChange={set('title')} />
        </div>
        <div className="col-md-8">
          <label className="form-label" htmlFor="url">Link to the original</label>
          <input id="url" className="form-control" type="url" placeholder="https://" value={f.sourceUrl} onChange={set('sourceUrl')} />
        </div>
        <div className="col-md-4">
          <label className="form-label" htmlFor="site">Site or author</label>
          <input id="site" className="form-control" placeholder={hostOf(f.sourceUrl)} value={f.sourceName} onChange={set('sourceName')} />
        </div>
        <div className="col-md-4">
          <label className="form-label" htmlFor="rating">Rating</label>
          <select id="rating" className="form-select" value={f.rating} onChange={(e) => setF({ ...f, rating: +e.target.value })}>
            <option value={0}>Not rated</option>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} star{n > 1 && 's'}</option>)}
          </select>
        </div>
        <div className="col-md-4">
          <label className="form-label" htmlFor="made">Last made</label>
          <input id="made" className="form-control" type="date" value={f.lastMade} onChange={set('lastMade')} />
        </div>
        <div className="col-md-4">
          <label className="form-label" htmlFor="tags">Tags (comma separated)</label>
          <input id="tags" className="form-control" placeholder="dinner, vegetarian" value={f.tags} onChange={set('tags')} />
        </div>
        <div className="col-12">
          <label className="form-label" htmlFor="ing">Ingredients (one per line)</label>
          <textarea id="ing" className="form-control" rows={7} value={f.ingredients} onChange={set('ingredients')} />
        </div>
        <div className="col-12">
          <label className="form-label" htmlFor="steps">Steps (one per line)</label>
          <textarea id="steps" className="form-control" rows={7} value={f.steps} onChange={set('steps')} />
        </div>
        <div className="col-12">
          <label className="form-label" htmlFor="notes">What I'd change next time</label>
          <textarea id="notes" className="form-control" rows={3} value={f.notes} onChange={set('notes')} />
        </div>
        <div className="col-12 d-flex gap-2">
          <button className="btn btn-primary" type="submit">Save recipe</button>
          <button className="btn btn-outline-secondary" type="button" onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </main>
  )
}
