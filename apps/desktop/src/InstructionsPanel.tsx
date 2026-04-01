import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, ExternalLink, Package, FileDown, Merge, Wrench } from 'lucide-react'

// ── Types (mirrors @lexy/core-types) ──────────────────────────────

interface GuideFileEntry {
  fileCategory: string
  labelText: string
  expectedFileName?: string
  expectedVersion?: string
  sourceUrl?: string
  nexusModId?: number
}

interface FomodInstruction {
  stepLabel?: string
  selections: string[]
}

interface QueueTask {
  taskId: string
  orderIndex: number
  modTitle: string
  pageSlug: string
  sectionTitle: string
  tags: string[]
  installModeHint: string
  fileEntries: GuideFileEntry[]
  fomod?: FomodInstruction[]
  specialInstructions?: string[]
  warnings: string[]
}

// ── Style helpers ─────────────────────────────────────────────────

const CATEGORY_STYLES: Record<string, { bg: string; border: string; text: string; label: string }> = {
  MAIN:     { bg: 'bg-green-900/30', border: 'border-green-700/50', text: 'text-green-300', label: 'Main Files' },
  UPDATE:   { bg: 'bg-blue-900/30',  border: 'border-blue-700/50',  text: 'text-blue-300',  label: 'Update Files' },
  OPTIONAL: { bg: 'bg-purple-900/30', border: 'border-purple-700/50', text: 'text-purple-300', label: 'Optional Files' },
  MISC:     { bg: 'bg-gray-800/50',  border: 'border-gray-600/50',  text: 'text-gray-300',  label: 'Miscellaneous' },
  OLD:      { bg: 'bg-amber-900/30', border: 'border-amber-700/50', text: 'text-amber-300', label: 'Old Files' },
  UNKNOWN:  { bg: 'bg-gray-800/50',  border: 'border-gray-600/50',  text: 'text-gray-400',  label: 'Files' },
}

const MODE_CONFIG: Record<string, { icon: typeof Package; color: string; label: string }> = {
  NEW:       { icon: Package,  color: 'text-green-400',  label: 'Install as new mod' },
  MERGE:     { icon: Merge,    color: 'text-blue-400',   label: 'Merge into existing' },
  SEPARATE:  { icon: FileDown, color: 'text-purple-400', label: 'Separate install' },
  TOOL_TASK: { icon: Wrench,   color: 'text-amber-400',  label: 'Tool / manual task' },
  MANUAL:    { icon: Wrench,   color: 'text-gray-400',   label: 'Manual action' },
}

// ── Component ─────────────────────────────────────────────────────

interface Props {
  sectionName: string
  onLoadTasks?: () => void
}

export default function InstructionsPanel({ sectionName }: Props) {
  const [tasks, setTasks] = useState<QueueTask[]>([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load tasks when section changes
  useEffect(() => {
    if (!sectionName || !window.electronAPI) return

    setLoading(true)
    setError(null)
    setCurrentIdx(0)

    window.electronAPI.captureCommand(['queue', '--section', sectionName, '--json'])
      .then((raw: string) => {
        try {
          const parsed = JSON.parse(raw.trim())
          if (Array.isArray(parsed)) {
            setTasks(parsed)
          } else {
            setTasks([])
            setError('No tasks found for this section')
          }
        } catch {
          setTasks([])
          setError('Failed to parse task data')
        }
      })
      .catch(() => {
        setError('Failed to load instructions')
      })
      .finally(() => setLoading(false))
  }, [sectionName])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        <div className="animate-pulse">Loading instructions...</div>
      </div>
    )
  }

  if (error || tasks.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        <div className="text-center">
          <p className="text-lg">{error || 'No instructions loaded'}</p>
          <p className="text-sm mt-1">Select a section and load it from the Downloader tab</p>
        </div>
      </div>
    )
  }

  const task = tasks[currentIdx]!
  const modeInfo = MODE_CONFIG[task.installModeHint] ?? MODE_CONFIG.MANUAL!
  const ModeIcon = modeInfo.icon

  return (
    <div className="flex flex-col h-full">
      {/* Navigation bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#181825] border-b border-[#313244] shrink-0">
        <button
          disabled={currentIdx <= 0}
          onClick={() => setCurrentIdx(i => Math.max(0, i - 1))}
          className="flex items-center gap-1 px-2 py-1 rounded text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-600 disabled:opacity-30 transition-colors"
        >
          <ChevronLeft size={14} />
          Prev
        </button>

        <div className="text-center min-w-0 px-2">
          <div className="text-xs text-gray-500 truncate">{task.sectionTitle}</div>
          <div className="text-sm text-gray-300 font-medium">
            {currentIdx + 1} / {tasks.length}
          </div>
        </div>

        <button
          disabled={currentIdx >= tasks.length - 1}
          onClick={() => setCurrentIdx(i => Math.min(tasks.length - 1, i + 1))}
          className="flex items-center gap-1 px-2 py-1 rounded text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-600 disabled:opacity-30 transition-colors"
        >
          Next
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Task content — scrollable */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Header */}
        <div>
          <h3 className="text-lg font-semibold text-[#cdd6f4]">{task.modTitle}</h3>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <span className={`flex items-center gap-1 text-xs ${modeInfo.color}`}>
              <ModeIcon size={13} />
              {modeInfo.label}
            </span>
            {task.tags.length > 0 && task.tags.map((tag, i) => (
              <span key={i} className="text-xs px-1.5 py-0.5 rounded bg-[#313244] text-gray-400">{tag}</span>
            ))}
          </div>
        </div>

        {/* File entries */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Files to Download</div>
          {task.fileEntries.map((fe, i) => {
            const style = CATEGORY_STYLES[fe.fileCategory] ?? CATEGORY_STYLES.UNKNOWN!
            return (
              <div key={i} className={`rounded-lg border ${style.border} ${style.bg} p-3`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${style.bg} ${style.text} border ${style.border}`}>
                        {style.label}
                      </span>
                      {fe.expectedVersion && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-[#313244] text-gray-300">
                          v{fe.expectedVersion}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-200 mt-1.5 font-medium">
                      {fe.expectedFileName || fe.labelText}
                    </div>
                  </div>
                  {fe.sourceUrl && (
                    <a
                      href={fe.sourceUrl}
                      target="_blank"
                      rel="noopener"
                      className="shrink-0 text-gray-500 hover:text-blue-400 transition-colors"
                      title="Open on Nexus Mods"
                    >
                      <ExternalLink size={14} />
                    </a>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* FOMOD Instructions */}
        {task.fomod && task.fomod.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">FOMOD Instructions</div>
            <div className="rounded-lg border border-pink-800/40 bg-pink-900/15 p-3 space-y-3">
              {task.fomod.map((step, si) => (
                <div key={si}>
                  {step.stepLabel && (
                    <div className="text-xs font-semibold text-pink-300 mb-1.5">{step.stepLabel}</div>
                  )}
                  <div className="space-y-1 ml-1">
                    {step.selections.map((sel, seli) => (
                      <div key={seli} className="flex items-start gap-2 text-sm">
                        <span className="text-green-400 mt-0.5 shrink-0">✓</span>
                        <span className="text-gray-200">{sel}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Special Instructions */}
        {task.specialInstructions && task.specialInstructions.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Special Instructions</div>
            {task.specialInstructions.map((instr, i) => {
              // Detect "Delete the following file(s)" instructions and parse paths
              const isDeleteList = /delete the following/i.test(instr)
              if (isDeleteList) {
                // Split by newlines/tabs and extract file paths
                const paths = instr
                  .split('\n')
                  .map(l => l.trim())
                  .filter(l => l.length > 0 && !l.toLowerCase().startsWith('delete'))

                return (
                  <div key={i} className="rounded-lg border border-amber-800/40 bg-amber-900/15 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-amber-300">Delete the following files:</span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(paths.join('\n'))
                        }}
                        className="text-xs px-2 py-0.5 rounded bg-amber-900/40 text-amber-300 border border-amber-700/50 hover:bg-amber-800/60 transition-colors"
                      >
                        Copy All
                      </button>
                    </div>
                    <div className="space-y-0.5">
                      {paths.map((path, pi) => (
                        <div
                          key={pi}
                          onClick={() => navigator.clipboard.writeText(path)}
                          className="text-xs font-mono text-gray-300 bg-[#1e1e2e] rounded px-2 py-1 cursor-pointer hover:bg-[#313244] hover:text-white transition-colors border border-transparent hover:border-amber-700/30"
                          title="Click to copy"
                        >
                          {path}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              }

              // Default: render as-is with line breaks
              return (
                <div key={i} className="rounded-lg border border-amber-800/40 bg-amber-900/15 p-3">
                  <div className="flex items-start gap-2 text-sm">
                    <span className="text-amber-400 mt-0.5 shrink-0">⚙️</span>
                    <span className="text-gray-200 whitespace-pre-wrap">{instr}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Warnings */}
        {task.warnings.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Warnings</div>
            <div className="rounded-lg border border-red-800/40 bg-red-900/15 p-3 space-y-2">
              {task.warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-red-400 mt-0.5 shrink-0">⚠️</span>
                  <span className="text-gray-300">{w}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
