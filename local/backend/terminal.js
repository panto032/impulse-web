const { WebSocketServer } = require('ws');
const os = require('os');

let pty;
try {
  pty = require('node-pty');
} catch (e) {
  console.warn('[terminal] node-pty not available:', e.message);
  console.warn('[terminal] Terminal functionality will be disabled.');
  console.warn('[terminal] Install with: npm install node-pty');
}

const { stopDevServer } = require('./devserver');

// Active terminal sessions: projectId → { ptyProcess, ws[] }
const sessions = new Map();

function setupTerminalServer(server) {
  if (!pty) {
    console.log('[terminal] Skipping WebSocket setup (node-pty not available)');
    return;
  }

  const wss = new WebSocketServer({ noServer: true });

  // Handle upgrade requests for /terminal/:id
  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url, 'http://localhost');
    const match = url.pathname.match(/^\/terminal\/(.+)$/);
    if (!match) {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      const projectId = match[1];
      const cmd = url.searchParams.get('cmd') || null;
      const cwd = url.searchParams.get('cwd') || null;
      handleConnection(ws, projectId, cmd, cwd);
    });
  });

  console.log('[terminal] WebSocket server ready on /terminal/:id');
}

function handleConnection(ws, projectId, cmd, cwd) {
  const isWin = process.platform === 'win32';
  const shell = isWin ? 'powershell.exe' : (process.env.SHELL || '/bin/bash');
  const args = isWin ? [] : [];

  // Determine working directory
  const workDir = cwd || process.cwd();

  console.log(`[terminal] New session for project ${projectId}, cwd: ${workDir}, cmd: ${cmd || 'shell'}`);

  let session = sessions.get(projectId);

  if (!session || session.ptyProcess.exitCode !== undefined) {
    // Create new pty process
    const ptyProcess = pty.spawn(shell, args, {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd: workDir,
      env: { ...process.env, TERM: 'xterm-256color', CLAUDECODE: '' },
    });

    session = { ptyProcess, clients: new Set() };
    sessions.set(projectId, session);

    // If cmd is specified, send it after a short delay
    if (cmd) {
      setTimeout(() => {
        if (cmd === 'claude') {
          ptyProcess.write('claude --dangerously-skip-permissions\r');
        } else {
          ptyProcess.write(cmd + '\r');
        }
      }, 500);
    }

    ptyProcess.onData((data) => {
      for (const client of session.clients) {
        if (client.readyState === 1) {
          client.send(JSON.stringify({ type: 'data', data }));
        }
      }
    });

    ptyProcess.onExit(({ exitCode }) => {
      console.log(`[terminal] pty exited for ${projectId}, code: ${exitCode}`);
      // Stop the dev server for this specific project
      stopDevServer(projectId);
      for (const client of session.clients) {
        if (client.readyState === 1) {
          client.send(JSON.stringify({ type: 'exit', code: exitCode }));
          client.close();
        }
      }
      sessions.delete(projectId);
    });
  }

  session.clients.add(ws);

  ws.on('message', (msg) => {
    try {
      const parsed = JSON.parse(msg.toString());
      if (parsed.type === 'data' && parsed.data) {
        session.ptyProcess.write(parsed.data);
      } else if (parsed.type === 'resize' && parsed.cols && parsed.rows) {
        session.ptyProcess.resize(parsed.cols, parsed.rows);
      }
    } catch {
      // Raw data fallback
      session.ptyProcess.write(msg.toString());
    }
  });

  ws.on('close', () => {
    session.clients.delete(ws);
    // If no more clients, kill the pty after a grace period
    if (session.clients.size === 0) {
      setTimeout(() => {
        const current = sessions.get(projectId);
        if (current && current.clients.size === 0) {
          try { current.ptyProcess.kill(); } catch {}
          sessions.delete(projectId);
        }
      }, 5000);
    }
  });
}

module.exports = { setupTerminalServer };
