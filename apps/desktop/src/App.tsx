import { useState, useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { FileSearch, Download, Eye, TerminalSquare, Settings, Play } from 'lucide-react'

const TABS = [
  { id: 'validator', label: 'Validator', icon: FileSearch },
  { id: 'downloader', label: 'Downloader', icon: Download },
  { id: 'observer', label: 'MO2 Observer', icon: Eye },
]

export default function App() {
  const [activeTab, setActiveTab] = useState('validator')
  const [isRunning, setIsRunning] = useState(false)
  const [downloadSection, setDownloadSection] = useState('')
  const [sections, setSections] = useState<{ page: string; section: string; label: string }[]>([])
  const [isLoadingSections, setIsLoadingSections] = useState(false)
  
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<Terminal>(null)

  // Initialize Terminal
  useEffect(() => {
    if (!terminalRef.current) return

    const term = new Terminal({
      theme: {
        background: '#1e1e2e',
        foreground: '#cdd6f4',
        cursor: '#f38ba8',
        selectionBackground: '#585b7066',
      },
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 14,
      convertEol: true,
      allowProposedApi: true,
      rightClickSelectsWord: true,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(terminalRef.current)

    // Slight delay to let the DOM settle before fitting
    setTimeout(() => {
      try { fitAddon.fit() } catch {}
    }, 100)

    term.writeln('\x1b[1;36mLexy Assistant Terminal Ready.\x1b[0m')
    term.writeln('Select an action above to start...\n')

    // Copy selection to clipboard on Ctrl+C when text is selected
    term.attachCustomKeyEventHandler((e) => {
      if (e.ctrlKey && e.key === 'c' && term.hasSelection()) {
        navigator.clipboard.writeText(term.getSelection())
        return false // prevent default
      }
      return true
    })

    xtermRef.current = term

    // Setup IPC listeners
    if (window.electronAPI) {
      window.electronAPI.onStdout((data) => term.write(data))
      window.electronAPI.onStderr((data) => term.write(`\x1b[31m${data}\x1b[0m`))
    }

    const handleResize = () => {
      try { fitAddon.fit() } catch {}
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      if (window.electronAPI) window.electronAPI.removeAllListeners()
      term.dispose()
    }
  }, [])

  const runCommand = async (cmd: string, args: string[]) => {
    if (!window.electronAPI || !xtermRef.current) return
    setIsRunning(true)
    xtermRef.current.scrollToBottom()
    xtermRef.current.writeln(`\n\x1b[1;33m$ lexy ${args.join(' ')}\x1b[0m\n`)
    
    try {
      const code = await window.electronAPI.runCommand(cmd, args)
      xtermRef.current.writeln(`\n\x1b[1;36mProcess exited with code ${code}\x1b[0m\n`)
    } catch (err) {
      xtermRef.current.writeln(`\n\x1b[1;31mError spawning process: ${err}\x1b[0m\n`)
    } finally {
      setIsRunning(false)
    }
  }

  // View sections
  const renderValidator = () => (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold mb-4 text-pink-300">Guide Synchronization & Validation</h2>
      <p className="text-gray-400 text-sm">Download the latest lexyslotd.com guide pages, parse them into a local manifest, and check file versions against Nexus.</p>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        <button 
          disabled={isRunning}
          onClick={() => runCommand('lexy', ['sync-guide'])}
          className="flex items-center justify-center space-x-2 bg-blue-900/50 hover:bg-blue-800 text-blue-200 p-4 rounded-lg border border-blue-700/50 transition-colors disabled:opacity-50"
        >
          <Download size={20} />
          <span>1. Sync Guide</span>
        </button>
        <button 
          disabled={isRunning}
          onClick={() => runCommand('lexy', ['build-manifest'])}
          className="flex items-center justify-center space-x-2 bg-purple-900/50 hover:bg-purple-800 text-purple-200 p-4 rounded-lg border border-purple-700/50 transition-colors disabled:opacity-50"
        >
          <Settings size={20} />
          <span>2. Build Manifest</span>
        </button>
        <button 
          disabled={isRunning}
          onClick={() => runCommand('lexy', ['validate'])}
          className="flex items-center justify-center space-x-2 bg-pink-900/50 hover:bg-pink-800 text-pink-200 p-4 rounded-lg border border-pink-700/50 transition-colors disabled:opacity-50"
        >
          <FileSearch size={20} />
          <span>3. Validate Files</span>
        </button>
      </div>
    </div>
  )

  const loadSections = async () => {
    if (!window.electronAPI) return
    setIsLoadingSections(true)
    try {
      const raw = await window.electronAPI.captureCommand(['download', '--list'])
      // Parse lines like: "  mod-installation-part-1 > Optimized Texture Baseline (4 files in 3 tasks)"
      const parsed: { page: string; section: string; label: string }[] = []
      for (const line of raw.split('\n')) {
        const match = line.match(/^\s+(\S+)\s+>\s+(.+?)\s+\((\d+\s+files\s+in\s+\d+\s+tasks)\)/)
        if (match) {
          parsed.push({ page: match[1], section: match[2], label: `${match[2]} (${match[3]})` })
        }
      }
      
      // Filter out non-mod pages
      const HIDDEN_PAGES = ['mcm-setup', 'common-task-instructions', 'preinstallation-instructions']
      const filtered = parsed.filter(s => !HIDDEN_PAGES.includes(s.page))
      
      // Sort: mod-installation pages first (in order), finishing-line last
      filtered.sort((a, b) => {
        const aIsFinishing = a.page === 'finishing-line' ? 1 : 0
        const bIsFinishing = b.page === 'finishing-line' ? 1 : 0
        if (aIsFinishing !== bIsFinishing) return aIsFinishing - bIsFinishing
        return 0 // preserve original order otherwise
      })
      
      setSections(filtered)
      if (filtered.length > 0 && !downloadSection) {
        setDownloadSection(filtered[0].section)
      }
    } catch {}
    setIsLoadingSections(false)
  }

  const renderDownloader = () => (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold mb-4 text-green-300">Automated Downloading</h2>
      <p className="text-gray-400 text-sm">Download validated files directly from the Nexus Premium CDN to your MO2 downloads folder.</p>
      
      <div className="mt-4 space-y-3">
        {/* Load sections button */}
        <button 
          disabled={isRunning || isLoadingSections}
          onClick={loadSections}
          className="flex items-center space-x-2 bg-gray-800 hover:bg-gray-700 text-gray-200 px-4 py-2 rounded-lg border border-gray-600 transition-colors disabled:opacity-50 text-sm"
        >
          <Settings size={16} />
          <span>{isLoadingSections ? 'Loading...' : sections.length > 0 ? `Reload Sections (${sections.length})` : 'Load Sections'}</span>
        </button>

        {/* Scrollable section list */}
        {sections.length > 0 && (
          <div className="max-h-48 overflow-y-auto bg-[#181825] border border-[#313244] rounded-lg p-2 space-y-0.5">
            {sections.map((s, i) => (
              <label 
                key={i}
                className={`flex items-center space-x-2 px-3 py-1.5 rounded cursor-pointer text-sm transition-colors ${
                  downloadSection === s.section 
                    ? 'bg-green-900/40 text-green-200' 
                    : 'text-gray-400 hover:bg-[#313244]/50 hover:text-gray-200'
                }`}
              >
                <input
                  type="radio"
                  name="section"
                  checked={downloadSection === s.section}
                  onChange={() => setDownloadSection(s.section)}
                  className="accent-green-500"
                />
                <span className="text-gray-500 text-xs w-40 shrink-0 truncate">{s.page}</span>
                <span className="truncate">{s.label}</span>
              </label>
            ))}
          </div>
        )}

        {/* Action buttons */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
          <button 
            disabled={isRunning || !downloadSection.trim()}
            onClick={() => runCommand('lexy', ['download', '--section', downloadSection.trim(), '--dry-run'])}
            className="flex items-center justify-center space-x-2 bg-gray-800 hover:bg-gray-700 text-gray-200 p-3 rounded-lg border border-gray-600 transition-colors disabled:opacity-50"
          >
            <Eye size={18} />
            <span>Preview</span>
          </button>
          <button 
            disabled={isRunning || !downloadSection.trim()}
            onClick={() => runCommand('lexy', ['download', '--section', downloadSection.trim(), '--skip-existing'])}
            className="flex items-center justify-center space-x-2 bg-green-900/50 hover:bg-green-800 text-green-200 p-3 rounded-lg border border-green-700/50 transition-colors disabled:opacity-50"
          >
            <Download size={18} />
            <span>Download</span>
          </button>
          <button 
            disabled={isRunning}
            onClick={() => runCommand('lexy', ['download', '--next', '--dry-run'])}
            className="flex items-center justify-center space-x-2 bg-blue-900/50 hover:bg-blue-800 text-blue-200 p-3 rounded-lg border border-blue-700/50 transition-colors disabled:opacity-50"
          >
            <Play size={18} />
            <span>Next Pending</span>
          </button>
        </div>
      </div>
    </div>
  )

  const renderObserver = () => (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold mb-4 text-amber-300">MO2 Passive Observer</h2>
      <p className="text-gray-400 text-sm">Read the active MO2 profile and mod folders to see what you've already completed.</p>
      
      <div className="grid grid-cols-1 gap-4 mt-6">
        <button 
          disabled={isRunning}
          onClick={() => runCommand('lexy', ['observe'])}
          className="flex items-center justify-center space-x-2 bg-amber-900/50 hover:bg-amber-800 text-amber-200 p-4 rounded-lg border border-amber-700/50 transition-colors disabled:opacity-50"
        >
          <Play size={20} />
          <span>Run MO2 Inspection</span>
        </button>
      </div>
    </div>
  )

  return (
    <div className="h-screen flex flex-col pt-8">
      {/* Draggable Title Bar (Tailwind class added to allow dragging frameless window if we enable it) */}
      <div className="absolute top-0 left-0 right-0 h-8 bg-[#181825] flex items-center px-4" style={{ WebkitAppRegion: 'drag' } as any}>
        <span className="text-xs text-gray-400 font-semibold tracking-wider">LEXY VALIDATOR</span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 bg-[#181825] border-r border-[#313244] p-4 flex flex-col space-y-2">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors w-full text-left ${
                  isActive 
                    ? 'bg-[#313244] text-[#f38ba8] font-medium' 
                    : 'text-gray-400 hover:bg-[#313244]/50 hover:text-gray-200'
                }`}
              >
                <Icon size={20} />
                <span>{tab.label}</span>
              </button>
            )
          })}

          <div className="mt-auto pt-4 border-t border-[#313244]">
             <button 
                disabled={isRunning}
                onClick={() => runCommand('lexy', ['queue'])}
                className="flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors w-full text-left text-gray-400 hover:bg-[#313244]/50 hover:text-gray-200 disabled:opacity-50"
              >
                <TerminalSquare size={20} />
                <span>Show Queue</span>
              </button>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col bg-[#1e1e2e]">
          
          {/* Top Panel: Control Views */}
          <div className="p-8 h-1/2 overflow-y-auto">
            {activeTab === 'validator' && renderValidator()}
            {activeTab === 'downloader' && renderDownloader()}
            {activeTab === 'observer' && renderObserver()}
          </div>

          {/* Bottom Panel: Terminal */}
          <div className="h-1/2 border-t border-[#313244] bg-[#11111b] flex flex-col">
            <div className="px-4 py-2 bg-[#181825] border-b border-[#313244] flex items-center justify-between">
              <span className="text-xs text-gray-400 font-mono flex items-center space-x-2">
                <TerminalSquare size={14} />
                <span>Output Console</span>
              </span>
              {isRunning && (
                <span className="flex items-center space-x-2 text-xs text-pink-400">
                  <span className="animate-pulse h-2 w-2 bg-pink-400 rounded-full"></span>
                  <span>Running...</span>
                </span>
              )}
            </div>
            {/* Terminal Container */}
            <div className="flex-1 overflow-hidden p-2" ref={terminalRef}></div>
          </div>
        </div>
      </div>
    </div>
  )
}
