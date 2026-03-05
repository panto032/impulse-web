const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dns = require('dns').promises;

const SERVER_IP = process.env.SERVER_IP || '167.99.141.246';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data', 'projects');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// Coolify API config
const COOLIFY_API_URL = process.env.COOLIFY_API_URL || '';
const COOLIFY_TOKEN = process.env.COOLIFY_TOKEN || '';
const COOLIFY_SERVER_UUID = process.env.COOLIFY_SERVER_UUID || '';

// Auth config
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || '';
const AUTH_SECRET = process.env.AUTH_SECRET || crypto.randomBytes(32).toString('hex');

// Sync secret (shared with local backend)
const SYNC_SECRET = process.env.WEB_SYNC_SECRET || 'impulse-sync-2024';

// ── Helpers ──────────────────────────────────────────────────────────────────

const readProject = (id) => {
  const file = path.join(DATA_DIR, `${id}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
};

const writeProject = (project) => {
  fs.writeFileSync(
    path.join(DATA_DIR, `${project.id}.json`),
    JSON.stringify(project, null, 2)
  );
};

async function coolifyApi(method, apiPath, body) {
  if (!COOLIFY_API_URL || !COOLIFY_TOKEN) {
    throw new Error('Coolify nije konfigurisan.');
  }
  const res = await fetch(`${COOLIFY_API_URL}${apiPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${COOLIFY_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { _raw: text, _status: res.status }; }
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Auth helpers
function makeToken(password) {
  return crypto.createHmac('sha256', AUTH_SECRET).update(password).digest('hex');
}

function requireAuth(req, res, next) {
  if (!DASHBOARD_PASSWORD) return next();
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (token !== makeToken(DASHBOARD_PASSWORD)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ── Auth ──────────────────────────────────────────────────────────────────────

const loginAttempts = new Map();
const LOGIN_MAX = 5;
const LOGIN_WINDOW = 15 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [ip, attempts] of loginAttempts) {
    if (attempts.every(t => now - t > LOGIN_WINDOW)) loginAttempts.delete(ip);
  }
}, 60 * 60 * 1000);

app.post('/api/auth/login', (req, res) => {
  if (!DASHBOARD_PASSWORD) return res.json({ ok: true, token: 'dev' });

  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const attempts = (loginAttempts.get(ip) || []).filter(t => now - t < LOGIN_WINDOW);

  if (attempts.length >= LOGIN_MAX) {
    const waitMin = Math.ceil((LOGIN_WINDOW - (now - attempts[0])) / 60000);
    return res.status(429).json({ error: `Previše pokušaja. Pokušaj ponovo za ${waitMin} min.` });
  }

  const { password } = req.body;
  if (!password || password !== DASHBOARD_PASSWORD) {
    loginAttempts.set(ip, [...attempts, now]);
    const remaining = LOGIN_MAX - attempts.length - 1;
    return res.status(401).json({ error: `Pogrešna lozinka. Još ${remaining} pokušaja.` });
  }

  loginAttempts.delete(ip);
  res.json({ ok: true, token: makeToken(DASHBOARD_PASSWORD) });
});

// ── Sync from Local App ──────────────────────────────────────────────────────

function requireSyncAuth(req, res, next) {
  const secret = req.headers['x-sync-secret'];
  if (secret !== SYNC_SECRET) {
    return res.status(403).json({ error: 'Invalid sync secret' });
  }
  next();
}

app.post('/api/sync/project', requireSyncAuth, (req, res) => {
  const project = req.body;
  if (!project?.id) return res.status(400).json({ error: 'Missing project id' });
  writeProject(project);
  console.log(`[sync] Received project: ${project.name}`);
  res.json({ ok: true });
});

app.delete('/api/sync/project/:id', requireSyncAuth, (req, res) => {
  const file = path.join(DATA_DIR, `${req.params.id}.json`);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  console.log(`[sync] Deleted project: ${req.params.id}`);
  res.json({ ok: true });
});

app.get('/api/sync/projects', requireSyncAuth, (req, res) => {
  try {
    const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
    const projects = files.map(f => JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8')));
    res.json(projects);
  } catch (e) {
    res.json([]);
  }
});

// Protect all /api routes except login, sync, and public client endpoint
app.use('/api', (req, res, next) => {
  if (req.path === '/auth/login') return next();
  if (req.path.startsWith('/client/')) return next();
  if (req.path.startsWith('/sync/')) return next();
  if (req.path.startsWith('/license/')) return next();
  requireAuth(req, res, next);
});

// ── License Verification (Public API) ────────────────────────────────────────

app.post('/api/license/verify', (req, res) => {
  const { key } = req.body || {};
  if (!key) return res.status(400).json({ valid: false, reason: 'missing_key' });

  try {
    const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
    for (const f of files) {
      const project = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));
      const licenses = project.licenses || [];
      const license = licenses.find(l => l.key === key);
      if (!license) continue;

      // Found the license
      if (license.status === 'suspended') {
        return res.json({ valid: false, reason: 'suspended' });
      }

      const now = new Date();
      const expiresAt = new Date(license.expiresAt);
      if (expiresAt <= now) {
        // Auto-mark as expired
        license.status = 'expired';
        writeProject(project);
        return res.json({ valid: false, reason: 'expired' });
      }

      if (license.status !== 'active') {
        return res.json({ valid: false, reason: license.status });
      }

      // Valid license - update verification stats
      license.lastVerifiedAt = now.toISOString();
      license.verifyCount = (license.verifyCount || 0) + 1;
      writeProject(project);

      const daysLeft = Math.ceil((expiresAt - now) / 86400000);
      return res.json({
        valid: true,
        plan: license.plan,
        expiresAt: license.expiresAt,
        daysLeft,
      });
    }

    // Key not found in any project
    res.json({ valid: false, reason: 'invalid' });
  } catch (err) {
    console.error('[license/verify] Error:', err.message);
    res.status(500).json({ valid: false, reason: 'server_error' });
  }
});

app.get('/api/license/check/:key', (req, res) => {
  const { key } = req.params;
  if (!key) return res.json({ valid: false });

  try {
    const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
    for (const f of files) {
      const project = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));
      const license = (project.licenses || []).find(l => l.key === key);
      if (!license) continue;

      const valid = license.status === 'active' && new Date(license.expiresAt) > new Date();
      return res.json({ valid });
    }
    res.json({ valid: false });
  } catch {
    res.json({ valid: false });
  }
});

// ── Config ────────────────────────────────────────────────────────────────────

app.get('/api/info', (req, res) => {
  res.json({
    mode: 'web',
    coolifyConfigured: !!(COOLIFY_API_URL && COOLIFY_TOKEN && COOLIFY_SERVER_UUID),
  });
});

// ── Projects (Read-only) ──────────────────────────────────────────────────────

app.get('/api/projects', (req, res) => {
  try {
    const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
    const projects = files
      .map(f => JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8')))
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    res.json(projects);
  } catch (e) {
    res.json([]);
  }
});

app.get('/api/projects/:id', (req, res) => {
  const project = readProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Not found' });
  res.json(project);
});

// Notes update (only field clients can update)
app.put('/api/projects/:id', (req, res) => {
  const existing = readProject(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  // Only allow updating notes and status from web app
  const allowedFields = ['notes', 'status', 'client', 'liveUrl', 'customDomain'];
  const updates = {};
  for (const key of allowedFields) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  const updated = { ...existing, ...updates, id: existing.id, updatedAt: new Date().toISOString() };
  writeProject(updated);
  res.json(updated);
});

// ── Coolify ───────────────────────────────────────────────────────────────────

app.get('/api/projects/:id/coolify-status', async (req, res) => {
  const project = readProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Not found' });
  if (!project.coolifyAppId) return res.json({ configured: false });

  try {
    const result = await coolifyApi('GET', `/applications/${project.coolifyAppId}`);
    res.json({
      configured: true,
      status: result.status,
      domain: project.coolifyDomain,
      name: result.name,
      lastDeployment: result.last_online_at || null,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/projects/:id/coolify-logs', async (req, res) => {
  const project = readProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Not found' });
  if (!project.coolifyAppId) return res.status(400).json({ error: 'Coolify nije podešen.' });

  try {
    const result = await coolifyApi('GET', `/applications/${project.coolifyAppId}/logs`);
    res.json({ ok: true, logs: result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/projects/:id/coolify-deploy', async (req, res) => {
  const project = readProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Not found' });
  if (!project.coolifyAppId) return res.status(400).json({ error: 'Coolify nije podešen.' });

  try {
    const result = await coolifyApi('POST', `/applications/${project.coolifyAppId}/start`);
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Custom Domain ─────────────────────────────────────────────────────────────

app.post('/api/projects/:id/add-domain', (req, res) => {
  const project = readProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Not found' });
  const raw = (req.body.domain || '').replace(/^https?:\/\//i, '').replace(/\/$/, '').toLowerCase().trim();
  if (!raw) return res.status(400).json({ error: 'Domain je obavezan.' });
  const updated = { ...project, customDomain: raw, updatedAt: new Date().toISOString() };
  writeProject(updated);
  res.json({
    ok: true,
    domain: raw,
    records: [
      { type: 'A', name: '@', value: SERVER_IP },
      { type: 'A', name: 'www', value: SERVER_IP },
    ],
    project: updated,
  });
});

app.get('/api/projects/:id/verify-domain', async (req, res) => {
  const project = readProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Not found' });
  if (!project.customDomain) return res.status(400).json({ error: 'Nema podešenog domena.' });
  try {
    const addresses = await dns.resolve4(project.customDomain);
    const verified = addresses.includes(SERVER_IP);
    res.json({ ok: true, verified, addresses, expected: SERVER_IP });
  } catch {
    res.json({ ok: false, verified: false, error: 'DNS ne može da se razreši.' });
  }
});

// ── Client Preview Token ──────────────────────────────────────────────────────

app.post('/api/projects/:id/rotate-token', (req, res) => {
  const project = readProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Not found' });

  const clientToken = crypto.randomBytes(16).toString('hex');
  const updated = { ...project, clientToken, updatedAt: new Date().toISOString() };
  writeProject(updated);
  res.json({ ok: true, clientToken, project: updated });
});

// ── Client Preview (Public) ──────────────────────────────────────────────────

app.get('/api/client/:token', (req, res) => {
  try {
    const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
    const project = files
      .map(f => JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8')))
      .find(p => p.clientToken === req.params.token);

    if (!project) return res.status(404).json({ error: 'Link nije validan.' });

    res.json({
      name: project.name,
      client: project.client,
      status: project.status,
      tech: project.tech || [],
      updatedAt: project.updatedAt,
      liveUrl: project.liveUrl || null,
      notes: project.notes || '',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/client/:token', (req, res) => {
  try {
    const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
    const project = files
      .map(f => JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8')))
      .find(p => p.clientToken === req.params.token);

    if (!project) {
      return res.status(404).send(`<!DOCTYPE html><html lang="sr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Link nije validan</title><link rel="icon" href="https://cdn.hercules.app/file_6WH2g8mYDQmcxkU96kGdgI5c"><link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Geist:wght@900&family=Inter:wght@400;500&display=swap" rel="stylesheet"><style>*{box-sizing:border-box;margin:0;padding:0}body{background:#09090b;color:#f4f4f5;font-family:'Inter',sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;padding:24px;text-align:center}.logo-wrap{display:flex;align-items:center;margin-bottom:36px}.logo-text{font-family:'Geist',sans-serif;font-size:22px;font-weight:900;letter-spacing:.2em;color:#52525b;text-transform:uppercase}.logo-dot{width:8px;height:8px;border-radius:50%;background:#a855f7;margin-left:3px;display:inline-block;position:relative}.logo-dot::after{content:'';position:absolute;inset:-4px;border-radius:50%;background:rgba(168,85,247,0.35);animation:p 2s cubic-bezier(.4,0,.6,1) infinite}@keyframes p{0%{transform:scale(1);opacity:.6}50%{transform:scale(2.2);opacity:0}100%{transform:scale(2.2);opacity:0}}h1{font-size:18px;font-weight:600;color:#52525b;margin-bottom:8px}p{font-size:14px;color:#3f3f46;font-weight:400}</style></head><body><div class="logo-wrap"><span class="logo-text">IMPULSE</span><span class="logo-dot"></span></div><h1>Link nije validan</h1><p>Ovaj link ne postoji ili je istekao.</p></body></html>`);
    }

    const statusMap = {
      'idea':        { label: 'Planiranje', color: '#a855f7', bg: 'rgba(168,85,247,0.12)' },
      'in-progress': { label: 'U razvoju',  color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
      'completed':   { label: 'Završen',    color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
      'deployed':    { label: 'Live',       color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
      'paused':      { label: 'Pauzirano',  color: '#71717a', bg: 'rgba(113,113,122,0.12)' },
    };
    const st = statusMap[project.status] || statusMap['idea'];
    const liveUrl = project.liveUrl;

    const updatedStr = project.updatedAt
      ? new Date(project.updatedAt).toLocaleDateString('sr-Latn-RS', { day: 'numeric', month: 'long', year: 'numeric' })
      : '';

    const techTags = (project.tech || []).map(t => `<span class="tag">${escHtml(t)}</span>`).join('');

    const html = `<!DOCTYPE html>
<html lang="sr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escHtml(project.name)} — Napredak projekta</title>
  <link rel="icon" href="https://cdn.hercules.app/file_6WH2g8mYDQmcxkU96kGdgI5c">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@900&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#09090b;color:#f4f4f5;font-family:'Inter',sans-serif;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px 16px}

    /* Logo - Geist font + purple pulsing dot */
    .logo-wrap{display:flex;align-items:center;justify-content:center;margin-bottom:44px}
    .logo-text{font-family:'Geist',sans-serif;font-size:28px;font-weight:900;letter-spacing:.2em;color:#fff;text-transform:uppercase}
    .logo-dot{width:10px;height:10px;border-radius:50%;background:#a855f7;margin-left:3px;margin-bottom:2px;display:inline-block;position:relative}
    .logo-dot::after{content:'';position:absolute;inset:-5px;border-radius:50%;background:rgba(168,85,247,0.4);animation:pulse-ring 2s cubic-bezier(0.4,0,0.6,1) infinite}
    .logo-dot::before{content:'';position:absolute;inset:0;border-radius:50%;background:#a855f7;animation:pulse-dot 2s ease-in-out infinite}
    @keyframes pulse-ring{0%{transform:scale(1);opacity:.6}50%{transform:scale(2.4);opacity:0}100%{transform:scale(2.4);opacity:0}}
    @keyframes pulse-dot{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.2);opacity:.85}}

    /* Card */
    .card{background:linear-gradient(180deg,#18181b 0%,#111113 100%);border:1px solid #27272a;border-radius:24px;padding:48px 44px;max-width:580px;width:100%;box-shadow:0 25px 60px rgba(0,0,0,0.5),0 0 0 1px rgba(255,255,255,0.03) inset}

    /* Project name */
    h1{font-size:28px;font-weight:800;color:#fff;margin-bottom:6px;line-height:1.25;text-align:center}
    .client-name{font-size:13px;color:#71717a;margin-bottom:24px;text-align:center;font-weight:500}

    /* Status & meta */
    .meta{display:flex;align-items:center;justify-content:center;gap:14px;flex-wrap:wrap;margin-bottom:32px}
    .badge{display:inline-flex;align-items:center;gap:7px;padding:6px 16px;border-radius:100px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;border:1px solid;backdrop-filter:blur(8px)}
    .badge-dot{width:6px;height:6px;border-radius:50%}
    .updated{font-size:12px;color:#52525b}

    /* Sections */
    .section{margin-bottom:28px}
    .section-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:#52525b;margin-bottom:12px;padding-left:2px}

    /* Tags */
    .tags{display:flex;flex-wrap:wrap;gap:8px}
    .tag{padding:5px 14px;background:rgba(39,39,42,0.6);border:1px solid #3f3f46;border-radius:8px;font-size:12px;font-weight:500;color:#a1a1aa;transition:border-color .2s}
    .tag:hover{border-color:#52525b}

    /* Notes */
    .notes{background:rgba(9,9,11,0.6);border:1px solid #27272a;border-radius:14px;padding:20px;font-size:14px;color:#d4d4d8;line-height:1.75;white-space:pre-wrap;max-height:240px;overflow-y:auto}
    .notes::-webkit-scrollbar{width:4px}
    .notes::-webkit-scrollbar-track{background:transparent}
    .notes::-webkit-scrollbar-thumb{background:#27272a;border-radius:4px}

    /* Live button */
    .live-btn{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:16px;background:linear-gradient(135deg,#7c3aed 0%,#a855f7 50%,#c084fc 100%);border-radius:14px;color:#fff;font-size:15px;font-weight:700;text-decoration:none;transition:all .25s;box-shadow:0 4px 20px rgba(168,85,247,0.3);letter-spacing:.02em}
    .live-btn:hover{transform:translateY(-1px);box-shadow:0 8px 30px rgba(168,85,247,0.4)}
    .live-btn svg{width:18px;height:18px}

    /* Progress bar */
    .progress-wrap{margin-bottom:32px}
    .progress-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
    .progress-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:#52525b}
    .progress-pct{font-size:13px;font-weight:700;color:#a855f7}
    .progress-bar{height:6px;background:#27272a;border-radius:6px;overflow:hidden}
    .progress-fill{height:100%;border-radius:6px;background:linear-gradient(90deg,#7c3aed,#a855f7);transition:width .6s ease}

    /* Divider */
    .divider{height:1px;background:linear-gradient(90deg,transparent,#27272a,transparent);margin:28px 0}

    /* Footer note */
    .footer-note{text-align:center;font-size:12px;color:#3f3f46;line-height:1.5}

    /* Footer */
    .footer{margin-top:36px;padding-top:0}
    .footer a{display:inline-flex;align-items:center;gap:0;text-decoration:none;transition:opacity .2s}
    .footer a:hover{opacity:.7}
    .footer-pre{font-size:12px;color:#3f3f46;margin-right:8px;font-weight:400}
    .footer-brand{font-family:'Geist',sans-serif;font-size:14px;font-weight:900;letter-spacing:.18em;color:#52525b;text-transform:uppercase}
    .footer-dot{width:6px;height:6px;border-radius:50%;background:#a855f7;margin-left:2px;display:inline-block;position:relative}
    .footer-dot::after{content:'';position:absolute;inset:-3px;border-radius:50%;background:rgba(168,85,247,0.35);animation:pulse-ring 2s cubic-bezier(0.4,0,0.6,1) infinite}

    /* Responsive */
    @media(max-width:480px){
      .card{padding:32px 24px;border-radius:18px}
      h1{font-size:22px}
      .logo-text{font-size:22px}
    }
  </style>
</head>
<body>
  <div class="logo-wrap">
    <span class="logo-text">IMPULSE</span><span class="logo-dot"></span>
  </div>

  <div class="card">
    <h1>${escHtml(project.name)}</h1>
    ${project.client ? `<div class="client-name">${escHtml(project.client)}</div>` : ''}

    <div class="meta">
      <div class="badge" style="color:${st.color};background:${st.bg};border-color:${st.color}40">
        <span class="badge-dot" style="background:${st.color}"></span>${st.label}
      </div>
      ${updatedStr ? `<span class="updated">Ažurirano ${updatedStr}</span>` : ''}
    </div>

    ${(() => {
      const progressMap = { 'idea': 10, 'in-progress': 50, 'completed': 90, 'deployed': 100, 'paused': 30 };
      const pct = progressMap[project.status] || 10;
      return '<div class="progress-wrap"><div class="progress-header"><span class="progress-label">Napredak</span><span class="progress-pct">' + pct + '%</span></div><div class="progress-bar"><div class="progress-fill" style="width:' + pct + '%"></div></div></div>';
    })()}

    ${techTags ? `<div class="section"><div class="section-label">Tehnologije</div><div class="tags">${techTags}</div></div>` : ''}
    ${project.notes ? `<div class="section"><div class="section-label">Napredak i beleške</div><div class="notes">${escHtml(project.notes)}</div></div>` : ''}
    ${liveUrl ? `<a href="${escHtml(liveUrl)}" target="_blank" rel="noreferrer" class="live-btn"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>Pogledaj live sajt</a>` : ''}

    <div class="divider"></div>
    <div class="footer-note">Ova stranica se automatski ažurira sa napretkom projekta.</div>
  </div>

  <div class="footer">
    <a href="https://www.impulsee.cloud" target="_blank" rel="noreferrer">
      <span class="footer-pre">Kreirao</span>
      <span class="footer-brand">IMPULSE</span><span class="footer-dot"></span>
    </a>
  </div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    res.status(500).send('Greška na serveru.');
  }
});

// ── Serve Frontend (production) ───────────────────────────────────────────────

const frontendDist = path.join(__dirname, 'public');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  // SPA fallback - serve index.html for all non-API routes
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/client/')) {
      res.sendFile(path.join(frontendDist, 'index.html'));
    }
  });
}

// ── Start ─────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 4903;
app.listen(PORT, () => {
  console.log(`IMPULSE Web backend: http://localhost:${PORT}`);
});
