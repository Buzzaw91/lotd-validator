const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  runCommand: (command, args) => ipcRenderer.invoke('run-command', command, args),
  captureCommand: (args) => ipcRenderer.invoke('capture-command', args),
  onStdout: (callback) => {
    ipcRenderer.on('command-stdout', (_event, value) => callback(value))
  },
  onStderr: (callback) => {
    ipcRenderer.on('command-stderr', (_event, value) => callback(value))
  },
  removeAllListeners: () => {
    ipcRenderer.removeAllListeners('command-stdout')
    ipcRenderer.removeAllListeners('command-stderr')
  }
})
