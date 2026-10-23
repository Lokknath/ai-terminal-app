import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  session,
  Menu,
  clipboard,
  nativeTheme,
  powerSaveBlocker,
  powerMonitor,
  Notification
} from 'electron'
import { join } from 'path'
import fs from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { initPtyManager, cleanupAllPty, emergencyCleanupSync } from './pty-manager'
import { initAgentRegistry } from './agent-registry'
import { initAccountManager } from './account-manager'
import { initFileManager } from './file-manager'
import { initApiClient } from './api-client'
import { startOAuthServer, stopOAuthServer } from './oauth-server'
import { initDevToolsManager } from './dev-tools-manager'

// Prevent silent crashes on unhandled errors
process.on('uncaughtException', (error) => {
  console.error('[Main Process Uncaught Exception]', error)
})
process.on('unhandledRejection', (reason) => {
  console.error('[Main Process Unhandled Rejection]', reason)
})

let powerBlockerId: number | null = null
export function updatePowerSaveBlocker(enable: boolean): boolean {
  try {
    if (enable) {
      if (powerBlockerId === null || !powerSaveBlocker.isStarted(powerBlockerId)) {
        powerBlockerId = powerSaveBlocker.start('prevent-display-sleep')
      }
      return true
    } else {
      if (powerBlockerId !== null && powerSaveBlocker.isStarted(powerBlockerId)) {
        powerSaveBlocker.stop(powerBlockerId)
        powerBlockerId = null
      }
      return false
    }
  } catch {
    return false
  }
}

let hasCleanedUp = false
export function handleEmergencyTeardown(source: string): void {
  if (hasCleanedUp) return
  hasCleanedUp = true
  console.log(`[Lifecycle] Emergency teardown initiated by ${source}`)
  try {
    updatePowerSaveBlocker(false)
  } catch {
    // ignore
  }
  try {
    emergencyCleanupSync()
  } catch (err) {
    console.error('[Lifecycle] emergencyCleanupSync failed:', err)
  }
  try {
    stopOAuthServer()
  } catch (err) {
    console.error('[Lifecycle] stopOAuthServer failed:', err)
  }
  removeSingletonLocksSync()
}

// Process termination signal handlers to ensure child processes never become orphaned
process.on('SIGINT', () => {
  handleEmergencyTeardown('SIGINT')
  process.exit(0)
})
process.on('SIGTERM', () => {
  handleEmergencyTeardown('SIGTERM')
  process.exit(0)
})
process.on('SIGHUP', () => {
  handleEmergencyTeardown('SIGHUP')
  process.exit(0)
})
process.on('exit', () => {
  handleEmergencyTeardown('process.exit')
})

// Clean up orphaned POSIX singleton symlinks left behind by abruptly terminated instances
function removeSingletonLocksSync(): void {
  try {
    const userDataPath = app.getPath('userData')
    const lockFiles = ['SingletonLock', 'SingletonCookie', 'SingletonSocket']
    for (const file of lockFiles) {
      const fullPath = join(userDataPath, file)
      try {
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath)
        }
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
}

function cleanStaleSingletonLocks(): void {
  try {
    const userDataPath = app.getPath('userData')
    const lockFiles = ['SingletonLock', 'SingletonCookie', 'SingletonSocket']
    for (const file of lockFiles) {
      const fullPath = join(userDataPath, file)
      try {
        const stat = fs.lstatSync(fullPath)
        if (stat.isSymbolicLink()) {
          const target = fs.readlinkSync(fullPath)
          const pidMatch = target.match(/-(\d+)$/)
          let isRunning = false
          if (pidMatch) {
            const pid = parseInt(pidMatch[1], 10)
            try {
              process.kill(pid, 0)
              isRunning = true
            } catch {
              isRunning = false
            }
          }
          if (!isRunning) {
            console.log(`[ProcessSingleton] Removing stale lockfile ${file} -> ${target}`)
            fs.unlinkSync(fullPath)
          }
        } else if (stat.isSocket()) {
          console.log(`[ProcessSingleton] Removing stale socket ${file}`)
          fs.unlinkSync(fullPath)
        }
      } catch {
        // Ignore if file doesn't exist or stat fails
      }
    }
  } catch (err) {
    console.warn('[ProcessSingleton] Stale lock check skipped:', err)
  }
}

// Disable blink features that flag automated environments (e.g. navigator.webdriver)
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled')
// Prevent GPU process crashes from tearing down the application
app.commandLine.appendSwitch('disable-gpu-process-crash-limit')
// Prevent unnecessary background renderer Mach port contention
app.commandLine.appendSwitch('disable-features', 'SpareRendererForSitePerProcess')

export const CHROME_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36'

export const FIREFOX_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0'

app.userAgentFallback = CHROME_USER_AGENT

async function openSafeExternal(url: string): Promise<boolean> {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      await shell.openExternal(parsed.toString())
      return true
    }
  } catch (error) {
    console.error('Could not open external URL:', error)
  }
  return false
}

function ensureKeychainCompatibility(): void {
  if (process.platform !== 'darwin') return
  try {
    const keychainsDir = join(app.getPath('home'), 'Library', 'Keychains')
    const modernDb = join(keychainsDir, 'login.keychain-db')
    const legacyDb = join(keychainsDir, 'login.keychain')
    if (fs.existsSync(modernDb) && !fs.existsSync(legacyDb)) {
      try {
        fs.symlinkSync('login.keychain-db', legacyDb)
        console.log('[Keychain] Created compatibility symlink login.keychain -> login.keychain-db')
      } catch (linkErr) {
        console.warn('[Keychain] Could not link login.keychain:', linkErr)
      }
    }
  } catch (err) {
    console.warn('[Keychain] Keychain check skipped:', err)
  }
}

cleanStaleSingletonLocks()
ensureKeychainCompatibility()

let mainWindowRef: BrowserWindow | null = null
const hasSingleInstanceLock = app.requestSingleInstanceLock()

// Register custom protocol schemes for external OAuth redirects (e.g. nexus://oauth?token=...)
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('nexus', process.execPath, [join(__dirname, '../../')])
    app.setAsDefaultProtocolClient('ai-terminal', process.execPath, [join(__dirname, '../../')])
  }
} else {
  app.setAsDefaultProtocolClient('nexus')
  app.setAsDefaultProtocolClient('ai-terminal')
}

function handleProtocolUrl(rawUrl: string): void {
  try {
    const parsed = new URL(rawUrl)
    if (parsed.protocol === 'nexus:' || parsed.protocol === 'ai-terminal:') {
      if (mainWindowRef && !mainWindowRef.isDestroyed()) {
        if (mainWindowRef.isMinimized()) mainWindowRef.restore()
        mainWindowRef.show()
        mainWindowRef.focus()
        mainWindowRef.webContents.send('oauth-protocol-opened', {
          url: rawUrl,
          path: parsed.pathname || parsed.hostname,
          searchParams: Object.fromEntries(parsed.searchParams.entries())
        })
      }
    }
  } catch (err) {
    console.error('Failed to parse protocol URL:', err)
  }
}

// macOS deep link event
app.on('open-url', (event, url) => {
  event.preventDefault()
  handleProtocolUrl(url)
})

if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, commandLine) => {
    // A second copy would write to the same account and workspace profile.
    // Keep one owner of that profile and bring its window back to the front.
    if (!mainWindowRef || mainWindowRef.isDestroyed()) {
      if (app.isReady()) createWindow()
      return
    }
    if (mainWindowRef.isMinimized()) mainWindowRef.restore()
    mainWindowRef.show()
    mainWindowRef.focus()

    // Windows / Linux protocol link check
    const deepLink = commandLine.find(
      (arg) => arg.startsWith('nexus://') || arg.startsWith('ai-terminal://')
    )
    if (deepLink) {
      handleProtocolUrl(deepLink)
    }
  })
}

function setupApplicationMenu(): void {
  const isMac = process.platform === 'darwin'
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              {
                label: 'Force Quit & Kill All Subprocesses',
                accelerator: 'CommandOrControl+Alt+Q',
                click: (): void => {
                  handleEmergencyTeardown('Menu Force Quit')
                  app.exit(0)
                }
              },
              { role: 'quit' as const }
            ]
          }
        ]
      : [
          {
            label: 'File',
            submenu: [
              {
                label: 'Force Quit & Kill All Subprocesses',
                accelerator: 'CommandOrControl+Alt+Q',
                click: (): void => {
                  handleEmergencyTeardown('Menu Force Quit')
                  app.exit(0)
                }
              },
              { role: 'quit' as const }
            ]
          }
        ]),
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' as const },
        { role: 'redo' as const },
        { type: 'separator' as const },
        { role: 'cut' as const },
        { role: 'copy' as const },
        { role: 'paste' as const },
        { role: 'pasteAndMatchStyle' as const },
        { role: 'delete' as const },
        { role: 'selectAll' as const }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' as const },
        { role: 'forceReload' as const },
        { role: 'toggleDevTools' as const },
        { type: 'separator' as const },
        { role: 'resetZoom' as const },
        { role: 'zoomIn' as const },
        { role: 'zoomOut' as const },
        { type: 'separator' as const },
        { role: 'togglefullscreen' as const }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' as const },
        { role: 'zoom' as const },
        ...(isMac
          ? [
              { type: 'separator' as const },
              { role: 'front' as const },
              { type: 'separator' as const },
              { role: 'window' as const }
            ]
          : [{ role: 'close' as const }])
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

function setupSession(ses: Electron.Session): void {
  ses.setUserAgent(CHROME_USER_AGENT)
  try {
    ses.webRequest.onBeforeSendHeaders((details, callback) => {
      const headers = { ...details.requestHeaders }
      headers['User-Agent'] = CHROME_USER_AGENT
      headers['Sec-CH-UA'] = '"Chromium";v="133", "Google Chrome";v="133", "Not?A_Brand";v="99"'
      headers['Sec-CH-UA-Mobile'] = '?0'
      headers['Sec-CH-UA-Platform'] = '"macOS"'
      delete headers['Sec-CH-UA-Model']
      callback({ cancel: false, requestHeaders: headers })
    })
  } catch {
    /* session header hook already attached */
  }
}

function createWindow(): BrowserWindow {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    title: 'Nexus',
    backgroundColor: '#101218',
    ...(process.platform === 'darwin'
      ? {
          titleBarStyle: 'hiddenInset' as const,
          trafficLightPosition: { x: 16, y: 16 }
        }
      : {}),
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webviewTag: true,
      backgroundThrottling: false
    }
  })
  mainWindowRef = mainWindow

  let hasShown = false
  const showSafely = (): void => {
    if (hasShown || mainWindow.isDestroyed()) return
    hasShown = true
    mainWindow.show()
    mainWindow.focus()
    if (process.platform === 'darwin') {
      app.focus({ steal: true })
    }
  }

  // 1. Primary trigger: ready-to-show
  mainWindow.once('ready-to-show', () => {
    showSafely()
  })

  // 2. Secondary trigger: did-finish-load
  mainWindow.webContents.once('did-finish-load', () => {
    showSafely()
  })

  // 3. Fallback safety timer: ensures window ALWAYS shows within 1200ms
  const fallbackTimer = setTimeout(() => {
    showSafely()
  }, 1200)

  mainWindow.once('closed', () => {
    clearTimeout(fallbackTimer)
    mainWindowRef = null
    void cleanupAllPty()
  })

  // WebContents Crash & Reload Protection with infinite-loop prevention
  const crashTimestamps: number[] = []
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error(`[Renderer Process Gone] Reason: ${details.reason}, Code: ${details.exitCode}`)
    const now = Date.now()
    crashTimestamps.push(now)
    // Keep timestamps from the last 30 seconds
    const recentCrashes = crashTimestamps.filter((t) => now - t < 30_000)

    if (recentCrashes.length > 3) {
      console.error(
        '[Renderer Process Gone] Exceeded maximum reload attempts (3 crashes within 30s). Halting reload loop.'
      )
      return
    }

    if (details.reason !== 'clean-exit' && !mainWindow.isDestroyed()) {
      console.log('[Renderer Process Gone] Reloading page...')
      setTimeout(() => {
        if (!mainWindow.isDestroyed()) mainWindow.reload()
      }, 500)
    }
  })

  mainWindow.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL) => {
      console.error(
        `[Renderer Load Failed] Code: ${errorCode}, Desc: ${errorDescription}, URL: ${validatedURL}`
      )
    }
  )

  mainWindow.webContents.setWindowOpenHandler((details) => {
    void openSafeExternal(details.url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, destination) => {
    let allowed = destination === mainWindow.webContents.getURL()
    if (process.env['ELECTRON_RENDERER_URL']) {
      try {
        allowed =
          new URL(destination).origin === new URL(process.env['ELECTRON_RENDERER_URL']).origin
      } catch {
        allowed = false
      }
    }
    if (!allowed) {
      event.preventDefault()
      void openSafeExternal(destination)
    }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  if (!hasSingleInstanceLock) return
  nativeTheme.themeSource = 'dark'
  // Start local loopback OAuth server for Google SSO / external redirects
  void startOAuthServer(() => mainWindowRef)
  // Setup macOS Application Menu with standard Edit roles (undo, redo, cut, copy, paste, selectAll)
  setupApplicationMenu()

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  setupSession(session.defaultSession)

  // Configure every created web-contents (webviews, OAuth popups, browser windows)
  app.on('web-contents-created', (_event, contents) => {
    contents.setUserAgent(CHROME_USER_AGENT)
    setupSession(contents.session)

    // Universal right-click context menu (Cut, Copy, Paste, Select All)
    contents.on('context-menu', (_e, params) => {
      const menu = Menu.buildFromTemplate([
        { role: 'undo' as const },
        { role: 'redo' as const },
        { type: 'separator' as const },
        { role: 'cut' as const, enabled: params.editFlags.canCut },
        { role: 'copy' as const, enabled: params.editFlags.canCopy },
        { role: 'paste' as const, enabled: params.editFlags.canPaste },
        { role: 'pasteAndMatchStyle' as const, enabled: params.editFlags.canPaste },
        { type: 'separator' as const },
        { role: 'selectAll' as const, enabled: params.editFlags.canSelectAll }
      ])
      menu.popup()
    })

    // Handle webviews and popup child windows
    if (contents.getType() === 'webview' || contents.getType() === 'window') {
      contents.setWindowOpenHandler((details) => {
        const url = details.url.toLowerCase()
        if (url !== 'about:blank') {
          try {
            if (!['http:', 'https:'].includes(new URL(details.url).protocol)) {
              return { action: 'deny' }
            }
          } catch {
            return { action: 'deny' }
          }
        }
        const isAuthPopup =
          (details.disposition as string) === 'new-popup' ||
          details.disposition === 'new-window' ||
          details.disposition === 'default' ||
          url.includes('accounts.google.com') ||
          url.includes('google.com/accounts') ||
          url.includes('appleid.apple.com') ||
          url.includes('auth.openai.com') ||
          url.includes('auth0.com') ||
          url.includes('claude.ai') ||
          url.includes('anthropic.com') ||
          url.includes('login.live.com') ||
          url.includes('login.microsoftonline.com') ||
          url.includes('github.com/login') ||
          url.includes('chatgpt.com') ||
          url.includes('accounts.youtube.com') ||
          url === 'about:blank'

        if (isAuthPopup) {
          return {
            action: 'allow',
            overrideBrowserWindowOptions: {
              width: 620,
              height: 760,
              show: true,
              autoHideMenuBar: true,
              title: 'Sign In with Google / AI Login',
              webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                sandbox: true,
                session: contents.session // Preserve cookies in the exact same account partition!
              }
            }
          }
        }

        void openSafeExternal(details.url)
        return { action: 'deny' }
      })
    }
  })

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))
  ipcMain.handle('open-external-url', (_e, url: unknown) =>
    typeof url === 'string' ? openSafeExternal(url) : false
  )

  // Clipboard IPC handlers for seamless token and image paste
  ipcMain.handle('read-clipboard-text', () => {
    try {
      const text = clipboard.readText()
      return typeof text === 'string' ? text : ''
    } catch {
      return ''
    }
  })
  ipcMain.handle('write-clipboard-text', (_e, text: string) => {
    if (typeof text === 'string') {
      try {
        clipboard.writeText(text)
      } catch {
        // ignore
      }
    }
    return true
  })
  ipcMain.handle('read-clipboard-image', async () => {
    try {
      const raw = clipboard as any
      // 1. Try legacy/standard Electron synchronous readImage
      if (typeof raw.readImage === 'function') {
        const img = raw.readImage()
        if (img && !img.isEmpty()) {
          const imageDir = join(app.getPath('temp'), 'nexus-clipboard-images')
          fs.mkdirSync(imageDir, { recursive: true })
          const filePath = join(imageDir, `clipboard_${Date.now()}.png`)
          fs.writeFileSync(filePath, img.toPNG())
          return filePath
        }
      }
      // 2. Try async W3C ClipboardItem read API
      if (typeof clipboard.read === 'function') {
        const items = await clipboard.read()
        for (const item of items) {
          const imageType = item.types.find((t) => t.startsWith('image/'))
          if (imageType) {
            const blob: any = await item.getType(imageType)
            if (blob && typeof blob.arrayBuffer === 'function') {
              const arrayBuffer = await blob.arrayBuffer()
              const buffer = Buffer.from(arrayBuffer)
              if (buffer.length > 0) {
                const imageDir = join(app.getPath('temp'), 'nexus-clipboard-images')
                fs.mkdirSync(imageDir, { recursive: true })
                const filePath = join(imageDir, `clipboard_${Date.now()}.png`)
                fs.writeFileSync(filePath, buffer)
                return filePath
              }
            }
          }
        }
      }
      return null
    } catch (err) {
      console.error('[Clipboard] Failed to read clipboard image:', err)
      return null
    }
  })
  ipcMain.handle('save-clipboard-image-buffer', (_e, buffer: Uint8Array) => {
    try {
      if (buffer && buffer.length > 0) {
        const imageDir = join(app.getPath('temp'), 'nexus-clipboard-images')
        fs.mkdirSync(imageDir, { recursive: true })
        const filePath = join(imageDir, `pasted_${Date.now()}.png`)
        fs.writeFileSync(filePath, Buffer.from(buffer))
        return filePath
      }
      return null
    } catch (err) {
      console.error('[Clipboard] Failed to save image buffer:', err)
      return null
    }
  })

  // Power save blocker IPC bindings

  ipcMain.handle('set-keep-awake', (_e, enable: boolean) => {
    return updatePowerSaveBlocker(Boolean(enable))
  })

  ipcMain.handle('get-keep-awake-status', () => {
    return powerBlockerId !== null && powerSaveBlocker.isStarted(powerBlockerId)
  })

  // System suspend/resume events — notify renderer to reconnect terminals on wake
  const notifyResume = (): void => {
    if (mainWindowRef && !mainWindowRef.isDestroyed()) {
      mainWindowRef.webContents.send('system-resume')
    }
  }
  const notifySuspend = (): void => {
    if (mainWindowRef && !mainWindowRef.isDestroyed()) {
      mainWindowRef.webContents.send('system-suspend')
    }
  }
  powerMonitor.on('resume', notifyResume)
  powerMonitor.on('unlock-screen', notifyResume)
  powerMonitor.on('suspend', notifySuspend)
  powerMonitor.on('lock-screen', notifySuspend)


  // Native desktop notifications for blocked / completed agents
  ipcMain.handle(
    'send-desktop-notification',
    (_e, { title, body, paneId }: { title: string; body: string; paneId?: string }) => {
      if (Notification.isSupported()) {
        const notif = new Notification({
          title: title || 'Nexus Workspace',
          body: body || '',
          silent: false
        })
        if (paneId) {
          notif.on('click', () => {
            if (!mainWindowRef || mainWindowRef.isDestroyed()) return
            if (mainWindowRef.isMinimized()) mainWindowRef.restore()
            mainWindowRef.show()
            mainWindowRef.focus()
            mainWindowRef.webContents.send('notification-focus-terminal', paneId)
          })
        }
        notif.show()
        return true
      }
      return false
    }
  )

  const mainWindow = createWindow()
  initPtyManager()
  initAgentRegistry()
  initAccountManager()
  initFileManager(mainWindow)
  initApiClient()
  initDevToolsManager()

  // Graceful App Restart & Clean Quit IPC handlers
  ipcMain.handle('app-restart', () => {
    app.relaunch()
    app.exit(0)
  })
  ipcMain.handle('app-graceful-quit', () => {
    app.quit()
  })
  ipcMain.handle('app-force-quit', () => {
    handleEmergencyTeardown('app-force-quit IPC')
    app.exit(0)
  })

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    } else if (mainWindowRef && !mainWindowRef.isDestroyed()) {
      if (mainWindowRef.isMinimized()) mainWindowRef.restore()
      mainWindowRef.show()
      mainWindowRef.focus()
    }
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

let terminalShutdownStarted = false
app.on('before-quit', (event) => {
  event.preventDefault()
  if (terminalShutdownStarted) return
  terminalShutdownStarted = true
  // Browser webviews can cancel a second app.quit() through beforeunload.
  // Once PTYs have been retired, exit directly rather than leaving Nexus open.
  const fallback = setTimeout(() => {
    console.warn('Terminal shutdown exceeded six seconds; exiting Nexus.')
    removeSingletonLocksSync()
    app.exit(0)
  }, 6_000)
  // Let the renderer's short workspace and notes autosave timers finish before
  // a direct exit bypasses the normal window lifecycle.
  void Promise.all([
    cleanupAllPty().catch((error) => console.error('Terminal shutdown failed:', error)),
    new Promise<void>((resolve) => setTimeout(resolve, 450))
  ]).finally(() => {
    clearTimeout(fallback)
    try {
      stopOAuthServer()
    } catch {
      // ignore
    }
    removeSingletonLocksSync()
    app.exit(0)
  })
})

app.on('will-quit', () => {
  handleEmergencyTeardown('app.will-quit')
})
