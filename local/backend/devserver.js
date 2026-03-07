const { spawn } = require('child_process');
const net = require('net');

// Track active dev servers: projectId → { process, port, pid }
const activeServers = new Map();

// Find an available port starting from base
async function findAvailablePort(base = 4910) {
  for (let port = base; port < base + 100; port++) {
    const available = await new Promise((resolve) => {
      const server = net.createServer();
      server.once('error', () => resolve(false));
      server.once('listening', () => {
        server.close();
        resolve(true);
      });
      server.listen(port, '127.0.0.1');
    });
    if (available) return port;
  }
  throw new Error('No available port found');
}

// Start Vite dev server for a project
async function startDevServer(id, projectPath) {
  if (activeServers.has(id)) {
    return activeServers.get(id);
  }

  const port = await findAvailablePort();
  const isWin = process.platform === 'win32';

  const child = spawn(
    isWin ? 'npx.cmd' : 'npx',
    ['vite', '--host', '--port', String(port), '--open', 'false'],
    {
      cwd: projectPath,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    }
  );

  const info = { process: child, port, pid: child.pid, path: projectPath };
  activeServers.set(id, info);

  child.stdout.on('data', (data) => {
    console.log(`[dev:${id}] ${data.toString().trim()}`);
  });

  child.stderr.on('data', (data) => {
    console.error(`[dev:${id}] ${data.toString().trim()}`);
  });

  child.on('exit', (code) => {
    console.log(`[dev:${id}] exited with code ${code}`);
    activeServers.delete(id);
  });

  // Wait a bit for Vite to start
  await new Promise((r) => setTimeout(r, 2000));

  return { port, pid: child.pid };
}

// Stop a project's dev server
function stopDevServer(id) {
  const info = activeServers.get(id);
  if (!info) return false;

  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(info.pid), '/f', '/t'], { shell: true });
    } else {
      process.kill(-info.pid, 'SIGTERM');
    }
  } catch (e) {
    try { info.process.kill('SIGKILL'); } catch {}
  }

  activeServers.delete(id);
  return true;
}

// Get status of a project's dev server
function getDevStatus(id) {
  const info = activeServers.get(id);
  if (!info) return { running: false };
  return { running: true, port: info.port, pid: info.pid };
}

// Cleanup all dev servers on process exit
function cleanupAll() {
  for (const [id] of activeServers) {
    stopDevServer(id);
  }
}

process.on('exit', cleanupAll);
process.on('SIGINT', () => { cleanupAll(); process.exit(); });
process.on('SIGTERM', () => { cleanupAll(); process.exit(); });

module.exports = { startDevServer, stopDevServer, getDevStatus, activeServers };
