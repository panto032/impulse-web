require('dotenv').config({ path: '../../.env' });
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { exec } = require('child_process');
const multer = require('multer');
const http = require('http');
const { setupTerminalServer } = require('./terminal');
const { startDevServer, stopDevServer, getDevStatus } = require('./devserver');

// Ensure GitHub CLI is in PATH (Windows install location)
const ghCliPath = 'C:\\Program Files\\GitHub CLI';
if (fs.existsSync(ghCliPath) && !process.env.PATH.includes(ghCliPath)) {
  process.env.PATH = ghCliPath + path.delimiter + process.env.PATH;
}

// Check if gh CLI is available
let ghAvailable = false;
try {
  require('child_process').execSync('gh --version', { stdio: 'ignore', timeout: 5000 });
  ghAvailable = true;
} catch {
  console.warn('[startup] GitHub CLI (gh) not found — "Novi Projekat" neće moći da kreira GitHub repo automatski.');
  console.warn('[startup] Instaliraj: winget install GitHub.cli && gh auth login');
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const DATA_DIR = path.join(__dirname, 'data', 'projects');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const PROJECTS_DIR = process.env.PROJECTS_DIR || 'C:/projects';

// Coolify API config
const COOLIFY_API_URL = process.env.COOLIFY_API_URL || '';
const COOLIFY_TOKEN = process.env.COOLIFY_TOKEN || '';
const COOLIFY_SERVER_UUID = process.env.COOLIFY_SERVER_UUID || '';
const COOLIFY_PRIVATE_KEY_UUID = process.env.COOLIFY_PRIVATE_KEY_UUID || '';

// Convert GitHub URL to SSH format for private repos (git@github.com:owner/repo.git)
function toGitSshUrl(url) {
  if (!url) return url;
  if (url.startsWith('git@')) return url;
  // https://github.com/owner/repo or owner/repo format
  const match = url.match(/(?:https?:\/\/github\.com\/)?([^\/]+\/[^\/\s]+)/);
  if (match) {
    const repo = match[1].replace(/\.git$/, '');
    return `git@github.com:${repo}.git`;
  }
  return url;
}

// GitHub org for gh repo create
const GITHUB_ORG = process.env.GITHUB_ORG || 'panto032';

// Web app sync config
const WEB_API_URL = process.env.WEB_API_URL || 'https://app.impulsee.dev';
const WEB_SYNC_SECRET = process.env.WEB_SYNC_SECRET || 'impulse-sync-2024';

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

const run = (command, cwd, timeout = 120000) =>
  new Promise((resolve) => {
    exec(command, { cwd, timeout, shell: true, windowsHide: false }, (err, stdout, stderr) => {
      resolve({ ok: !err, stdout: stdout || '', stderr: stderr || '', error: err?.message || '' });
    });
  });

function slugify(name) {
  return (name || 'projekat')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim() || 'projekat';
}

function uniqueServerPath(name) {
  const base = slugify(name);
  let candidate = path.join(PROJECTS_DIR, base);
  let i = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(PROJECTS_DIR, `${base}-${i}`);
    i++;
  }
  return candidate;
}

const CLAUDE_INFRA = `## Infrastruktura & Deploy
- **Deploy:** Coolify PaaS sa Nixpacks build packom (auto-detektuje tech stack)
- **Domen:** projekat dobija *.impulsee.dev subdomen automatski
- **VAŽNO za Nixpacks:**
  - package.json MORA imati "build" i "start" skripte
  - Za frontend (React/Vite): build → "vite build", start treba servirati dist/ folder
  - Za backend (Node/Express): start → "node server.js"
  - Port MORA biti 3000 (ili čitaj iz process.env.PORT)
  - Nixpacks čita package.json da odredi kako da builduje i pokrene app
- **Static site (React/Vite):** dodaj "serve" dependency i start script: "serve dist -s -l 3000"
  Ili koristi express static server. Nixpacks NEĆE automatski servirati statičke fajlove.
- **Environment varijable:** se dodaju kroz Coolify UI, ne hardkoduj tajne u kod
- **.gitignore:** node_modules/, dist/, .env - NIKAD ne komituj ove foldere
- **Git workflow:** commit + push na main → Coolify automatski deployuje

## Opšta pravila
- Jezik UI-ja: srpski (sr-Latn-RS)
- Mobile-first responsive dizajn
- Piši čist, čitljiv kod bez nepotrebnih komentara
- Referentni materijali (slike, dokumenti) su u _docs/ folderu`;

const CLAUDE_TEMPLATES = {
  'React + Vite': `## Tech Stack
- React 18 + Vite
- Tailwind CSS za stilizovanje
- Lucide React za ikone

${CLAUDE_INFRA}

## Setup za deploy
- package.json scripts:
  "dev": "vite",
  "build": "vite build",
  "start": "serve dist -s -l 3000"
- Instaliraj serve: npm install serve
- Koristi funkcionalne komponente i React hooks
- Koristi Tailwind CSS klase, ne piši custom CSS
- Sav kod piši u src/ folderu
- Pokreni dev server sa: npm run dev (port 5173)`,

  'Next.js': `## Tech Stack
- Next.js 14+ (App Router)
- Tailwind CSS za stilizovanje
- TypeScript

${CLAUDE_INFRA}

## Setup za deploy
- package.json scripts:
  "dev": "next dev",
  "build": "next build",
  "start": "next start -p 3000"
- Koristi App Router (app/ direktorijum)
- Server Components po defaultu, 'use client' samo kad treba
- API rute idu u app/api/
- Pokreni dev server sa: npm run dev`,

  'Node.js + Express': `## Tech Stack
- Node.js + Express
- JSON file storage u data/ folderu

${CLAUDE_INFRA}

## Setup za deploy
- package.json scripts:
  "start": "node server.js"
- Sluša na process.env.PORT || 3000
- RESTful API dizajn
- Error handling sa try/catch na svakom route-u
- CORS omogućen
- Pokreni sa: node server.js`,

  'Landing Page': `## Tech Stack
- Vanilla HTML/CSS/JS
- Vite za dev server i build

${CLAUDE_INFRA}

## Setup za deploy
- package.json scripts:
  "dev": "vite",
  "build": "vite build",
  "start": "serve dist -s -l 3000"
- Instaliraj: npm install vite serve
- Jedan index.html sa linked CSS/JS
- Brz load time, minimalne dependencije
- SEO meta tagovi (title, description, og:image)
- Pokreni dev server sa: npx vite (port 5173)`,

  'Prazno': CLAUDE_INFRA,
};

function generateLicenseKey() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const seg = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `IMP-${seg()}-${seg()}-${seg()}`;
}

function initProjectFolder(serverPath, projectName, claudeTemplateName, claudeInstructions, includeLicensing) {
  fs.mkdirSync(path.join(serverPath, '_docs'), { recursive: true });
  const claudeMdPath = path.join(serverPath, 'CLAUDE.md');
  if (!fs.existsSync(claudeMdPath)) {
    const templateContent = CLAUDE_TEMPLATES[claudeTemplateName] || claudeTemplateName || '';
    const templateSection = templateContent ? `\n${templateContent}\n` : '';
    const descSection = claudeInstructions
      ? `## Opis projekta\n${claudeInstructions}`
      : '## Opis projekta\nOvde dodaj opis i kontekst za Claude AI agenta.';
    const licensingSection = includeLicensing ? `\n## Licenciranje
Ovaj projekat koristi IMPULSE sistem licenciranja.
API: POST https://app.impulsee.dev/api/license/verify
Body: { "key": "LICENCE_KEY" iz env IMPULSE_LICENSE_KEY }
- Na startu: verify licence, ako invalid → blokiraj admin panel
- Offline fallback: nastavi rad normalno
- Dodaj middleware za admin rute koji provjerava licencu
` : '';
    fs.writeFileSync(
      claudeMdPath,
      `# ${projectName}\n${templateSection}\n${descSection}${licensingSection}\n\n## Gde smo stali\n- \n\n## Šta treba uraditi\n- \n`
    );
  }
  // Create .gitignore if it doesn't exist
  const giPath = path.join(serverPath, '.gitignore');
  if (!fs.existsSync(giPath)) {
    fs.writeFileSync(giPath, `node_modules/\n.vite/\ndist/\n.env\n.env.local\n*.log\n.DS_Store\nThumbs.db\n_docs/\n`);
  }
}

async function coolifyApi(method, apiPath, body) {
  if (!COOLIFY_API_URL || !COOLIFY_TOKEN) {
    throw new Error('Coolify nije konfigurisan (env vars: COOLIFY_API_URL, COOLIFY_TOKEN).');
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

// ── Sync to Web App ──────────────────────────────────────────────────────────

async function syncToWeb(project) {
  try {
    // Strip local-only fields before sending to web
    const { serverPath, ...webProject } = project;
    const res = await fetch(`${WEB_API_URL}/api/sync/project`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sync-Secret': WEB_SYNC_SECRET,
      },
      body: JSON.stringify(webProject),
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      console.log(`[sync] Project "${project.name}" synced to web.`);
    } else {
      console.warn(`[sync] Failed to sync "${project.name}": ${res.status}`);
    }
  } catch (err) {
    console.warn(`[sync] Web app not reachable: ${err.message}`);
  }
}

async function syncDeleteToWeb(projectId) {
  try {
    await fetch(`${WEB_API_URL}/api/sync/project/${projectId}`, {
      method: 'DELETE',
      headers: { 'X-Sync-Secret': WEB_SYNC_SECRET },
      signal: AbortSignal.timeout(5000),
    });
    console.log(`[sync] Project ${projectId} deleted from web.`);
  } catch (err) {
    console.warn(`[sync] Web delete not reachable: ${err.message}`);
  }
}

// ── Push All Local Projects to Web ───────────────────────────────────────────

async function pushAllToWeb() {
  try {
    const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
    let pushed = 0;
    for (const f of files) {
      try {
        const project = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));
        await syncToWeb(project);
        pushed++;
      } catch {}
    }
    if (pushed > 0) console.log(`[sync] Pushed ${pushed} local projects to web.`);
  } catch {}
}

// ── Pull Projects from Web ───────────────────────────────────────────────────

async function pullFromWeb() {
  try {
    const res = await fetch(`${WEB_API_URL}/api/sync/projects`, {
      headers: { 'X-Sync-Secret': WEB_SYNC_SECRET },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      console.warn(`[sync] Pull from web failed: ${res.status}`);
      return { ok: false, pulled: 0, skipped: 0, error: `Web app returned status ${res.status}` };
    }
    const text = await res.text();
    let webProjects;
    try {
      webProjects = JSON.parse(text);
    } catch {
      console.warn(`[sync] Web app returned non-JSON response: ${text.substring(0, 200)}`);
      return { ok: false, pulled: 0, skipped: 0, error: 'Web app nije vratio validan JSON. Proveri WEB_API_URL konfiguraciju.' };
    }
    if (!Array.isArray(webProjects)) {
      console.warn(`[sync] Expected array, got:`, webProjects);
      return { ok: false, pulled: 0, skipped: 0, error: 'Neočekivan odgovor od web app-a.' };
    }
    let pulled = 0, skipped = 0;
    for (const wp of webProjects) {
      if (readProject(wp.id)) {
        skipped++;
      } else {
        writeProject(wp);
        pulled++;
      }
    }
    return { ok: true, pulled, skipped };
  } catch (err) {
    console.warn(`[sync] Web app not reachable for pull: ${err.message}`);
    return { ok: false, pulled: 0, skipped: 0, error: err.message };
  }
}

// Multer: uploads go to serverPath/_docs/
const uploadStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const project = readProject(req.params.id);
    if (!project || !project.serverPath) {
      return cb(new Error('Server folder nije kreiran za ovaj projekat.'));
    }
    const docsDir = path.join(project.serverPath, '_docs');
    try {
      fs.mkdirSync(docsDir, { recursive: true });
      cb(null, docsDir);
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => cb(null, file.originalname),
});

const upload = multer({ storage: uploadStorage, limits: { fileSize: 50 * 1024 * 1024 } });

// ── Config ────────────────────────────────────────────────────────────────────

app.get('/api/info', (req, res) => {
  res.json({
    mode: 'local',
    projectsDir: PROJECTS_DIR,
    coolifyConfigured: !!(COOLIFY_API_URL && COOLIFY_TOKEN && COOLIFY_SERVER_UUID),
    githubOrg: GITHUB_ORG,
    ghAvailable,
  });
});

// ── Pull from Web ─────────────────────────────────────────────────────────────

app.post('/api/pull-from-web', async (req, res) => {
  try {
    const result = await pullFromWeb();
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Projects CRUD ─────────────────────────────────────────────────────────────

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

// One-click project creation:
// 1. gh repo create → GitHub repo + clone
// 2. initProjectFolder → _docs/ + CLAUDE.md
// 3. git add + commit + push → initial commit
// 4. Coolify API → create app with subdomain
// 5. Save JSON
app.post('/api/projects', async (req, res) => {
  const now = new Date().toISOString();
  const name = req.body.name || '';
  const githubOrg = req.body.githubOrg || GITHUB_ORG;
  const slug = slugify(name);

  // Ensure PROJECTS_DIR exists
  try { fs.mkdirSync(PROJECTS_DIR, { recursive: true }); } catch {}

  const serverPath = uniqueServerPath(name);
  const folderName = path.basename(serverPath);

  const steps = [];
  let github = '';
  const cloneUrl = (req.body.cloneUrl || '').trim();

  // Step 1: Create GitHub repo + clone (or clone from existing URL)
  if (!cloneUrl && !ghAvailable) {
    steps.push({ step: 'github', ok: false, output: 'GitHub CLI (gh) nije instaliran. Instaliraj: winget install GitHub.cli && gh auth login' });
  }

  if (cloneUrl) {
    // Clone from existing repo URL
    try {
      const cloneResult = await run(
        `git clone "${cloneUrl}" "${serverPath}"`,
        PROJECTS_DIR,
        120000
      );
      if (cloneResult.ok) {
        github = cloneUrl.replace(/\.git$/, '');
        steps.push({ step: 'clone', ok: true, output: 'Repo kloniran sa postojećeg URL-a.' });
      } else {
        steps.push({ step: 'clone', ok: false, output: cloneResult.stderr || cloneResult.error });
        fs.mkdirSync(serverPath, { recursive: true });
        await run('git init', serverPath);
      }
    } catch (err) {
      steps.push({ step: 'clone', ok: false, output: err.message });
      fs.mkdirSync(serverPath, { recursive: true });
      await run('git init', serverPath);
    }
  } else {
    // Create new GitHub repo + clone
    try {
      const createResult = await run(
        `gh repo create ${githubOrg}/${folderName} --private`,
        PROJECTS_DIR,
        30000
      );
      if (createResult.ok) {
        github = `https://github.com/${githubOrg}/${folderName}`;
        const cloneResult = await run(
          `git clone "${github}" "${serverPath}"`,
          PROJECTS_DIR,
          60000
        );
        if (cloneResult.ok) {
          steps.push({ step: 'github', ok: true, output: 'Repo kreiran i kloniran.' });
        } else {
          steps.push({ step: 'github', ok: false, output: cloneResult.stderr || cloneResult.error });
          fs.mkdirSync(serverPath, { recursive: true });
          await run('git init', serverPath);
        }
      } else {
        steps.push({ step: 'github', ok: false, output: createResult.stderr || createResult.error });
        fs.mkdirSync(serverPath, { recursive: true });
        await run('git init', serverPath);
      }
    } catch (err) {
      steps.push({ step: 'github', ok: false, output: err.message });
      fs.mkdirSync(serverPath, { recursive: true });
      await run('git init', serverPath);
    }
  }

  // Step 2: Init project folder structure
  initProjectFolder(serverPath, name, req.body.claudeTemplate, req.body.claudeInstructions, req.body.includeLicensing);
  steps.push({ step: 'init', ok: true });

  // Step 3: Initial commit + push
  try {
    await run('git add -A', serverPath);
    const commitResult = await run('git commit -m "Initial commit - IMPULSE project setup"', serverPath);
    steps.push({ step: 'commit', ok: commitResult.ok, output: commitResult.stdout });

    if (github) {
      const pushResult = await run('git push -u origin main', serverPath, 30000);
      steps.push({ step: 'push', ok: pushResult.ok, output: pushResult.stdout || pushResult.stderr });
    }
  } catch (err) {
    steps.push({ step: 'git', ok: false, output: err.message });
  }

  // Step 4: Coolify auto-setup
  let coolifyAppId = '';
  let coolifyDomain = '';
  let coolifyWarning = null;

  if (github && COOLIFY_API_URL && COOLIFY_TOKEN && COOLIFY_SERVER_UUID) {
    try {
      coolifyDomain = `https://${slug}.impulsee.dev`;

      let projectUuid = process.env.COOLIFY_PROJECT_UUID || '';
      if (!projectUuid) {
        const projects = await coolifyApi('GET', '/projects');
        const firstProject = Array.isArray(projects) ? projects[0] : null;
        if (firstProject?.uuid) projectUuid = firstProject.uuid;
      }

      const usePrivateKey = !!COOLIFY_PRIVATE_KEY_UUID;
      const endpoint = usePrivateKey ? '/applications/private-deploy-key' : '/applications/public';
      const result = await coolifyApi('POST', endpoint, {
        project_uuid: projectUuid || undefined,
        server_uuid: COOLIFY_SERVER_UUID,
        environment_name: 'production',
        git_repository: usePrivateKey ? toGitSshUrl(github) : github,
        git_branch: 'main',
        build_pack: 'nixpacks',
        name: name,
        domains: coolifyDomain,
        ports_exposes: '3000',
        instant_deploy: false,
        ...(usePrivateKey ? { private_key_uuid: COOLIFY_PRIVATE_KEY_UUID } : {}),
      });

      const resultItem = Array.isArray(result) ? result[0] : result;
      const appId = resultItem?.uuid || resultItem?.id || resultItem?.data?.uuid;
      if (appId) {
        coolifyAppId = appId;
        steps.push({ step: 'coolify', ok: true, domain: coolifyDomain });
      } else {
        coolifyWarning = 'Coolify auto-setup nije vratio UUID.';
        steps.push({ step: 'coolify', ok: false, output: JSON.stringify(resultItem) });
      }
    } catch (err) {
      coolifyWarning = `Coolify auto-setup greška: ${err.message}`;
      steps.push({ step: 'coolify', ok: false, output: err.message });
    }
  }

  // Step 5: Save project JSON
  const project = {
    id: crypto.randomUUID(),
    name,
    client: '',
    description: '',
    status: 'idea',
    tech: req.body.tech || [],
    serverPath,
    github,
    coolifyAppId,
    coolifyDomain,
    liveUrl: coolifyDomain || '',
    notes: '',
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: null,
    clientToken: crypto.randomBytes(16).toString('hex'),
  };
  writeProject(project);
  syncToWeb(project); // async, don't await

  res.json({ ...project, _steps: steps, _coolifyWarning: coolifyWarning });
});

app.get('/api/projects/:id', (req, res) => {
  const project = readProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Not found' });
  res.json(project);
});

app.put('/api/projects/:id', (req, res) => {
  const existing = readProject(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const updated = { ...existing, ...req.body, id: existing.id, updatedAt: new Date().toISOString() };
  writeProject(updated);
  syncToWeb(updated); // async, don't await
  res.json(updated);
});

app.delete('/api/projects/:id', (req, res) => {
  const file = path.join(DATA_DIR, `${req.params.id}.json`);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  syncDeleteToWeb(req.params.id); // async, don't await
  res.json({ success: true });
});

// ── Folder Management ─────────────────────────────────────────────────────────

app.post('/api/projects/:id/create-folder', (req, res) => {
  const project = readProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Not found' });

  let serverPath = project.serverPath;
  if (!serverPath) {
    try { fs.mkdirSync(PROJECTS_DIR, { recursive: true }); } catch {}
    serverPath = uniqueServerPath(project.name || 'projekat');
  }

  try {
    initProjectFolder(serverPath, project.name);
    const updated = { ...project, serverPath, updatedAt: new Date().toISOString() };
    writeProject(updated);
    res.json({ ok: true, serverPath, project: updated });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── File Management ───────────────────────────────────────────────────────────

app.get('/api/projects/:id/files', (req, res) => {
  const project = readProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Not found' });

  const sp = project.serverPath;
  if (!sp || !fs.existsSync(sp)) {
    return res.json({ folderExists: false, docs: [], rootFiles: [], gitExists: false });
  }

  const docsPath = path.join(sp, '_docs');
  const docs = fs.existsSync(docsPath)
    ? fs.readdirSync(docsPath)
        .filter(f => !f.startsWith('.'))
        .map(f => {
          const stat = fs.statSync(path.join(docsPath, f));
          return { name: f, path: `_docs/${f}`, size: stat.size, mtime: stat.mtime };
        })
    : [];

  const rootFiles = fs.readdirSync(sp)
    .filter(f => {
      if (f.startsWith('.') || f === '_docs') return false;
      return !fs.statSync(path.join(sp, f)).isDirectory();
    })
    .map(f => {
      const stat = fs.statSync(path.join(sp, f));
      return { name: f, path: f, size: stat.size, mtime: stat.mtime };
    });

  res.json({
    folderExists: true,
    serverPath: sp,
    docs,
    rootFiles,
    gitExists: fs.existsSync(path.join(sp, '.git')),
  });
});

app.get('/api/projects/:id/files/download', (req, res) => {
  const project = readProject(req.params.id);
  if (!project || !project.serverPath) return res.status(404).json({ error: 'Not found' });

  const filePath = path.resolve(project.serverPath, req.query.path || '');
  if (!filePath.startsWith(path.resolve(project.serverPath))) {
    return res.status(403).json({ error: 'Access denied' });
  }
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
  res.download(filePath);
});

app.post('/api/projects/:id/upload', (req, res) => {
  upload.array('files', 20)(req, res, (err) => {
    if (err) return res.status(400).json({ ok: false, error: err.message });
    res.json({ ok: true, uploaded: req.files?.map(f => f.originalname) || [] });
  });
});

app.delete('/api/projects/:id/files', (req, res) => {
  const project = readProject(req.params.id);
  if (!project || !project.serverPath) return res.status(404).json({ error: 'Not found' });

  const filePath = path.resolve(project.serverPath, req.query.path || '');
  if (!filePath.startsWith(path.resolve(project.serverPath))) {
    return res.status(403).json({ error: 'Access denied' });
  }
  try {
    fs.unlinkSync(filePath);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Publish (git add + commit + push) ─────────────────────────────────────────

app.post('/api/projects/:id/publish', async (req, res) => {
  const project = readProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Not found' });

  const dir = project.serverPath;
  if (!dir || !fs.existsSync(dir)) {
    return res.status(400).json({ error: 'Folder nije postavljen ili ne postoji.' });
  }

  const message = req.body.message || `Update ${new Date().toLocaleString('sr-Latn-RS')}`;

  if (!fs.existsSync(path.join(dir, '.git'))) {
    const initResult = await run('git init', dir);
    if (!initResult.ok) return res.json({ ok: false, output: `git init failed:\n${initResult.stderr}` });
  }

  const addResult = await run('git add -A', dir);
  const commitResult = await run(`git commit -m "${message}"`, dir);

  if (!commitResult.ok && commitResult.stdout.includes('nothing to commit')) {
    return res.json({ ok: true, output: 'Nema promena za commit.' });
  }

  const pushResult = await run('git push', dir);

  const output = [
    addResult.stdout, addResult.stderr,
    commitResult.stdout, commitResult.stderr,
    pushResult.stdout, pushResult.stderr,
  ].filter(Boolean).join('\n').trim();

  // Record publish in history
  const history = project.deployHistory || [];
  history.unshift({
    id: crypto.randomUUID(),
    action: 'publish',
    status: pushResult.ok ? 'success' : 'failed',
    message,
    timestamp: new Date().toISOString(),
  });
  if (history.length > 50) history.length = 50;
  const updated = { ...project, deployHistory: history, updatedAt: new Date().toISOString() };
  writeProject(updated);
  syncToWeb(updated);

  res.json({ ok: pushResult.ok, output: output || 'Push završen.' });
});

// ── Dev Server Management ─────────────────────────────────────────────────────

app.post('/api/projects/:id/dev-start', async (req, res) => {
  const project = readProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Not found' });

  const dir = project.serverPath;
  if (!dir || !fs.existsSync(dir)) {
    return res.status(400).json({ error: 'Server folder ne postoji.' });
  }

  try {
    const result = await startDevServer(project.id, dir);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/projects/:id/dev-stop', (req, res) => {
  const project = readProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Not found' });

  const stopped = stopDevServer(project.id);
  res.json({ ok: true, stopped });
});

app.get('/api/projects/:id/dev-status', (req, res) => {
  const project = readProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Not found' });

  res.json(getDevStatus(project.id));
});

// ── Git Clone ─────────────────────────────────────────────────────────────────

app.post('/api/projects/:id/clone', async (req, res) => {
  const project = readProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Not found' });

  const sp = project.serverPath;
  if (!sp) return res.status(400).json({ error: 'Server folder nije kreiran.' });

  const repoUrl = req.body.url || project.github;
  if (!repoUrl) return res.status(400).json({ error: 'Unesi URL GitHub repozitorijuma.' });

  // Already a git repo → pull
  if (fs.existsSync(path.join(sp, '.git'))) {
    const result = await run('git pull', sp, 60000);
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n');
    return res.json({ ok: result.ok, output: output || 'Već ažurirano.' });
  }

  // Save _docs before clone
  const docsPath = path.join(sp, '_docs');
  const savedDocs = [];
  if (fs.existsSync(docsPath)) {
    for (const f of fs.readdirSync(docsPath)) {
      savedDocs.push({ name: f, buf: fs.readFileSync(path.join(docsPath, f)) });
    }
  }

  const parentDir = path.dirname(sp);
  const baseName = path.basename(sp);
  const tempName = `${baseName}_clone_${Date.now()}`;

  const cloneResult = await run(`git clone "${repoUrl}" "${tempName}"`, parentDir, 180000);

  if (!cloneResult.ok) {
    const output = [cloneResult.stdout, cloneResult.stderr].filter(Boolean).join('\n');
    return res.json({ ok: false, output });
  }

  const tempPath = path.join(parentDir, tempName);

  if (savedDocs.length > 0) {
    fs.mkdirSync(path.join(tempPath, '_docs'), { recursive: true });
    for (const doc of savedDocs) {
      fs.writeFileSync(path.join(tempPath, '_docs', doc.name), doc.buf);
    }
  }

  fs.rmSync(sp, { recursive: true, force: true });
  fs.renameSync(tempPath, sp);

  if (!project.github) {
    writeProject({ ...project, github: repoUrl, updatedAt: new Date().toISOString() });
  }

  const output = [cloneResult.stdout, cloneResult.stderr].filter(Boolean).join('\n');
  res.json({ ok: true, output: output || `Repo kloniran u ${sp}` });
});

// ── Coolify ───────────────────────────────────────────────────────────────────

app.post('/api/projects/:id/coolify-setup', async (req, res) => {
  const project = readProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Not found' });

  if (!project.github) {
    return res.status(400).json({ error: 'Projekat nema GitHub URL.' });
  }
  if (!COOLIFY_API_URL || !COOLIFY_TOKEN || !COOLIFY_SERVER_UUID) {
    return res.status(500).json({ error: 'Coolify nije konfigurisan.' });
  }

  try {
    const slug = slugify(project.name);
    const coolifyDomain = `https://${slug}.impulsee.dev`;

    let projectUuid = process.env.COOLIFY_PROJECT_UUID || '';
    if (!projectUuid) {
      const projects = await coolifyApi('GET', '/projects');
      const firstProject = Array.isArray(projects) ? projects[0] : null;
      if (firstProject?.uuid) projectUuid = firstProject.uuid;
    }

    const usePrivateKey = !!COOLIFY_PRIVATE_KEY_UUID;
    const endpoint = usePrivateKey ? '/applications/private-deploy-key' : '/applications/public';
    const result = await coolifyApi('POST', endpoint, {
      project_uuid: projectUuid || undefined,
      server_uuid: COOLIFY_SERVER_UUID,
      environment_name: 'production',
      git_repository: usePrivateKey ? toGitSshUrl(project.github) : project.github,
      git_branch: req.body.branch || 'main',
      build_pack: req.body.build_pack || 'nixpacks',
      name: project.name,
      domains: coolifyDomain,
      ports_exposes: req.body.port || '3000',
      instant_deploy: false,
      ...(usePrivateKey ? { private_key_uuid: COOLIFY_PRIVATE_KEY_UUID } : {}),
    });

    const resultItem = Array.isArray(result) ? result[0] : result;
    const appId = resultItem?.uuid || resultItem?.id || resultItem?.data?.uuid;
    if (!appId) {
      return res.status(500).json({ ok: false, error: 'Coolify nije vratio UUID.', details: resultItem });
    }

    const updated = {
      ...project,
      coolifyAppId: appId,
      coolifyDomain,
      liveUrl: coolifyDomain,
      updatedAt: new Date().toISOString(),
    };
    writeProject(updated);
    syncToWeb(updated); // async, don't await
    res.json({ ok: true, coolifyDomain, coolifyAppId: appId, project: updated });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/projects/:id/coolify-disconnect', async (req, res) => {
  const project = readProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Not found' });

  const { coolifyAppId, coolifyDomain, ...rest } = project;
  const updated = { ...rest, updatedAt: new Date().toISOString() };
  // Keep liveUrl only if it wasn't the coolify domain
  if (updated.liveUrl === coolifyDomain) delete updated.liveUrl;
  writeProject(updated);
  syncToWeb(updated);
  res.json({ ok: true, project: updated });
});

app.post('/api/projects/:id/coolify-deploy', async (req, res) => {
  const project = readProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Not found' });
  if (!project.coolifyAppId) {
    return res.status(400).json({ error: 'Coolify nije podešen.' });
  }

  try {
    const result = await coolifyApi('POST', `/applications/${project.coolifyAppId}/start`);

    // Record deploy in history
    const history = project.deployHistory || [];
    history.unshift({
      id: crypto.randomUUID(),
      action: 'deploy',
      status: 'started',
      message: req.body.message || 'Manual deploy',
      timestamp: new Date().toISOString(),
    });
    // Keep last 50 entries
    if (history.length > 50) history.length = 50;
    const updated = { ...project, deployHistory: history, updatedAt: new Date().toISOString() };
    writeProject(updated);
    syncToWeb(updated);

    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/projects/:id/coolify-status', async (req, res) => {
  const project = readProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Not found' });
  if (!project.coolifyAppId) return res.json({ configured: false });

  try {
    const result = await coolifyApi('GET', `/applications/${project.coolifyAppId}`);

    // Parse status - Coolify returns "running:unknown", "exited:unhealthy", etc.
    const rawStatus = result.status || '';
    const [mainStatus, healthStatus] = rawStatus.split(':');

    // Update last deploy entry status if it was 'started'
    const history = project.deployHistory || [];
    if (history.length > 0 && history[0].status === 'started') {
      if (mainStatus === 'running') {
        history[0].status = 'success';
        history[0].completedAt = new Date().toISOString();
      } else if (mainStatus === 'exited' || mainStatus === 'stopped') {
        history[0].status = 'failed';
        history[0].completedAt = new Date().toISOString();
      }
      writeProject({ ...project, deployHistory: history });
    }

    res.json({
      configured: true,
      status: mainStatus,
      health: healthStatus || null,
      rawStatus,
      domain: project.coolifyDomain,
      name: result.name,
      gitCommitSha: result.git_commit_sha || null,
      lastOnlineAt: result.last_online_at || null,
      createdAt: result.created_at || null,
      updatedAt: result.updated_at || null,
      buildPack: result.build_pack || null,
      deployHistory: history.slice(0, 20),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/projects/:id/coolify-logs', async (req, res) => {
  const project = readProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Not found' });
  if (!project.coolifyAppId) {
    return res.status(400).json({ error: 'Coolify nije podešen.' });
  }

  try {
    const result = await coolifyApi('GET', `/applications/${project.coolifyAppId}/logs`);
    res.json({ ok: true, logs: result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Licenses CRUD ─────────────────────────────────────────────────────────────

app.post('/api/projects/:id/licenses', (req, res) => {
  const project = readProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Not found' });

  const { clientName, clientEmail, plan } = req.body;
  if (!clientName || !plan) return res.status(400).json({ error: 'clientName i plan su obavezni.' });

  const now = new Date();
  const expiresAt = new Date(now);
  if (plan === 'yearly') {
    expiresAt.setDate(expiresAt.getDate() + 365);
  } else {
    expiresAt.setDate(expiresAt.getDate() + 30);
  }

  const license = {
    id: crypto.randomUUID(),
    key: generateLicenseKey(),
    clientName,
    clientEmail: clientEmail || '',
    plan: plan === 'yearly' ? 'yearly' : 'monthly',
    status: 'active',
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    lastVerifiedAt: null,
    verifyCount: 0,
    notes: '',
  };

  const licenses = project.licenses || [];
  licenses.push(license);
  const updated = { ...project, licenses, updatedAt: now.toISOString() };
  writeProject(updated);
  syncToWeb(updated);
  res.json(license);
});

app.put('/api/projects/:id/licenses/:licId', (req, res) => {
  const project = readProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Not found' });

  const licenses = project.licenses || [];
  const idx = licenses.findIndex(l => l.id === req.params.licId);
  if (idx === -1) return res.status(404).json({ error: 'License not found' });

  const allowedFields = ['status', 'notes', 'clientName', 'clientEmail'];
  for (const key of allowedFields) {
    if (req.body[key] !== undefined) licenses[idx][key] = req.body[key];
  }

  const updated = { ...project, licenses, updatedAt: new Date().toISOString() };
  writeProject(updated);
  syncToWeb(updated);
  res.json(licenses[idx]);
});

app.delete('/api/projects/:id/licenses/:licId', (req, res) => {
  const project = readProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Not found' });

  const licenses = (project.licenses || []).filter(l => l.id !== req.params.licId);
  const updated = { ...project, licenses, updatedAt: new Date().toISOString() };
  writeProject(updated);
  syncToWeb(updated);
  res.json({ ok: true });
});

app.post('/api/projects/:id/licenses/:licId/renew', (req, res) => {
  const project = readProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Not found' });

  const licenses = project.licenses || [];
  const idx = licenses.findIndex(l => l.id === req.params.licId);
  if (idx === -1) return res.status(404).json({ error: 'License not found' });

  const now = new Date();
  const days = licenses[idx].plan === 'yearly' ? 365 : 30;
  const newExpiry = new Date(now);
  newExpiry.setDate(newExpiry.getDate() + days);

  licenses[idx].expiresAt = newExpiry.toISOString();
  licenses[idx].status = 'active';

  const updated = { ...project, licenses, updatedAt: now.toISOString() };
  writeProject(updated);
  syncToWeb(updated);
  res.json(licenses[idx]);
});

// ── Sync Repo (git sync for multi-machine workflow) ──────────────────────────

const REPO_ROOT = path.resolve(__dirname, '../..');

app.post('/api/sync-repo', async (req, res) => {
  const steps = [];
  const now = new Date();
  const timestamp = now.toLocaleDateString('sr-Latn-RS') + ' ' + now.toLocaleTimeString('sr-Latn-RS', { hour: '2-digit', minute: '2-digit' });

  try {
    // Step 1: git add -A
    const addResult = await run('git add -A', REPO_ROOT);
    steps.push({ step: 'add', ...addResult });

    // Step 2: git commit
    const commitResult = await run(`git commit -m "Sync: ${timestamp}"`, REPO_ROOT);
    const nothingToCommit = commitResult.stdout.includes('nothing to commit') || commitResult.stderr.includes('nothing to commit');
    steps.push({ step: 'commit', ...commitResult, skipped: nothingToCommit });

    // Step 3: git pull --rebase
    const pullResult = await run('git pull --rebase origin master', REPO_ROOT, 30000);
    steps.push({ step: 'pull', ...pullResult });

    // Step 4: git push
    const pushResult = await run('git push origin master', REPO_ROOT, 30000);
    steps.push({ step: 'push', ...pushResult });

    const allOk = steps.every(s => s.ok || s.skipped);
    const summary = nothingToCommit && pushResult.ok
      ? 'Nema lokalnih promena. Repo je ažuran.'
      : allOk
        ? `Synced: ${timestamp}`
        : 'Sync završen sa greškama.';

    res.json({ ok: allOk, summary, steps });
  } catch (err) {
    res.status(500).json({ ok: false, summary: err.message, steps });
  }
});

// ── Setup Local (clone project on new machine) ───────────────────────────────

app.post('/api/projects/:id/setup-local', async (req, res) => {
  const project = readProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Not found' });

  const repoUrl = project.github;
  if (!repoUrl) {
    return res.status(400).json({ error: 'Projekat nema GitHub URL — nije moguće klonirati.' });
  }

  if (project.serverPath && fs.existsSync(project.serverPath)) {
    return res.json({ ok: true, message: 'Folder već postoji.', project });
  }

  try {
    fs.mkdirSync(PROJECTS_DIR, { recursive: true });
  } catch {}

  const serverPath = uniqueServerPath(project.name || 'projekat');

  try {
    const cloneResult = await run(`git clone "${repoUrl}" "${serverPath}"`, PROJECTS_DIR, 180000);
    if (!cloneResult.ok) {
      return res.status(500).json({ ok: false, error: `Git clone greška: ${cloneResult.stderr || cloneResult.error}` });
    }

    const updated = { ...project, serverPath, updatedAt: new Date().toISOString() };
    writeProject(updated);
    syncToWeb(updated);

    res.json({ ok: true, serverPath, project: updated });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Import Existing Project ──────────────────────────────────────────────────

app.post('/api/projects/import', async (req, res) => {
  const { folderPath } = req.body;
  if (!folderPath) {
    return res.status(400).json({ error: 'folderPath je obavezan.' });
  }

  const resolvedPath = path.resolve(folderPath);
  if (!fs.existsSync(resolvedPath)) {
    return res.status(400).json({ error: `Folder ne postoji: ${resolvedPath}` });
  }

  // Read git remote for github URL
  let github = '';
  try {
    const gitResult = await run('git remote get-url origin', resolvedPath, 5000);
    if (gitResult.ok) {
      github = gitResult.stdout.trim().replace(/\.git$/, '');
    }
  } catch {}

  const name = path.basename(resolvedPath);
  const now = new Date().toISOString();

  const project = {
    id: crypto.randomUUID(),
    name,
    client: '',
    description: '',
    status: 'in-progress',
    tech: [],
    serverPath: resolvedPath,
    github,
    coolifyAppId: '',
    coolifyDomain: '',
    liveUrl: '',
    notes: '',
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: null,
    clientToken: crypto.randomBytes(16).toString('hex'),
  };

  writeProject(project);
  syncToWeb(project);

  res.json({ ok: true, project });
});

// ── Git Pull (update code) ───────────────────────────────────────────────────

app.post('/api/projects/:id/git-pull', async (req, res) => {
  const project = readProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Not found' });

  const dir = project.serverPath;
  if (!dir || !fs.existsSync(dir)) {
    return res.status(400).json({ error: 'Server folder ne postoji.' });
  }
  if (!fs.existsSync(path.join(dir, '.git'))) {
    return res.status(400).json({ error: 'Folder nije git repozitorijum.' });
  }

  const result = await run('git pull', dir, 60000);
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n');
  res.json({ ok: result.ok, output: output || 'Već ažurirano.' });
});

// ── Kill Port ────────────────────────────────────────────────────────────────

app.post('/api/kill-port/:port', (req, res) => {
  const port = parseInt(req.params.port, 10);
  if (!port || port < 1024 || port > 65535) {
    return res.status(400).json({ error: 'Invalid port' });
  }
  // Don't allow killing our own backend/frontend ports
  if ([4902, 4903, 4904, 4905].includes(port)) {
    return res.status(400).json({ error: 'Ne može se ubiti sistemski port.' });
  }

  const isWin = process.platform === 'win32';
  const cmd = isWin
    ? `for /f "tokens=5" %a in ('netstat -ano ^| findstr :${port} ^| findstr LISTENING') do taskkill /PID %a /F`
    : `lsof -ti:${port} | xargs -r kill -9`;

  exec(cmd, { shell: isWin ? 'cmd.exe' : true, windowsHide: true }, (err, stdout, stderr) => {
    if (err) {
      return res.json({ ok: false, message: `Nema procesa na portu ${port}` });
    }
    res.json({ ok: true, message: `Port ${port} oslobođen.` });
  });
});

// ── Open Actions ──────────────────────────────────────────────────────────────

app.post('/api/projects/:id/open-folder', (req, res) => {
  const project = readProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Not found' });

  const dir = project.serverPath;
  if (dir && fs.existsSync(dir)) {
    exec(`explorer "${dir.replace(/\//g, '\\')}"`, { shell: true });
  }
  res.json({ ok: true });
});

// ── Start ─────────────────────────────────────────────────────────────────────

const server = http.createServer(app);
setupTerminalServer(server);

const PORT = process.env.PORT || 4902;
server.listen(PORT, () => {
  console.log(`IMPULSE Local backend: http://localhost:${PORT}`);
  console.log('Projects dir:', PROJECTS_DIR);
  console.log('Terminal: ws://localhost:' + PORT + '/terminal/:id');

  // Auto-sync: push local projects to web, then pull from web
  pushAllToWeb()
    .then(() => pullFromWeb())
    .then(result => {
      if (result.ok && result.pulled > 0) {
        console.log(`[sync] Pulled ${result.pulled} projects from web (skipped ${result.skipped})`);
      }
    }).catch(() => {});
});
