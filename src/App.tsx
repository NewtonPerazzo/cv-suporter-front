import { useEffect, useRef, useState } from 'react'
import { ArrowUp, ArrowUpRight, Check, ChevronDown, Clock3, FileText, Layers3, LoaderCircle, MessageSquare, Plus, Sparkles, X } from 'lucide-react'
import AnswerContent from './AnswerContent'
import { ApiError, request, type Answer, type Resume, type SessionState, type Source } from './api'

type Session = { token: string; deadline: number }
type Message = { id: string; role: 'user' | 'assistant'; text: string; sources?: Source[] }
const storageKey = 'cv-supporter-session-v1'
const suggestions = [
  { title: 'Compare candidates', text: 'Compare the skills and experience of the selected candidates.', icon: Layers3 },
  { title: 'Find the right skills', text: 'Which selected candidates have Python experience? Cite the evidence.', icon: Sparkles },
  { title: 'Identify missing information', text: 'What information is missing from these resumes that I should ask about?', icon: MessageSquare },
]

export default function App() {
  const [resumesExpanded, setResumesExpanded] = useState(true)
  const [session, setSession] = useState<Session | null>(null)
  const [resumes, setResumes] = useState<Resume[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [expired, setExpired] = useState(false)
  const [restoring, setRestoring] = useState(true)
  const [now, setNow] = useState(Date.now())
  const input = useRef<HTMLInputElement>(null)
  const textarea = useRef<HTMLTextAreaElement>(null)
  const bottom = useRef<HTMLDivElement>(null)
  const generation = useRef(0)
  const controller = useRef<AbortController | null>(null)

  function applyState(token: string, state: SessionState) {
    const deadline = Date.now() + Date.parse(state.expires_at) - Date.parse(state.server_time)
    setSession({ token, deadline })
    setNow(Date.now())
    setResumes(state.documents)
    setSelected(state.documents.map(doc => doc.id))
    sessionStorage.setItem(storageKey, token)
  }

  function clearSession(isExpired: boolean) {
    generation.current += 1
    controller.current?.abort()
    setSession(null)
    setResumes([])
    setResumesExpanded(true)
    setSelected([])
    setMessages([])
    setQuestion('')
    setBusy('')
    setError('')
    setExpired(isExpired)
    sessionStorage.removeItem(storageKey)
    if (input.current) input.current.value = ''
  }

  useEffect(() => {
    const abort = new AbortController()
    const token = sessionStorage.getItem(storageKey)
    if (!token) { setRestoring(false); return }
    request<SessionState>('/session', token, { signal: abort.signal })
      .then(state => applyState(token, state))
      .catch(err => {
        if (abort.signal.aborted) return
        if (err instanceof ApiError && err.status === 410) clearSession(true)
        else setError('Could not restore your session. Check your connection and reload.')
      })
      .finally(() => { if (!abort.signal.aborted) setRestoring(false) })
    return () => abort.abort()
  }, [])

  useEffect(() => {
    if (!session) return
    const tick = () => {
      setNow(Date.now())
      if (Date.now() >= session.deadline) {
        clearSession(true)
        void request('/session', session.token, { method: 'DELETE' }).catch(() => {})
      }
    }
    const timer = window.setInterval(tick, 500)
    window.addEventListener('focus', tick)
    tick()
    return () => { clearInterval(timer); window.removeEventListener('focus', tick) }
  }, [session])

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [messages, busy])

  function handleError(err: unknown) {
    if (err instanceof ApiError && err.status === 410) clearSession(true)
    else if (!(err instanceof DOMException && err.name === 'AbortError'))
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
  }

  async function upload(files: File[]) {
    if (!files.length || busy || restoring) return
    if (files.length + resumes.length > 10 || files.some(file => !file.name.toLowerCase().endsWith('.pdf') || file.size > 5 * 1024 * 1024) || files.reduce((sum, f) => sum + f.size, 0) > 20 * 1024 * 1024) {
      setError('Upload up to 10 PDFs, 5 MB each and 20 MB total.'); return
    }
    const current = generation.current
    controller.current = new AbortController()
    const signal = controller.current.signal
    setBusy('Reading your resumes…')
    setError('')
    setExpired(false)
    try {
      let active = session
      if (!active) {
        const state = await request<SessionState & { token: string }>('/sessions', undefined, { method: 'POST', signal })
        if (current !== generation.current) return
        applyState(state.token, state)
        active = { token: state.token, deadline: Date.now() + Date.parse(state.expires_at) - Date.parse(state.server_time) }
      }
      const body = new FormData()
      files.forEach(file => body.append('files', file))
      const state = await request<SessionState>('/documents', active.token, { method: 'POST', body, signal })
      if (current !== generation.current) return
      applyState(active.token, state)
      setResumesExpanded(true)
    } catch (err) {
      if (current === generation.current) handleError(err)
    } finally {
      if (current === generation.current) setBusy('')
      if (input.current) input.current.value = ''
    }
  }

  async function send(event: React.FormEvent) {
    event.preventDefault()
    if (!question.trim() || !session || !selected.length || busy) return
    const current = generation.current
    controller.current = new AbortController()
    setMessages(previous => [...previous, { id: crypto.randomUUID(), role: 'user', text: question.trim() }])
    setBusy('Finding evidence in your resumes…')
    setError('')
    const text = question.trim()
    setQuestion('')
    try {
      const answer = await request<Answer>('/messages', session.token, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: text, document_ids: selected }), signal: controller.current.signal,
      })
      if (current === generation.current) setMessages(previous => [...previous, {
        id: crypto.randomUUID(), role: 'assistant', text: answer.answer, sources: answer.sources,
      }])
    } catch (err) {
      if (current === generation.current) { setQuestion(text); handleError(err) }
    } finally {
      if (current === generation.current) setBusy('')
    }
  }

  async function reset() {
    if (!session) { clearSession(false); return }
    setBusy('Clearing your workspace…')
    try {
      await request('/session', session.token, { method: 'DELETE' })
      clearSession(false)
    } catch (err) { handleError(err); setBusy('') }
  }

  const seconds = session ? Math.max(0, Math.ceil((session.deadline - now) / 1000)) : 1800
  const time = String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0')
  const disabled = !!busy || restoring

  const resumeItems = resumes.map(doc => <label className={'resume ' + (selected.includes(doc.id) ? 'chosen' : '')} key={doc.id}>
          <FileText size={19} /><span title={doc.filename}>{doc.filename}<small>Uploaded</small></span>
          <input type="checkbox" aria-label={'Include ' + doc.filename} checked={selected.includes(doc.id)} disabled={disabled}
            onChange={() => setSelected(previous => previous.includes(doc.id) ? previous.filter(id => id !== doc.id) : [...previous, doc.id])} />
        </label>)

  return <div className="workspace">
    <aside className="sidebar">
      <a href="/" className="brand"><span className="brand-icon"><Layers3 size={21} /></span>cv supporter<span className="brand-dot">.</span></a>
      <div className="workspace-label">YOUR WORKSPACE <span>01</span></div>
      <button className="new-session" onClick={reset} disabled={disabled}><Plus size={17} /> New session <span>↗</span></button>
      <div className="section-label">RESUMES <span>{resumes.length} / 10</span></div>
      <div className="resume-list">
        {resumeItems}
        {!resumes.length && <div className="no-resumes"><FileText size={25} /><p>No resumes uploaded</p></div>}
      </div>
      <button className="add-files" disabled={disabled || resumes.length >= 10} onClick={() => input.current?.click()}><Plus size={16} /> Add resumes</button>
      <div className="session-card">
        <div><Clock3 size={16} /><span>{session ? 'Session remaining' : 'Session duration'}</span><strong className={seconds < 120 ? 'urgent' : ''} role="timer" aria-label="Session time remaining">{time}</strong></div>
        <div className="time-track"><span style={{ width: (session ? seconds / 1800 * 100 : 100) + '%' }} /></div>

      </div>

    </aside>

    <main>
      <header><div><span className="status-dot" /> Resume workspace <span className="header-divider">/</span><span className="muted">Chat</span></div></header>
      <div className="conversation">
        {!messages.length && <section className="welcome">
          
          
          <h1 className="intro">Bring your resumes. Explore experience, compare skills, and find answers grounded in what candidates actually shared.</h1>
          <button className="upload-zone" disabled={disabled} onClick={() => input.current?.click()}
            onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); void upload(Array.from(event.dataTransfer.files)) }}>
            <span className="upload-icon"><FileText size={27} /><span><Plus size={12} /></span></span>
            <strong>{resumes.length ? 'Add resumes' : 'Upload resumes'}</strong>
            <span>Drop PDF files here or <b>browse files</b></span>
            <small>Up to 10 resumes · 5 MB per file · Text-based PDFs</small>
          </button>
          <div className="suggestion-heading">Try a question below</div>
          <div className="suggestions">{suggestions.map(({ title, text, icon: Icon }) => <button key={title} onClick={() => { setQuestion(text); textarea.current?.focus() }}>
            <Icon size={19} /><strong>{title}</strong><span>{text}</span><ArrowUpRight size={16} className="suggestion-arrow" />
          </button>)}</div>

        </section>}

        {messages.length > 0 && <section className="messages" aria-label="Conversation">
          {messages.map(message => <article className={'message ' + message.role} key={message.id}>
            <div className="message-heading">{message.role === 'assistant' ? <><span className="mini-mark"><Layers3 size={14} /></span> CV Supporter</> : 'You'}</div>
            {message.role === 'assistant'
              ? <AnswerContent text={message.text} sources={message.sources || []} messageId={message.id} />
              : <div className="message-content">{message.text}</div>}
          </article>)}
        </section>}
        {busy && <div className="busy" role="status"><LoaderCircle size={17} className="spin" />{busy}</div>}
        <div ref={bottom} />
      </div>

      <div className="composer-area">
        {resumes.length > 0 && <div className="mobile-resumes" aria-label="Uploaded resumes">
          <button type="button" className="resume-toggle" aria-expanded={resumesExpanded} aria-controls="mobile-resume-list"
            onClick={() => setResumesExpanded(value => !value)}>
            <span><FileText size={15} /> Resumes · {selected.length} / {resumes.length} selected</span>
            <span>{resumesExpanded ? 'Minimize' : 'Expand'}<ChevronDown size={16} className={resumesExpanded ? 'expanded' : ''} /></span>
          </button>
          <div id="mobile-resume-list" className="resume-list" hidden={!resumesExpanded}>{resumeItems}</div>
        </div>}
        {expired && <div className="notice" role="status"><Clock3 size={17} /><span>Your session has ended. Upload your resumes again to start a fresh conversation.</span><button aria-label="Dismiss notice" onClick={() => setExpired(false)}><X size={16} /></button></div>}
        {error && <div className="notice error" role="alert">{error}<button aria-label="Dismiss error" onClick={() => setError('')}><X size={16} /></button></div>}
        <form className="composer" onSubmit={send}>
          <textarea ref={textarea} aria-label="Ask about your resumes" rows={2} maxLength={4000} value={question} disabled={disabled}
            onChange={event => setQuestion(event.target.value)} placeholder="What would you like to know about these candidates?"
            onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit() } }} />
          <div className="composer-toolbar"><button type="button" className="attach" aria-label="Attach resumes" onClick={() => input.current?.click()} disabled={disabled}><Plus size={19} /></button>
            <span>{selected.length ? <><Check size={12} />{selected.length} resume{selected.length > 1 ? 's' : ''} selected</> : 'Upload resumes to begin'}</span>
            <button className="send" aria-label="Send question" disabled={disabled || !session || !selected.length || !question.trim()}><ArrowUp size={19} /></button>
          </div>
        </form>

      </div>
    </main>
    <input ref={input} type="file" accept=".pdf,application/pdf" multiple hidden aria-label="Upload PDF resumes"
      onChange={event => { void upload(Array.from(event.target.files || [])) }} />
  </div>
}
