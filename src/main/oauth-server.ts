import http from 'http'
import { URL } from 'url'
import { BrowserWindow } from 'electron'

export interface OAuthCallbackPayload {
  providerId: string
  code?: string
  token?: string
  email?: string
  state?: string
  error?: string
}

let server: http.Server | null = null
let activePort = 19842
let onCallbackListener: ((payload: OAuthCallbackPayload) => void) | null = null

export function getOAuthLoopbackUrl(providerId = 'gemini'): string {
  return `http://127.0.0.1:${activePort}/oauth/callback?provider=${encodeURIComponent(providerId)}`
}

export function setOAuthCallbackListener(listener: (payload: OAuthCallbackPayload) => void): void {
  onCallbackListener = listener
}

export function startOAuthServer(mainWindowGetter: () => BrowserWindow | null): Promise<number> {
  return new Promise((resolve) => {
    if (server) {
      resolve(activePort)
      return
    }

    const tryPort = (port: number): void => {
      const s = http.createServer((req, res) => {
        try {
          const reqUrl = new URL(req.url || '/', `http://127.0.0.1:${port}`)
          const pathname = reqUrl.pathname

          if (
            pathname === '/oauth/callback' ||
            pathname === '/auth/callback' ||
            pathname === '/gemini/callback'
          ) {
            const providerId =
              reqUrl.searchParams.get('provider') ||
              reqUrl.searchParams.get('providerId') ||
              'gemini'
            const code = reqUrl.searchParams.get('code') || undefined
            const token =
              reqUrl.searchParams.get('token') ||
              reqUrl.searchParams.get('access_token') ||
              reqUrl.searchParams.get('id_token') ||
              undefined
            const email =
              reqUrl.searchParams.get('email') || reqUrl.searchParams.get('user_email') || undefined
            const state = reqUrl.searchParams.get('state') || undefined
            const error = reqUrl.searchParams.get('error') || undefined

            const payload: OAuthCallbackPayload = {
              providerId,
              code,
              token,
              email,
              state,
              error
            }

            if (onCallbackListener) {
              onCallbackListener(payload)
            }

            const win = mainWindowGetter()
            if (win && !win.isDestroyed()) {
              if (win.isMinimized()) win.restore()
              win.show()
              win.focus()
              win.webContents.send('oauth-callback-received', payload)
            }

            // Render modern dark-mode success page with auto-close and deep link
            res.writeHead(200, {
              'Content-Type': 'text/html; charset=utf-8',
              'Cache-Control': 'no-store'
            })
            res.end(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Nexus AI Terminal - Authenticated</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background: #0d1117;
      color: #e6edf3;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    .card {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 12px;
      padding: 32px 36px;
      max-width: 440px;
      text-align: center;
      box-shadow: 0 16px 36px rgba(0, 0, 0, 0.4);
    }
    .icon {
      width: 52px;
      height: 52px;
      margin: 0 auto 16px;
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid rgba(16, 185, 129, 0.4);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #10b981;
      font-size: 26px;
    }
    h1 {
      margin: 0 0 10px;
      font-size: 20px;
      font-weight: 600;
    }
    p {
      margin: 0 0 20px;
      color: #8b949e;
      font-size: 14px;
      line-height: 1.5;
    }
    .btn {
      display: inline-block;
      padding: 10px 20px;
      background: #238636;
      color: #ffffff;
      text-decoration: none;
      font-size: 14px;
      font-weight: 600;
      border-radius: 6px;
      transition: background 0.2s;
    }
    .btn:hover { background: #2ea043; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✓</div>
    <h1>Signed In Successfully</h1>
    <p>Your authentication credentials have been securely transmitted to Nexus AI Terminal. You can now close this tab.</p>
    <a class="btn" href="nexus://oauth-complete">Return to Nexus</a>
  </div>
  <script>
    try {
      window.location.href = "nexus://oauth-complete";
      setTimeout(function() { window.close(); }, 1200);
    } catch (e) {}
  </script>
</body>
</html>`)
            return
          }

          // Healthcheck
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ status: 'ok', app: 'Nexus AI Terminal OAuth Server' }))
        } catch {
          res.writeHead(500, { 'Content-Type': 'text/plain' })
          res.end('Internal Server Error')
        }
      })

      s.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          // Port in use, try next
          if (port < 19855) {
            tryPort(port + 1)
          } else {
            console.error('[OAuth Server] No free port found in range 19842-19855')
            resolve(activePort)
          }
        } else {
          console.error('[OAuth Server] Error starting loopback server:', err)
          resolve(activePort)
        }
      })

      s.listen(port, '127.0.0.1', () => {
        server = s
        activePort = port
        console.log(`[OAuth Server] Listening on http://127.0.0.1:${port}`)
        resolve(port)
      })
    }

    tryPort(19842)
  })
}

export function stopOAuthServer(): void {
  if (server) {
    server.close()
    server = null
  }
}
