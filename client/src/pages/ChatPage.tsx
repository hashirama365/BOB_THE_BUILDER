import { useEffect, useRef, useState, KeyboardEvent } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  role: 'user' | 'assistant'
  content: string
  sql?: string
  results?: Record<string, unknown>[]
}

interface ChatResponse {
  answer: string
  sql?: string
  results?: Record<string, unknown>[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const EXAMPLE_QUESTIONS = [
  'How many bookings are there?',
  'Which containers are currently at sea?',
  'List all hazmat bookings',
  "What's the next voyage from Jacksonville?",
  'How many bookings are in each status?',
]

// ─── Sub-components ───────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex justify-start mb-4">
      <div className="bg-gray-100 text-gray-900 rounded-2xl rounded-bl-sm px-4 py-3 max-w-xs">
        <span className="flex items-center gap-1 text-sm text-gray-500">
          <span className="animate-bounce delay-0 inline-block w-1.5 h-1.5 bg-gray-400 rounded-full" />
          <span className="animate-bounce delay-150 inline-block w-1.5 h-1.5 bg-gray-400 rounded-full" />
          <span className="animate-bounce delay-300 inline-block w-1.5 h-1.5 bg-gray-400 rounded-full" />
        </span>
      </div>
    </div>
  )
}

function SqlBlock({ sql }: { sql: string }) {
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-700 select-none">
        SQL used ▾
      </summary>
      <pre className="mt-1 p-3 bg-gray-900 text-green-300 text-xs rounded overflow-x-auto leading-relaxed">
        <code>{sql}</code>
      </pre>
    </details>
  )
}

function ResultsTable({ results }: { results: Record<string, unknown>[] }) {
  if (results.length === 0) {
    return <p className="mt-2 text-xs text-gray-400 italic">No results found.</p>
  }

  const columns = Object.keys(results[0])
  const rows = results.slice(0, 50)

  return (
    <div className="mt-2 overflow-x-auto max-w-full rounded border border-gray-200">
      <table className="text-xs min-w-full">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            {columns.map(col => (
              <th
                key={col}
                className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-gray-50">
              {columns.map(col => (
                <td key={col} className="px-3 py-2 text-gray-700 whitespace-nowrap">
                  {row[col] == null ? '—' : String(row[col])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {results.length > 50 && (
        <div className="px-3 py-2 text-xs text-gray-400 border-t border-gray-100">
          Showing first 50 of {results.length} rows
        </div>
      )}
    </div>
  )
}

function AssistantBubble({ msg }: { msg: Message }) {
  return (
    <div className="flex justify-start mb-4">
      <div className="bg-gray-100 text-gray-900 rounded-2xl rounded-bl-sm px-4 py-3 max-w-2xl min-w-0">
        <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
        {msg.sql && <SqlBlock sql={msg.sql} />}
        {msg.results && <ResultsTable results={msg.results} />}
      </div>
    </div>
  )
}

function UserBubble({ msg }: { msg: Message }) {
  return (
    <div className="flex justify-end mb-4">
      <div className="bg-blue-600 text-white rounded-2xl rounded-br-sm px-4 py-3 max-w-2xl">
        <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
      </div>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll to bottom on new messages or loading change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function sendMessage(text: string) {
    const trimmed = text.trim()
    if (!trimmed || loading) return

    const userMsg: Message = { role: 'user', content: trimmed }
    const nextMessages = [...messages, userMsg]

    setMessages(nextMessages)
    setInput('')
    setLoading(true)
    setError(null)

    // Strip sql/results before sending — only role + content go to the API
    const payload = nextMessages.map(({ role, content }) => ({ role, content }))

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: payload }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error ?? `Server error: ${res.status}`)
      }

      const data: ChatResponse = await res.json()
      const assistantMsg: Message = {
        role: 'assistant',
        content: data.answer,
        sql: data.sql,
        results: data.results,
      }
      setMessages(prev => [...prev, assistantMsg])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  function handleExampleClick(question: string) {
    setInput(question)
    textareaRef.current?.focus()
  }

  const hasMessages = messages.length > 0

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 120px)' }}>

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-4 shrink-0">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">DB Assistant</h1>
          <p className="text-sm text-gray-500 mt-0.5">Ask anything about your container data</p>
        </div>
        {hasMessages && (
          <button
            onClick={() => { setMessages([]); setError(null) }}
            className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 hover:border-gray-300 rounded px-3 py-1.5 transition-colors"
          >
            Clear conversation
          </button>
        )}
      </div>

      {/* ── Message thread ────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto min-h-0 bg-white border border-gray-200 rounded-lg p-4">
        {!hasMessages ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <div className="text-4xl mb-3 select-none">💬</div>
            <h2 className="text-base font-medium text-gray-700 mb-1">Ask a question about your data</h2>
            <p className="text-sm text-gray-400 mb-6">Try one of these to get started:</p>
            <div className="flex flex-col gap-2 max-w-sm w-full">
              {EXAMPLE_QUESTIONS.map(q => (
                <button
                  key={q}
                  onClick={() => handleExampleClick(q)}
                  className="text-left text-sm bg-gray-50 hover:bg-blue-50 hover:text-blue-700 border border-gray-200 hover:border-blue-200 rounded-lg px-4 py-2.5 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg, i) =>
              msg.role === 'user'
                ? <UserBubble key={i} msg={msg} />
                : <AssistantBubble key={i} msg={msg} />
            )}
            {loading && <TypingIndicator />}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* ── Error banner ──────────────────────────────────────────────────────── */}
      {error && (
        <div className="mt-2 shrink-0 flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-700">
          <span>⚠</span>
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-red-400 hover:text-red-600"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Input bar ─────────────────────────────────────────────────────────── */}
      <div className="mt-3 shrink-0 flex items-end gap-2">
        <textarea
          ref={textareaRef}
          rows={1}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question… (Enter to send, Shift+Enter for newline)"
          disabled={loading}
          className="flex-1 resize-none rounded-lg border border-gray-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 disabled:opacity-50 transition-colors overflow-hidden"
          style={{ minHeight: '44px', maxHeight: '140px' }}
          onInput={e => {
            const el = e.currentTarget
            el.style.height = 'auto'
            el.style.height = `${Math.min(el.scrollHeight, 140)}px`
          }}
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={loading || !input.trim()}
          className="shrink-0 h-11 px-5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {loading ? 'Sending…' : 'Send'}
        </button>
      </div>

    </div>
  )
}
