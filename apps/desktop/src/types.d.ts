export {}

declare global {
  interface Window {
    electronAPI?: {
      runCommand: (command: string, args: string[]) => Promise<number>
      captureCommand: (args: string[]) => Promise<string>
      onStdout: (callback: (data: string) => void) => void
      onStderr: (callback: (data: string) => void) => void
      removeAllListeners: () => void
    }
  }
}
