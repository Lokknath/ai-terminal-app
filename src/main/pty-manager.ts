import * as pty from 'node-pty';
import { ipcMain, BrowserWindow } from 'electron';
import os from 'os';

const ptyProcesses = new Map<string, pty.IPty>();
const shell = os.platform() === 'win32' ? 'powershell.exe' : process.env.SHELL || 'bash';

export function initPtyManager(mainWindow: BrowserWindow) {
  ipcMain.on('pty-create', (event, id: string, name: string, cwd: string) => {
    console.log('Spawning PTY:', id, name, cwd)
    if (ptyProcesses.has(id)) return;

    try {
      const ptyProcess = pty.spawn(shell, [], {
        name: 'xterm-color',
        cols: 80,
        rows: 30,
        cwd: cwd || process.env.HOME,
        env: { ...process.env, TERMINAL_NAME: name } as Record<string, string>
      });

      console.log('PTY Spawned successfully:', ptyProcess.pid);

      ptyProcess.onData((data) => {
        mainWindow.webContents.send(`pty-out-${id}`, data);
      });

      ptyProcess.onExit((exitCode) => {
        console.log('PTY exited:', exitCode)
        mainWindow.webContents.send(`pty-exit-${id}`, exitCode);
        ptyProcesses.delete(id);
      });

      ptyProcesses.set(id, ptyProcess);
    } catch (err) {
      console.error('Error spawning PTY:', err);
    }
  });

  ipcMain.on('pty-restart', (event, id: string, name: string, cwd: string) => {
    console.log('Restarting PTY:', id);
    const existingPty = ptyProcesses.get(id);
    if (existingPty) {
      existingPty.kill();
      ptyProcesses.delete(id);
    }
    
    // Slight delay to ensure the OS kills the previous process cleanly
    setTimeout(() => {
      try {
        const ptyProcess = pty.spawn(shell, [], {
          name: 'xterm-color',
          cols: 80,
          rows: 30,
          cwd: cwd || process.env.HOME,
          env: { ...process.env, TERMINAL_NAME: name } as Record<string, string>
        });

        ptyProcess.onData((data) => {
          mainWindow.webContents.send(`pty-out-${id}`, data);
        });

        ptyProcess.onExit((exitCode) => {
          mainWindow.webContents.send(`pty-exit-${id}`, exitCode);
          ptyProcesses.delete(id);
        });

        ptyProcesses.set(id, ptyProcess);
      } catch (err) {
        console.error('Error restarting PTY:', err);
      }
    }, 100);
  });

  ipcMain.on('pty-write', (event, id: string, data: string) => {
    const ptyProcess = ptyProcesses.get(id);
    if (ptyProcess) {
      ptyProcess.write(data);
    }
  });

  ipcMain.on('pty-resize', (event, id: string, cols: number, rows: number) => {
    const ptyProcess = ptyProcesses.get(id);
    if (ptyProcess) {
      ptyProcess.resize(cols, rows);
    }
  });

  ipcMain.on('pty-kill', (event, id: string) => {
    const ptyProcess = ptyProcesses.get(id);
    if (ptyProcess) {
      ptyProcess.kill();
      ptyProcesses.delete(id);
    }
  });
}
