import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

let win: BrowserWindow | null = null

function createWindow() {
  win = new BrowserWindow({
    width: 1024,
    height: 768,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    autoHideMenuBar: true,
  })

  // Check if we are in development mode (Vite typically runs on 5173)
  const url = process.env.VITE_DEV_SERVER_URL
  if (url) {
    win.loadURL(url)
    win.webContents.openDevTools()
  } else {
    // Correctly point to the React app's index.html in the dist folder
    win.loadFile(join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// IPC commands wrapper
ipcMain.handle('run-command', async (event, command: string, args: string[]) => {
  return new Promise((resolve, reject) => {
    // Walk up from dist-electron to apps/desktop, then up to workspace root
    const workspaceRoot = join(__dirname, '..', '..', '..')
    const cliEntry = join(workspaceRoot, 'apps', 'cli', 'src', 'index.ts')
    
    // Quote args that contain spaces for shell mode
    const quotedArgs = args.map(a => a.includes(' ') ? `"${a}"` : a)
    
    // Use npx tsx to run TypeScript source directly
    const child = spawn('npx', ['tsx', cliEntry, ...quotedArgs], {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        FORCE_COLOR: '1',
        LOG_LEVEL: 'silent',
        NODE_NO_WARNINGS: '1',
      },
      shell: true,
    })

    // Listen to stdout and send it to the frontend terminal
    child.stdout.on('data', (data) => {
      win?.webContents.send('command-stdout', data.toString())
    })

    // Listen to stderr
    child.stderr.on('data', (data) => {
      win?.webContents.send('command-stderr', data.toString())
    })

    // Resolve when done
    child.on('close', (code) => {
      resolve(code)
    })
    
    child.on('error', (err) => {
      win?.webContents.send('command-stderr', err.message)
      resolve(-1)
    })
  })
})

// IPC handler to capture command output as a string (for JSON data)
ipcMain.handle('capture-command', async (event, args: string[]) => {
  return new Promise<string>((resolve) => {
    const workspaceRoot = join(__dirname, '..', '..', '..')
    const cliEntry = join(workspaceRoot, 'apps', 'cli', 'src', 'index.ts')
    const quotedArgs = args.map(a => a.includes(' ') ? `"${a}"` : a)
    
    let stdout = ''
    const child = spawn('npx', ['tsx', cliEntry, ...quotedArgs], {
      cwd: workspaceRoot,
      env: { ...process.env, LOG_LEVEL: 'silent', NODE_NO_WARNINGS: '1' },
      shell: true,
    })

    child.stdout.on('data', (data) => { stdout += data.toString() })
    child.on('close', () => resolve(stdout))
    child.on('error', () => resolve(''))
  })
})
