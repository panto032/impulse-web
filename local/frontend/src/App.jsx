import React, { useState, useEffect, useRef } from 'react';
import {
  Terminal, Rocket, CloudUpload, FolderGit2, LayoutGrid,
  Search, Clock, CheckCircle2, AlertCircle, X,
  Github, Activity, Plus, Globe, Upload, Download, Trash2,
  FolderOpen, FileText, RefreshCw, GitBranch, Copy,
  Sparkles, Settings, Shield, Key, RotateCcw, Ban, Play,
  FolderInput, HelpCircle, GitPullRequest,
} from 'lucide-react';
import DevMode from './DevMode.jsx';

const API = '/api';

function formatRelativeTime(dateString) {
  if (!dateString) return 'nikad';
  const diff = Date.now() - new Date(dateString).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  const months = Math.floor(diff / 2592000000);
  if (minutes < 1) return 'upravo sada';
  if (minutes < 60) return `pre ${minutes} min`;
  if (hours < 24) return `pre ${hours}h`;
  if (days === 1) return 'juče';
  if (days < 30) return `pre ${days} dana`;
  if (months < 12) return `pre ${months} mes.`;
  return `pre ${Math.floor(months / 12)} god.`;
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Main App ──────────────────────────────────────────────────────────────────

export default function App() {
  const [devModeProject, setDevModeProject] = useState(null);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState(null);
  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);
  const [editProject, setEditProject] = useState(null);
  const [toast, setToast] = useState(null);
  const [actionOutput, setActionOutput] = useState(null);
  const [notesText, setNotesText] = useState('');
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const [coolifyConfigured, setCoolifyConfigured] = useState(false);
  const [githubOrg, setGithubOrg] = useState('');

  // Command Center tabs
  const [panelTab, setPanelTab] = useState('pregled');

  // File management
  const [projectFiles, setProjectFiles] = useState(null);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);

  // Git clone
  const [cloneUrl, setCloneUrl] = useState('');
  const [isCloning, setIsCloning] = useState(false);

  // Git commit message
  const [commitMsg, setCommitMsg] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);

  // Coolify
  const [coolifyStatus, setCoolifyStatus] = useState(null);
  const [isFetchingCoolifyStatus, setIsFetchingCoolifyStatus] = useState(false);
  const [isCoolifyDeploying, setIsCoolifyDeploying] = useState(false);
  const [isCoolifySetup, setIsCoolifySetup] = useState(false);
  const [coolifyLogs, setCoolifyLogs] = useState(null);
  const [showCoolifyLogs, setShowCoolifyLogs] = useState(false);

  // Sync repo
  const [isSyncing, setIsSyncing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);

  // Import project
  const [showImportModal, setShowImportModal] = useState(false);
  const [importPath, setImportPath] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  // Setup local (clone on new machine)
  const [isSettingUp, setIsSettingUp] = useState(false);

  // Git pull
  const [isGitPulling, setIsGitPulling] = useState(false);

  // Help
  const [showHelp, setShowHelp] = useState(false);

  const fileInputRef = useRef(null);
  const coolifyPollRef = useRef(null);

  // Fetch config on startup
  useEffect(() => {
    fetch(`${API}/info`)
      .then(r => r.json())
      .then(d => {
        setCoolifyConfigured(!!d.coolifyConfigured);
        setGithubOrg(d.githubOrg || '');
      })
      .catch(() => {});
  }, []);

  // Sync notes + reset state when selected project changes
  useEffect(() => {
    setNotesText(selectedProject?.notes || '');
    setNotesSaved(false);
    setActionOutput(null);
    setPanelTab('pregled');
    setProjectFiles(null);
    setCloneUrl(selectedProject?.github || '');
    setCommitMsg('');
    setCoolifyStatus(null);
    setCoolifyLogs(null);
    setShowCoolifyLogs(false);
  }, [selectedProject?.id]);

  // Load files when switching to files tab
  useEffect(() => {
    if (panelTab === 'fajlovi' && selectedProject && !projectFiles) {
      fetchFiles(selectedProject.id);
    }
  }, [panelTab, selectedProject?.id]);

  // Poll Coolify status
  useEffect(() => {
    if (coolifyPollRef.current) clearInterval(coolifyPollRef.current);
    if (!selectedProject?.coolifyAppId || panelTab !== 'pregled') return;

    let active = true;
    const poll = () => {
      callApi('GET', `/projects/${selectedProject.id}/coolify-status`)
        .then(data => { if (active) setCoolifyStatus(data); })
        .catch(() => {});
    };
    poll();
    coolifyPollRef.current = setInterval(() => {
      setCoolifyStatus(prev => {
        const transitioning = prev?.status === 'starting' || prev?.status === 'building' || prev?.status === 'deploying';
        if (transitioning) poll();
        return prev;
      });
    }, 5000);
    return () => { active = false; clearInterval(coolifyPollRef.current); };
  }, [selectedProject?.id, panelTab]);

  const fetchProjects = async () => {
    try {
      const res = await fetch(`${API}/projects`);
      setProjects(await res.json());
    } catch {
      showToast('Backend nije dostupan na portu 3002.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchProjects(); }, []);

  const callApi = async (method, path, body) => {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    return res.json();
  };

  const showToast = (message, type, duration = 4000) => {
    setToast({ message, type });
    if (duration > 0) setTimeout(() => setToast(null), duration);
  };

  // ── Filtering ──────────────────────────────────────────────────────────────

  const filteredProjects = projects.filter(p => {
    const matchTab =
      activeTab === 'all' ||
      (activeTab === 'clients' && p.type !== 'saas') ||
      (activeTab === 'saas' && p.type === 'saas');
    const q = search.toLowerCase();
    const matchSearch = !q || [p.name, p.client, ...(p.tech || [])].some(f => f?.toLowerCase().includes(q));
    return matchTab && matchSearch;
  });

  const counts = {
    all: projects.length,
    clients: projects.filter(p => p.type !== 'saas').length,
    saas: projects.filter(p => p.type === 'saas').length,
  };

  // ── Sync Repo ────────────────────────────────────────────────────────────────

  const handleSyncRepo = async () => {
    setIsSyncing(true);
    showToast('Sync u toku...', 'loading', 0);
    try {
      const res = await fetch(`${API}/sync-repo`, { method: 'POST' });
      const data = await res.json();
      showToast(data.summary || (data.ok ? 'Synced!' : 'Greška'), data.ok ? 'success' : 'error');
    } catch (err) {
      showToast('Sync greška: ' + err.message, 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePullFromWeb = async () => {
    setIsPulling(true);
    showToast('Povlačim projekte sa weba...', 'loading', 0);
    try {
      const res = await fetch(`${API}/pull-from-web`, { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        showToast(`Povučeno ${data.pulled} projekata (preskočeno ${data.skipped})`, 'success');
        if (data.pulled > 0) fetchProjects();
      } else {
        showToast(data.error || 'Greška pri povlačenju.', 'error');
      }
    } catch (err) {
      showToast('Web app nije dostupna: ' + err.message, 'error');
    } finally {
      setIsPulling(false);
    }
  };

  // ── Import Existing Project ──────────────────────────────────────────────────

  const handleImport = async () => {
    if (!importPath.trim()) { showToast('Unesi putanju do foldera.', 'error'); return; }
    setIsImporting(true);
    showToast('Importujem projekat...', 'loading', 0);
    try {
      const data = await callApi('POST', '/projects/import', { folderPath: importPath.trim() });
      if (data.ok) {
        showToast(`Projekat "${data.project.name}" importovan!`, 'success');
        setProjects(prev => [data.project, ...prev]);
        setShowImportModal(false);
        setImportPath('');
      } else {
        showToast(data.error || 'Greška pri importu.', 'error');
      }
    } catch (err) {
      showToast('Server nije dostupan: ' + err.message, 'error');
    }
    setIsImporting(false);
  };

  // ── Setup Local (clone on new machine) ────────────────────────────────────

  const handleSetupLocal = async () => {
    if (!selectedProject) return;
    setIsSettingUp(true);
    showToast('Kloniram projekat sa GitHub-a...', 'loading', 0);
    try {
      const data = await callApi('POST', `/projects/${selectedProject.id}/setup-local`);
      if (data.ok) {
        setSelectedProject(data.project);
        setProjects(prev => prev.map(p => p.id === data.project.id ? data.project : p));
        showToast(`Projekat preuzet u ${data.serverPath || data.project.serverPath}`, 'success');
      } else {
        showToast(data.error || 'Greška pri kloniranju.', 'error');
      }
    } catch (err) {
      showToast('Server nije dostupan: ' + err.message, 'error');
    }
    setIsSettingUp(false);
  };

  // ── Git Pull (update code) ────────────────────────────────────────────────

  const handleGitPull = async () => {
    if (!selectedProject) return;
    setIsGitPulling(true);
    setActionOutput(null);
    showToast('Git pull u toku...', 'loading', 0);
    try {
      const data = await callApi('POST', `/projects/${selectedProject.id}/git-pull`);
      setActionOutput(data);
      showToast(data.ok ? 'Kod ažuriran!' : 'Git pull greška.', data.ok ? 'success' : 'error');
    } catch (err) {
      showToast('Server nije dostupan: ' + err.message, 'error');
    }
    setIsGitPulling(false);
  };

  // ── CRUD ───────────────────────────────────────────────────────────────────

  const handleCreate = async (formData) => {
    showToast('Kreiram projekat...', 'loading', 0);
    try {
      const project = await callApi('POST', '/projects', formData);
      setProjects(prev => [project, ...prev]);
      setShowNewModal(false);
      if (project._coolifyWarning) {
        showToast(project._coolifyWarning, 'error', 6000);
      } else if (project.coolifyDomain) {
        showToast(`Projekat kreiran! Coolify: ${project.coolifyDomain}`, 'success');
      } else {
        showToast('Projekat kreiran!', 'success');
      }
    } catch {
      showToast('Greška pri kreiranju projekta.', 'error');
    }
  };

  const handleUpdate = async (id, formData) => {
    const updated = await callApi('PUT', `/projects/${id}`, formData);
    setProjects(prev => prev.map(p => p.id === id ? updated : p));
    if (selectedProject?.id === id) setSelectedProject(updated);
    setEditProject(null);
    showToast('Projekat sačuvan!', 'success');
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Obrisati projekat?')) return;
    await callApi('DELETE', `/projects/${id}`);
    setProjects(prev => prev.filter(p => p.id !== id));
    if (selectedProject?.id === id) setSelectedProject(null);
    setEditProject(null);
    showToast('Projekat obrisan.', 'success');
  };

  const handleSaveNotes = async (projectId, notes) => {
    setIsSavingNotes(true);
    try {
      const updated = await callApi('PUT', `/projects/${projectId}`, { notes });
      setProjects(prev => prev.map(p => p.id === projectId ? updated : p));
      if (selectedProject?.id === projectId) setSelectedProject(prev => ({ ...prev, notes }));
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 2000);
    } catch {
      showToast('Greška pri čuvanju beleški.', 'error');
    }
    setIsSavingNotes(false);
  };

  // ── File Management ────────────────────────────────────────────────────────

  const fetchFiles = async (projectId) => {
    setLoadingFiles(true);
    try {
      const data = await callApi('GET', `/projects/${projectId}/files`);
      setProjectFiles(data);
    } catch {
      showToast('Greška pri učitavanju fajlova.', 'error');
    }
    setLoadingFiles(false);
  };

  const handleCreateFolder = async () => {
    setIsCreatingFolder(true);
    try {
      const data = await callApi('POST', `/projects/${selectedProject.id}/create-folder`);
      if (data.ok) {
        setSelectedProject(data.project);
        setProjects(prev => prev.map(p => p.id === selectedProject.id ? data.project : p));
        showToast(`Folder kreiran: ${data.serverPath}`, 'success');
      } else {
        showToast(data.error || 'Greška.', 'error');
      }
    } catch {
      showToast('Server nije dostupan.', 'error');
    }
    setIsCreatingFolder(false);
  };

  const handleUpload = async (files) => {
    if (!files || files.length === 0) return;
    setIsUploading(true);
    showToast('Upload u toku...', 'loading', 0);
    try {
      const formData = new FormData();
      Array.from(files).forEach(f => formData.append('files', f));
      const res = await fetch(`${API}/projects/${selectedProject.id}/upload`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.ok) {
        showToast(`Uploadovano: ${data.uploaded.join(', ')}`, 'success');
        fetchFiles(selectedProject.id);
      } else {
        showToast(data.error || 'Greška pri uploadu.', 'error');
      }
    } catch {
      showToast('Greška pri uploadu.', 'error');
    }
    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDeleteFile = async (filePath) => {
    if (!window.confirm(`Obrisati fajl "${filePath}"?`)) return;
    try {
      const res = await fetch(`${API}/projects/${selectedProject.id}/files?path=${encodeURIComponent(filePath)}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.ok) {
        showToast('Fajl obrisan.', 'success');
        fetchFiles(selectedProject.id);
      } else {
        showToast(data.error || 'Greška.', 'error');
      }
    } catch {
      showToast('Greška pri brisanju.', 'error');
    }
  };

  const getDownloadUrl = (filePath) =>
    `${API}/projects/${selectedProject.id}/files/download?path=${encodeURIComponent(filePath)}`;

  // ── Git Clone ──────────────────────────────────────────────────────────────

  const handleClone = async () => {
    const url = cloneUrl.trim() || selectedProject.github;
    if (!url) { showToast('Unesi URL repozitorijuma.', 'error'); return; }
    setIsCloning(true);
    setActionOutput(null);
    showToast('Kloniram repo...', 'loading', 0);
    try {
      const data = await callApi('POST', `/projects/${selectedProject.id}/clone`, { url });
      setActionOutput(data);
      if (data.ok) {
        showToast('Repo kloniran!', 'success');
        fetchFiles(selectedProject.id);
        if (!selectedProject.github && url) {
          const updated = await callApi('PUT', `/projects/${selectedProject.id}`, { github: url });
          setSelectedProject(updated);
          setProjects(prev => prev.map(p => p.id === selectedProject.id ? updated : p));
        }
      } else {
        showToast('Greška pri kloniranju.', 'error');
      }
    } catch {
      showToast('Server nije dostupan.', 'error');
    }
    setIsCloning(false);
  };

  // ── Publish (git push) ─────────────────────────────────────────────────────

  const handlePublish = async () => {
    setIsPublishing(true);
    setActionOutput(null);
    showToast('Git commit & push...', 'loading', 0);
    try {
      const msg = commitMsg.trim() || undefined;
      const data = await callApi('POST', `/projects/${selectedProject.id}/publish`, msg ? { message: msg } : undefined);
      setActionOutput(data);
      if (data.ok) {
        showToast('Publish uspešan!', 'success');
        if (selectedProject.coolifyAppId) {
          setCoolifyStatus(prev => prev ? { ...prev, status: 'starting' } : null);
        }
      } else {
        showToast('Git greška — pogledaj log ispod.', 'error');
      }
      setCommitMsg('');
      fetchProjects();
    } catch {
      showToast('Server nije dostupan.', 'error');
    }
    setIsPublishing(false);
  };

  // ── Coolify ────────────────────────────────────────────────────────────────

  const handleCoolifySetup = async () => {
    setIsCoolifySetup(true);
    showToast('Kreiranje Coolify aplikacije...', 'loading', 0);
    try {
      const data = await callApi('POST', `/projects/${selectedProject.id}/coolify-setup`);
      if (data.ok) {
        setSelectedProject(data.project);
        setProjects(prev => prev.map(p => p.id === data.project.id ? data.project : p));
        setCoolifyStatus(null);
        showToast(`Coolify setup uspešan! ${data.coolifyDomain}`, 'success');
      } else {
        showToast(data.error || 'Coolify setup nije uspeo.', 'error');
      }
    } catch {
      showToast('Server nije dostupan.', 'error');
    }
    setIsCoolifySetup(false);
  };

  const handleCoolifyDeploy = async () => {
    setIsCoolifyDeploying(true);
    showToast('Pokretanje deploy-a...', 'loading', 0);
    try {
      const data = await callApi('POST', `/projects/${selectedProject.id}/coolify-deploy`);
      if (data.ok) {
        showToast('Deploy pokrenut!', 'success');
        setCoolifyStatus(prev => prev ? { ...prev, status: 'starting' } : null);
      } else {
        showToast(data.error || 'Deploy nije uspeo.', 'error');
      }
    } catch {
      showToast('Server nije dostupan.', 'error');
    }
    setIsCoolifyDeploying(false);
  };

  const handleFetchCoolifyLogs = async () => {
    showToast('Učitavam logove...', 'loading', 0);
    try {
      const data = await callApi('GET', `/projects/${selectedProject.id}/coolify-logs`);
      if (data.ok) {
        const logsText = typeof data.logs === 'string' ? data.logs : JSON.stringify(data.logs, null, 2);
        setCoolifyLogs(logsText);
        setShowCoolifyLogs(true);
        showToast('Logovi učitani.', 'success');
      } else {
        showToast(data.error || 'Greška.', 'error');
      }
    } catch {
      showToast('Server nije dostupan.', 'error');
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  // Dev Mode — full screen override
  if (devModeProject) {
    return (
      <DevMode
        project={devModeProject}
        onBack={() => { setDevModeProject(null); fetchProjects(); }}
      />
    );
  }

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100 font-sans overflow-hidden selection:bg-emerald-500/30">

      {/* SIDEBAR */}
      <aside className="w-64 border-r border-zinc-800/60 bg-zinc-950/50 flex flex-col justify-between shrink-0">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-10 group cursor-pointer">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-emerald-500/20 group-hover:shadow-emerald-500/40 transition-all">
              <Terminal className="text-white w-4 h-4" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white">IMPULSE<span className="text-emerald-500">.</span><span className="text-xs text-zinc-500 ml-1">Dev</span></h1>
          </div>

          <nav className="space-y-1.5">
            <SidebarItem icon={<LayoutGrid size={18} />} label="Svi Projekti" count={counts.all} active={activeTab === 'all'} onClick={() => setActiveTab('all')} />
            <SidebarItem icon={<FolderGit2 size={18} />} label="Klijenti" count={counts.clients} active={activeTab === 'clients'} onClick={() => setActiveTab('clients')} />
            <SidebarItem icon={<Rocket size={18} />} label="Interni SaaS" count={counts.saas} active={activeTab === 'saas'} onClick={() => setActiveTab('saas')} />
          </nav>
        </div>
        <div className="p-6 pt-0">
          <button
            onClick={() => setShowHelp(true)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300 transition-all"
          >
            <HelpCircle size={18} className="text-zinc-600" />
            Uputstvo
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 flex flex-col relative overflow-hidden bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(16,185,129,0.05),rgba(255,255,255,0))]">

        {/* TOP BAR */}
        <header className="h-20 border-b border-zinc-800/60 bg-zinc-950/80 backdrop-blur-md flex items-center justify-between px-8 z-10 shrink-0">
          <div className="relative w-[400px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Pretraži projekte..."
              className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all text-zinc-300 placeholder-zinc-600"
            />
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 text-sm text-zinc-400 bg-zinc-900/50 px-3 py-1.5 rounded-full border border-zinc-800/60">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Lokalni server
            </div>
            <button
              onClick={handlePullFromWeb}
              disabled={isPulling}
              title="Povuci projekte sa web app-a (sync metapodataka)"
              className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white px-3 py-2.5 rounded-xl text-sm font-medium border border-zinc-700/60 transition-all disabled:opacity-50"
            >
              <Download size={16} className={isPulling ? 'animate-bounce' : ''} />
              Pull
            </button>
            <button
              onClick={handleSyncRepo}
              disabled={isSyncing}
              title="Sync IMPULSE repo na GitHub (git add + commit + push + pull)"
              className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white px-3 py-2.5 rounded-xl text-sm font-medium border border-zinc-700/60 transition-all disabled:opacity-50"
            >
              <GitBranch size={16} className={isSyncing ? 'animate-spin' : ''} />
              Sync
            </button>
            <button
              onClick={() => setShowImportModal(true)}
              title="Dodaj postojeći folder/projekat u dashboard"
              className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white px-3 py-2.5 rounded-xl text-sm font-medium border border-zinc-700/60 transition-all"
            >
              <FolderInput size={16} />
              Importuj
            </button>
            <button
              onClick={() => setShowNewModal(true)}
              title="Kreiraj novi projekat sa GitHub repo-om i Coolify deploy-om"
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/20 transition-all"
            >
              <Plus size={16} /> Novi Projekat
            </button>
          </div>
        </header>

        {/* PROJECT GRID */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-2">Tvoj Workspace</h2>
            <p className="text-zinc-400">Pronađi projekat i nastavi tačno tamo gde si stao.</p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="w-8 h-8 border-2 border-zinc-700 border-t-emerald-500 rounded-full animate-spin" />
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-zinc-600">
              <FolderGit2 size={48} className="mb-4 opacity-30" />
              <p className="text-lg font-medium mb-2">{search ? 'Nema rezultata' : 'Nema projekata'}</p>
              <p className="text-sm">{search ? 'Pokušaj drugačiji termin' : 'Klikni "Novi Projekat" da počneš'}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
              {filteredProjects.map(project => (
                <div
                  key={project.id}
                  onClick={() => setSelectedProject(project)}
                  className="group relative bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-6 hover:bg-zinc-800/40 hover:border-zinc-700 transition-all duration-300 cursor-pointer shadow-sm hover:shadow-xl hover:shadow-emerald-500/5 overflow-hidden"
                >
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                  <div className="flex justify-between items-start mb-5 relative z-10">
                    <div className="min-w-0 flex-1 pr-3">
                      <h3 className="text-lg font-bold text-zinc-100 group-hover:text-white transition-colors truncate">{project.name || '(bez naziva)'}</h3>
                      <p className="text-sm text-zinc-500 mt-1 flex items-center gap-1.5">
                        <FolderGit2 size={14} className="shrink-0" /> {project.client || '—'}
                      </p>
                    </div>
                    <StatusBadge status={project.status} />
                  </div>

                  {project.tech?.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-6 relative z-10">
                      {project.tech.map(t => (
                        <span key={t} className="px-2.5 py-1 text-[11px] font-medium bg-zinc-800/50 text-zinc-400 rounded-md border border-zinc-700/50">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between text-xs text-zinc-500 border-t border-zinc-800/60 pt-4 relative z-10">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        {formatRelativeTime(project.updatedAt)}
                      </span>
                      {project.coolifyAppId && (
                        <span className="flex items-center gap-1 text-emerald-600" title={project.coolifyDomain}>
                          <Globe size={12} /> coolify
                        </span>
                      )}
                    </div>
                    <span className="text-zinc-400 group-hover:text-emerald-400 font-medium transition-colors">
                      Command Center &rarr;
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* COMMAND CENTER SLIDE-OVER PANEL */}
        {selectedProject && (
          <div className="absolute inset-0 z-50 flex justify-end overflow-hidden">
            <div
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setSelectedProject(null)}
            />

            <div className="w-full max-w-2xl h-full bg-zinc-950 border-l border-zinc-800 relative flex flex-col shadow-2xl animate-in slide-in-from-right duration-300">

              {/* Panel Header */}
              <div className="px-8 py-5 border-b border-zinc-800/80 bg-zinc-950 flex justify-between items-start sticky top-0 z-10">
                <div className="min-w-0 flex-1 pr-4">
                  <div className="flex items-center gap-3 mb-1.5 flex-wrap">
                    <h2 className="text-xl font-bold text-white truncate">{selectedProject.name}</h2>
                    <StatusBadge status={selectedProject.status} />
                  </div>
                  <p className="text-sm text-zinc-500 truncate">{selectedProject.client || 'Nema klijenta'}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setEditProject(selectedProject)}
                    className="p-2 hover:bg-zinc-900 rounded-lg text-zinc-400 hover:text-white transition-colors"
                    title="Uredi projekat"
                  >
                    <Settings className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => setSelectedProject(null)}
                    className="p-2 hover:bg-zinc-900 rounded-lg text-zinc-400 hover:text-white transition-colors"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>

              {/* Folder Status Bar */}
              <div className={`px-8 py-3 border-b border-zinc-800/60 flex items-center gap-3 ${selectedProject.serverPath ? 'bg-cyan-500/5' : 'bg-amber-500/5'}`}>
                {selectedProject.serverPath ? (
                  <>
                    <FolderOpen size={14} className="text-cyan-500 shrink-0" />
                    <span className="font-mono text-xs text-cyan-400 truncate flex-1">{selectedProject.serverPath}</span>
                    <span className="text-[10px] text-cyan-600 font-semibold uppercase tracking-wider shrink-0">Folder OK</span>
                  </>
                ) : (
                  <>
                    <AlertCircle size={14} className="text-amber-500 shrink-0" />
                    <span className="text-xs text-amber-400 flex-1">Server folder nije kreiran</span>
                    <button
                      onClick={handleCreateFolder}
                      disabled={isCreatingFolder}
                      className="text-xs font-bold text-white bg-amber-600 hover:bg-amber-500 px-3 py-1 rounded-lg transition-colors disabled:opacity-50 shrink-0"
                    >
                      {isCreatingFolder ? 'Kreiram...' : 'Kreiraj folder'}
                    </button>
                  </>
                )}
              </div>

              {/* Panel Tabs */}
              <div className="flex border-b border-zinc-800/60 px-8 bg-zinc-950">
                {[
                  { id: 'pregled', label: 'Pregled' },
                  { id: 'fajlovi', label: 'Fajlovi' },
                  { id: 'beleski', label: 'Beleške' },
                  { id: 'licence', label: 'Licence' },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setPanelTab(tab.id)}
                    className={`px-5 py-3.5 text-sm font-medium border-b-2 transition-colors ${
                      panelTab === tab.id
                        ? 'border-emerald-500 text-emerald-400'
                        : 'border-transparent text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Panel Scrollable Content */}
              <div className="flex-1 overflow-y-auto custom-scrollbar">

                {/* ── TAB: PREGLED ──────────────────────────────────────── */}
                {panelTab === 'pregled' && (
                  <div className="p-8 space-y-6">

                    {/* SETUP LOCAL — show prominently if no serverPath */}
                    {!selectedProject.serverPath && selectedProject.github && (
                      <button
                        onClick={handleSetupLocal}
                        disabled={isSettingUp}
                        title="Kloniraj kod sa GitHub-a na ovaj računar"
                        className="w-full flex items-center justify-center gap-3 p-5 bg-gradient-to-b from-amber-500/10 to-amber-500/5 hover:from-amber-500/20 hover:to-amber-500/10 border border-amber-500/20 hover:border-amber-500/40 rounded-2xl text-amber-400 hover:text-amber-300 transition-all group shadow-lg shadow-amber-500/5 disabled:opacity-50"
                      >
                        {isSettingUp
                          ? <div className="w-6 h-6 border-2 border-amber-600 border-t-amber-300 rounded-full animate-spin" />
                          : <Download className="w-6 h-6 group-hover:scale-110 transition-transform" />
                        }
                        <div className="text-left">
                          <span className="font-bold text-base block">{isSettingUp ? 'Kloniram...' : 'Preuzmi projekat'}</span>
                          <span className="text-[11px] text-amber-500/60 font-medium">Kloniraj kod sa GitHub-a na ovaj računar</span>
                        </div>
                      </button>
                    )}

                    {/* BIG ACTION BUTTONS */}
                    <div className="grid grid-cols-2 gap-4">
                      {/* Dev Mode - PRIMARY */}
                      <button
                        onClick={() => setDevModeProject(selectedProject)}
                        disabled={!selectedProject.serverPath}
                        title="Otvori razvojno okruženje (Claude + Live Preview)"
                        className="flex flex-col items-center justify-center p-6 bg-gradient-to-b from-indigo-500/10 to-indigo-500/5 hover:from-indigo-500/20 hover:to-indigo-500/10 border border-indigo-500/20 hover:border-indigo-500/40 rounded-2xl text-indigo-400 hover:text-indigo-300 transition-all group shadow-lg shadow-indigo-500/5 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <div className="w-12 h-12 rounded-full bg-indigo-500/10 flex items-center justify-center mb-3 group-hover:scale-110 group-hover:bg-indigo-500/20 transition-all">
                          <Sparkles className="w-6 h-6" />
                        </div>
                        <span className="font-bold">Dev Mode</span>
                        <span className="text-[11px] text-indigo-500/60 mt-1 font-medium">Terminal + Live Preview</span>
                      </button>

                      {/* Publish - SECONDARY */}
                      <button
                        onClick={handlePublish}
                        disabled={isPublishing || !selectedProject.serverPath}
                        title="Git add + commit + push koda na GitHub"
                        className="flex flex-col items-center justify-center p-6 bg-gradient-to-b from-zinc-800/50 to-zinc-900 hover:from-zinc-800 hover:to-zinc-800/80 border border-zinc-700 hover:border-zinc-500 rounded-2xl text-zinc-300 hover:text-white transition-all group shadow-lg shadow-black/20 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center mb-3 group-hover:scale-110 group-hover:bg-zinc-700 transition-all border border-zinc-700">
                          {isPublishing
                            ? <div className="w-6 h-6 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
                            : <CloudUpload className="w-6 h-6" />
                          }
                        </div>
                        <span className="font-bold">Publish</span>
                        <span className="text-[11px] text-zinc-500 mt-1 font-medium">Commit + Push + Deploy</span>
                      </button>
                    </div>

                    {/* Git Pull — show when serverPath exists */}
                    {selectedProject.serverPath && (
                      <button
                        onClick={handleGitPull}
                        disabled={isGitPulling}
                        title="Povuci poslednje promene sa GitHub-a (git pull)"
                        className="w-full flex items-center gap-3 px-4 py-3 bg-zinc-900/40 hover:bg-zinc-800/50 border border-zinc-800 hover:border-zinc-700 rounded-xl text-zinc-400 hover:text-zinc-200 transition-all disabled:opacity-50"
                      >
                        {isGitPulling
                          ? <div className="w-4 h-4 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin shrink-0" />
                          : <GitPullRequest size={16} className="shrink-0" />
                        }
                        <span className="text-sm font-medium">{isGitPulling ? 'Ažuriram...' : 'Ažuriraj kod'}</span>
                        <span className="text-[11px] text-zinc-600 ml-auto">git pull</span>
                      </button>
                    )}

                    {/* Commit message input */}
                    <div>
                      <input
                        type="text"
                        value={commitMsg}
                        onChange={e => setCommitMsg(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handlePublish()}
                        placeholder="Commit poruka (opciono)..."
                        className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all font-mono"
                      />
                    </div>

                    {/* ACTION OUTPUT LOG */}
                    {actionOutput && (
                      <div className={`relative rounded-xl border p-4 text-xs font-mono leading-relaxed max-h-36 overflow-y-auto custom-scrollbar ${
                        actionOutput.ok
                          ? 'bg-emerald-950/30 border-emerald-500/20 text-emerald-400'
                          : 'bg-red-950/30 border-red-500/20 text-red-400'
                      }`}>
                        <button onClick={() => setActionOutput(null)} className="absolute top-2 right-2 text-zinc-500 hover:text-zinc-300 transition-colors">
                          <X size={14} />
                        </button>
                        <pre className="whitespace-pre-wrap break-all pr-4">
                          {actionOutput.output || (actionOutput.ok ? 'Uspešno' : 'Greška')}
                        </pre>
                      </div>
                    )}

                    {/* COOLIFY STATUS + DEPLOY */}
                    <div className="bg-zinc-900/30 border border-zinc-800/60 rounded-2xl overflow-hidden">

                      {/* Status Header */}
                      {selectedProject.coolifyAppId ? (
                        <>
                          <div className={`px-5 py-4 flex items-center justify-between border-b border-zinc-800/60 ${
                            coolifyStatus?.status === 'running' ? 'bg-emerald-500/5' :
                            coolifyStatus?.status === 'exited' || coolifyStatus?.status === 'stopped' ? 'bg-red-500/5' :
                            coolifyStatus?.status === 'starting' || coolifyStatus?.status === 'building' ? 'bg-amber-500/5' :
                            'bg-zinc-900/30'
                          }`}>
                            <div className="flex items-center gap-3">
                              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                                coolifyStatus?.status === 'running' ? 'bg-emerald-500/15' :
                                coolifyStatus?.status === 'exited' || coolifyStatus?.status === 'stopped' ? 'bg-red-500/15' :
                                coolifyStatus?.status === 'starting' || coolifyStatus?.status === 'building' ? 'bg-amber-500/15' :
                                'bg-zinc-800'
                              }`}>
                                {coolifyStatus?.status === 'running'
                                  ? <span className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
                                  : coolifyStatus?.status === 'exited' || coolifyStatus?.status === 'stopped'
                                  ? <span className="w-3 h-3 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
                                  : coolifyStatus?.status === 'starting' || coolifyStatus?.status === 'building'
                                  ? <span className="w-3 h-3 rounded-full bg-amber-400 animate-pulse shadow-[0_0_8px_rgba(251,191,36,0.6)]" />
                                  : <span className="w-3 h-3 rounded-full bg-zinc-600" />
                                }
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className={`text-sm font-bold uppercase tracking-wide ${
                                    coolifyStatus?.status === 'running' ? 'text-emerald-400' :
                                    coolifyStatus?.status === 'exited' || coolifyStatus?.status === 'stopped' ? 'text-red-400' :
                                    coolifyStatus?.status === 'starting' || coolifyStatus?.status === 'building' ? 'text-amber-400' :
                                    'text-zinc-400'
                                  }`}>
                                    {!coolifyStatus ? 'Učitavam...' :
                                     coolifyStatus.status === 'running' ? 'Online' :
                                     coolifyStatus.status === 'exited' ? 'Ugašen' :
                                     coolifyStatus.status === 'stopped' ? 'Stopiran' :
                                     coolifyStatus.status === 'starting' ? 'Pokreće se...' :
                                     coolifyStatus.status === 'building' ? 'Build u toku...' :
                                     coolifyStatus.status || 'Nepoznato'}
                                  </span>
                                  {coolifyStatus?.health && coolifyStatus.health !== 'unknown' && (
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                                      coolifyStatus.health === 'healthy' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                                      'bg-red-500/10 text-red-400 border border-red-500/20'
                                    }`}>{coolifyStatus.health}</span>
                                  )}
                                </div>
                                {selectedProject.coolifyDomain && (
                                  <a href={selectedProject.coolifyDomain} target="_blank" rel="noreferrer"
                                    className="text-xs text-zinc-500 hover:text-cyan-400 font-mono transition-colors">
                                    {selectedProject.coolifyDomain.replace('https://', '')}
                                  </a>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => {
                                  setIsFetchingCoolifyStatus(true);
                                  callApi('GET', `/projects/${selectedProject.id}/coolify-status`)
                                    .then(d => { setCoolifyStatus(d); setIsFetchingCoolifyStatus(false); })
                                    .catch(() => setIsFetchingCoolifyStatus(false));
                                }}
                                className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-zinc-300 transition-colors"
                                title="Osveži status"
                              >
                                <RefreshCw size={14} className={isFetchingCoolifyStatus ? 'animate-spin' : ''} />
                              </button>
                              <button onClick={handleCoolifyDeploy} disabled={isCoolifyDeploying}
                                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-colors disabled:opacity-50 shadow-lg shadow-emerald-500/10"
                              >
                                {isCoolifyDeploying ? 'Deploy...' : 'Deploy'}
                              </button>
                            </div>
                          </div>

                          {/* Info row */}
                          {coolifyStatus && (
                            <div className="px-5 py-3 flex items-center gap-4 text-[11px] text-zinc-500 border-b border-zinc-800/40 bg-zinc-950/30">
                              {coolifyStatus.buildPack && (
                                <span className="flex items-center gap-1">
                                  <Settings size={10} className="text-zinc-600" />
                                  {coolifyStatus.buildPack}
                                </span>
                              )}
                              {coolifyStatus.gitCommitSha && (
                                <span className="font-mono text-zinc-600">
                                  #{coolifyStatus.gitCommitSha.substring(0, 7)}
                                </span>
                              )}
                              {coolifyStatus.lastOnlineAt && (
                                <span>Zadnji put online: {formatRelativeTime(coolifyStatus.lastOnlineAt)}</span>
                              )}
                              <button onClick={handleFetchCoolifyLogs}
                                className="ml-auto text-zinc-500 hover:text-zinc-300 font-medium transition-colors"
                              >
                                Logovi
                              </button>
                            </div>
                          )}

                          {/* Logs */}
                          {showCoolifyLogs && coolifyLogs && (
                            <div className="relative bg-zinc-950 border-b border-zinc-800/40 p-4 text-xs font-mono text-zinc-400 max-h-40 overflow-y-auto custom-scrollbar">
                              <button onClick={() => setShowCoolifyLogs(false)} className="absolute top-2 right-2 text-zinc-500 hover:text-zinc-300">
                                <X size={13} />
                              </button>
                              <pre className="whitespace-pre-wrap break-all pr-4">{coolifyLogs}</pre>
                            </div>
                          )}

                          {/* Deploy History */}
                          {coolifyStatus?.deployHistory?.length > 0 && (
                            <div className="px-5 py-4">
                              <div className="flex items-center gap-2 mb-3">
                                <Clock className="w-3.5 h-3.5 text-zinc-500" />
                                <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Istorija</span>
                              </div>
                              <div className="space-y-0">
                                {coolifyStatus.deployHistory.map((entry, i) => (
                                  <div key={entry.id || i} className="flex items-start gap-3 py-2 group">
                                    {/* Timeline dot + line */}
                                    <div className="flex flex-col items-center pt-1 shrink-0">
                                      <div className={`w-2 h-2 rounded-full shrink-0 ${
                                        entry.status === 'success' ? 'bg-emerald-500' :
                                        entry.status === 'failed' ? 'bg-red-500' :
                                        entry.status === 'started' ? 'bg-amber-400 animate-pulse' :
                                        'bg-zinc-600'
                                      }`} />
                                      {i < coolifyStatus.deployHistory.length - 1 && (
                                        <div className="w-px flex-1 bg-zinc-800 mt-1 min-h-[16px]" />
                                      )}
                                    </div>
                                    {/* Content */}
                                    <div className="flex-1 min-w-0 pb-1">
                                      <div className="flex items-center gap-2 mb-0.5">
                                        <span className={`text-[10px] font-bold uppercase tracking-wider ${
                                          entry.action === 'publish' ? 'text-indigo-400' :
                                          entry.action === 'deploy' ? 'text-cyan-400' :
                                          'text-zinc-400'
                                        }`}>
                                          {entry.action === 'publish' ? 'Publish' :
                                           entry.action === 'deploy' ? 'Deploy' : entry.action}
                                        </span>
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                          entry.status === 'success' ? 'bg-emerald-500/10 text-emerald-400' :
                                          entry.status === 'failed' ? 'bg-red-500/10 text-red-400' :
                                          entry.status === 'started' ? 'bg-amber-500/10 text-amber-400' :
                                          'bg-zinc-800 text-zinc-500'
                                        }`}>
                                          {entry.status === 'success' ? 'Uspešno' :
                                           entry.status === 'failed' ? 'Greška' :
                                           entry.status === 'started' ? 'U toku...' : entry.status}
                                        </span>
                                      </div>
                                      <p className="text-xs text-zinc-500 truncate">{entry.message}</p>
                                      <span className="text-[10px] text-zinc-700">
                                        {new Date(entry.timestamp).toLocaleString('sr-Latn-RS', {
                                          day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                                        })}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="p-5">
                          <div className="border border-dashed border-zinc-700/60 rounded-xl p-5 text-center">
                            <p className="text-sm text-zinc-500 mb-1">Coolify nije konfigurisan</p>
                            <p className="text-xs text-zinc-600 mb-4">
                              {selectedProject.github ? 'Klikni dugme da kreiras Coolify app.' : 'Dodaj GitHub URL pre Coolify setup-a.'}
                            </p>
                            {coolifyConfigured ? (
                              <button onClick={handleCoolifySetup} disabled={isCoolifySetup || !selectedProject.github}
                                className="px-5 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-sm font-bold text-zinc-200 rounded-xl transition-colors disabled:opacity-50"
                              >
                                {isCoolifySetup ? 'Konektujem...' : 'Poveži sa Coolify'}
                              </button>
                            ) : (
                              <p className="text-xs text-zinc-600">Coolify API nije konfigurisan</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                      {/* Quick links */}
                      {(selectedProject.github || selectedProject.liveUrl) && (
                        <div className="flex gap-3">
                          {selectedProject.github && (
                            <a href={selectedProject.github} target="_blank" rel="noreferrer"
                              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-xl text-sm font-medium text-zinc-300 transition-colors">
                              <Github className="w-4 h-4 text-zinc-500" /> GitHub
                            </a>
                          )}
                          {selectedProject.liveUrl && (
                            <a href={selectedProject.liveUrl} target="_blank" rel="noreferrer"
                              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-xl text-sm font-medium text-zinc-300 transition-colors">
                              <Globe className="w-4 h-4 text-zinc-500" /> Live Link
                            </a>
                          )}
                        </div>
                      )}

                  </div>
                )}

                {/* ── TAB: FAJLOVI ─────────────────────────────────────── */}
                {panelTab === 'fajlovi' && (
                  <div className="p-8 space-y-6">
                    {/* Git Clone */}
                    <div className="bg-zinc-900/30 border border-zinc-800/60 rounded-2xl p-5">
                      <div className="flex items-center gap-2 mb-4">
                        <GitBranch className="w-4 h-4 text-zinc-400" />
                        <span className="text-sm font-semibold text-zinc-200">Git Repozitorijum</span>
                        {projectFiles?.gitExists && (
                          <span className="ml-auto text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">Kloniran</span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={cloneUrl}
                          onChange={e => setCloneUrl(e.target.value)}
                          placeholder="https://github.com/korisnik/repo.git"
                          className="flex-1 bg-zinc-950/50 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50 font-mono"
                        />
                        <button
                          onClick={handleClone}
                          disabled={isCloning || !selectedProject.serverPath}
                          className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-xl text-sm font-bold text-zinc-200 transition-colors disabled:opacity-50 whitespace-nowrap flex items-center gap-2"
                        >
                          {isCloning
                            ? <div className="w-4 h-4 border-2 border-zinc-600 border-t-zinc-200 rounded-full animate-spin" />
                            : <GitBranch size={14} />
                          }
                          {projectFiles?.gitExists ? 'Git Pull' : 'Clone'}
                        </button>
                      </div>
                    </div>

                    {/* Documents */}
                    <div className="bg-zinc-900/30 border border-zinc-800/60 rounded-2xl p-5">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-zinc-400" />
                          <span className="text-sm font-semibold text-zinc-200">Dokumenti (_docs/)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => fetchFiles(selectedProject.id)} className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-zinc-300 transition-colors">
                            <RefreshCw size={13} />
                          </button>
                          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={e => handleUpload(e.target.files)} />
                          <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isUploading || !selectedProject.serverPath}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-50"
                          >
                            {isUploading
                              ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              : <Upload size={13} />
                            }
                            Upload
                          </button>
                        </div>
                      </div>

                      <div
                        onDragOver={e => e.preventDefault()}
                        onDrop={e => { e.preventDefault(); handleUpload(e.dataTransfer.files); }}
                        className="border-2 border-dashed border-zinc-800 hover:border-zinc-700 rounded-xl p-4 mb-4 text-center cursor-pointer transition-colors"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Upload size={20} className="mx-auto mb-2 text-zinc-600" />
                        <p className="text-xs text-zinc-500">Prevuci fajlove ovde ili klikni za upload</p>
                      </div>

                      {loadingFiles ? (
                        <div className="flex justify-center py-6">
                          <div className="w-6 h-6 border-2 border-zinc-700 border-t-zinc-400 rounded-full animate-spin" />
                        </div>
                      ) : projectFiles?.docs?.length > 0 ? (
                        <div className="space-y-2">
                          {projectFiles.docs.map(file => (
                            <div key={file.path} className="flex items-center gap-3 bg-zinc-950/50 border border-zinc-800 rounded-xl px-3 py-2.5">
                              <FileText size={14} className="text-zinc-500 shrink-0" />
                              <span className="flex-1 text-sm text-zinc-300 truncate">{file.name}</span>
                              <span className="text-[11px] text-zinc-600 shrink-0">{formatBytes(file.size)}</span>
                              <a href={getDownloadUrl(file.path)} download={file.name} className="p-1 hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-emerald-400 transition-colors">
                                <Download size={13} />
                              </a>
                              <button onClick={() => handleDeleteFile(file.path)} className="p-1 hover:bg-zinc-800 rounded-lg text-zinc-600 hover:text-red-400 transition-colors">
                                <Trash2 size={13} />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        !loadingFiles && projectFiles?.folderExists && (
                          <p className="text-center text-xs text-zinc-600 py-4">Nema dokumenta u _docs/ folderu</p>
                        )
                      )}
                    </div>

                    {/* Root files */}
                    {projectFiles?.rootFiles?.length > 0 && (
                      <div className="bg-zinc-900/30 border border-zinc-800/60 rounded-2xl p-5">
                        <div className="flex items-center gap-2 mb-4">
                          <FolderOpen className="w-4 h-4 text-zinc-400" />
                          <span className="text-sm font-semibold text-zinc-200">Root fajlovi</span>
                        </div>
                        <div className="space-y-2">
                          {projectFiles.rootFiles.map(file => (
                            <div key={file.path} className="flex items-center gap-3 bg-zinc-950/50 border border-zinc-800 rounded-xl px-3 py-2.5">
                              <FileText size={14} className="text-zinc-500 shrink-0" />
                              <span className="flex-1 text-sm text-zinc-300 truncate font-mono text-xs">{file.name}</span>
                              <span className="text-[11px] text-zinc-600 shrink-0">{formatBytes(file.size)}</span>
                              <a href={getDownloadUrl(file.path)} download={file.name} className="p-1 hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-emerald-400 transition-colors">
                                <Download size={13} />
                              </a>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── TAB: BELEŠKE ─────────────────────────────────────── */}
                {panelTab === 'beleski' && (
                  <div className="p-8 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-zinc-200 font-semibold">
                        <Activity className="w-4 h-4 text-emerald-500" />
                        AI Kontekst / Beleške
                      </div>
                      <button
                        onClick={() => handleSaveNotes(selectedProject.id, notesText)}
                        disabled={isSavingNotes}
                        className="text-xs text-emerald-500 hover:text-emerald-400 font-medium disabled:opacity-50 transition-colors"
                      >
                        {isSavingNotes ? 'Čuvam...' : notesSaved ? 'Sačuvano' : 'Sačuvaj'}
                      </button>
                    </div>
                    <textarea
                      value={notesText}
                      onChange={e => setNotesText(e.target.value)}
                      onBlur={() => {
                        if (notesText !== (selectedProject.notes || '')) {
                          handleSaveNotes(selectedProject.id, notesText);
                        }
                      }}
                      placeholder="Gde smo stali, šta treba uraditi, kontext za Claude agenta..."
                      className="w-full bg-zinc-950/50 border border-zinc-800 rounded-xl p-4 text-sm text-zinc-300 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all resize-none min-h-[300px] leading-relaxed custom-scrollbar"
                    />
                  </div>
                )}

                {/* ── TAB: LICENCE ─────────────────────────────────────── */}
                {panelTab === 'licence' && (
                  <LicenceTab
                    project={selectedProject}
                    onUpdate={(updated) => {
                      setProjects(prev => prev.map(p => p.id === updated.id ? updated : p));
                      setSelectedProject(updated);
                    }}
                  />
                )}

              </div>
            </div>
          </div>
        )}

        {/* TOAST */}
        {toast && (
          <div className={`fixed bottom-6 right-6 z-[100] flex items-center gap-3 px-4 py-3 rounded-xl border shadow-xl text-sm font-medium ${
            toast.type === 'success' ? 'bg-emerald-950 border-emerald-500/30 text-emerald-400' :
            toast.type === 'error'   ? 'bg-red-950 border-red-500/30 text-red-400' :
                                       'bg-zinc-900 border-zinc-700 text-zinc-300'
          }`}>
            {toast.type === 'loading' && <div className="w-4 h-4 border-2 border-zinc-600 border-t-zinc-200 rounded-full animate-spin shrink-0" />}
            {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
            {toast.type === 'error'   && <AlertCircle className="w-4 h-4 shrink-0" />}
            <span className="max-w-xs">{toast.message}</span>
            <button onClick={() => setToast(null)} className="ml-1 opacity-50 hover:opacity-100 transition-opacity">
              <X size={14} />
            </button>
          </div>
        )}
      </main>

      {/* NEW PROJECT MODAL */}
      {showNewModal && (
        <ProjectFormModal
          onSave={handleCreate}
          onClose={() => setShowNewModal(false)}
          githubOrg={githubOrg}
        />
      )}

      {/* EDIT PROJECT MODAL */}
      {editProject && (
        <ProjectFormModal
          initial={editProject}
          onSave={(data) => handleUpdate(editProject.id, data)}
          onDelete={() => handleDelete(editProject.id)}
          onClose={() => setEditProject(null)}
          githubOrg={githubOrg}
        />
      )}

      {/* IMPORT PROJECT MODAL */}
      {showImportModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={e => { if (e.target === e.currentTarget) setShowImportModal(false); }}
        >
          <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-8 py-5 border-b border-zinc-800/80 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white flex items-center gap-2"><FolderInput size={18} className="text-emerald-400" /> Importuj projekat</h2>
              <button onClick={() => setShowImportModal(false)} className="p-1.5 hover:bg-zinc-900 rounded-lg text-zinc-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-8 space-y-4">
              <p className="text-sm text-zinc-400">Unesi putanju do postojećeg projekta na disku. Backend će pročitati git remote i kreirati projekat u dashboardu.</p>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Putanja do foldera</label>
                <input
                  value={importPath}
                  onChange={e => setImportPath(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleImport(); }}
                  placeholder="C:/projects/moj-projekat"
                  className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all font-mono"
                  autoFocus
                />
              </div>
            </div>
            <div className="px-8 py-5 border-t border-zinc-800/80 flex justify-end gap-3">
              <button onClick={() => setShowImportModal(false)} className="px-5 py-2.5 text-sm text-zinc-400 hover:text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-xl transition-all">Otkaži</button>
              <button
                onClick={handleImport}
                disabled={!importPath.trim() || isImporting}
                className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition-all disabled:opacity-50 shadow-lg shadow-emerald-500/20"
              >
                {isImporting && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                Importuj
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HELP MODAL */}
      {showHelp && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={e => { if (e.target === e.currentTarget) setShowHelp(false); }}
        >
          <div className="w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-8 py-5 border-b border-zinc-800/80 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white flex items-center gap-2"><HelpCircle size={18} className="text-emerald-400" /> IMPULSE Dev — Uputstvo</h2>
              <button onClick={() => setShowHelp(false)} className="p-1.5 hover:bg-zinc-900 rounded-lg text-zinc-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-8 space-y-5">
              <div className="space-y-3">
                {[
                  { icon: <Plus size={14} />, label: 'Novi Projekat', desc: 'Kreira GitHub repo + Coolify app + lokalni folder', color: 'text-emerald-400' },
                  { icon: <Sparkles size={14} />, label: 'Dev Mode', desc: 'Otvara Claude AI terminal + Live Preview', color: 'text-indigo-400' },
                  { icon: <CloudUpload size={14} />, label: 'Publish', desc: 'Git add + commit + push koda na GitHub', color: 'text-zinc-300' },
                  { icon: <Download size={14} />, label: 'Pull', desc: 'Povlači projekte sa web dashboarda (metapodaci)', color: 'text-zinc-300' },
                  { icon: <GitBranch size={14} />, label: 'Sync', desc: 'Sync IMPULSE repo na GitHub (git add + commit + push + pull)', color: 'text-zinc-300' },
                  { icon: <FolderInput size={14} />, label: 'Importuj', desc: 'Dodaje postojeći folder/projekat u dashboard', color: 'text-zinc-300' },
                  { icon: <Download size={14} />, label: 'Preuzmi projekat', desc: 'Klonira kod sa GitHub-a na ovaj računar (za nove mašine)', color: 'text-amber-400' },
                  { icon: <GitPullRequest size={14} />, label: 'Ažuriraj kod', desc: 'Povlači poslednje promene sa GitHub-a (git pull)', color: 'text-zinc-300' },
                ].map(item => (
                  <div key={item.label} className="flex items-start gap-3">
                    <div className={`mt-0.5 shrink-0 ${item.color}`}>{item.icon}</div>
                    <div>
                      <span className={`text-sm font-semibold ${item.color}`}>{item.label}</span>
                      <p className="text-xs text-zinc-500 mt-0.5">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Na novom računaru</p>
                <ol className="text-sm text-zinc-400 space-y-1.5 list-decimal list-inside">
                  <li><span className="text-emerald-400 font-medium">Pull</span> — povuci projekte sa web dashboarda</li>
                  <li><span className="text-amber-400 font-medium">Preuzmi</span> — kloniraj kod sa GitHub-a</li>
                  <li><span className="text-indigo-400 font-medium">Dev Mode</span> — nastavi razvoj</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #27272a; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #3f3f46; }
      `}</style>
    </div>
  );
}

// ── New / Edit Project Modal (Simplified for Local) ──────────────────────────

const TECH_SUGGESTIONS = [
  'React', 'Next.js', 'Node.js', 'Express', 'TypeScript', 'JavaScript',
  'Python', 'PostgreSQL', 'MongoDB', 'Tailwind', 'Vite', 'Vue', 'Svelte',
];

const CLAUDE_INFRA = `## Infrastruktura & Deploy
- Deploy: Coolify PaaS sa Nixpacks build packom
- Domen: *.impulsee.dev subdomen automatski
- VAŽNO: package.json MORA imati "build" i "start" skripte
- Static site: dodaj "serve" i start: "serve dist -s -l 3000"
- Port MORA biti 3000 (ili process.env.PORT)
- .gitignore: node_modules/, dist/, .env

## Opšta pravila
- Jezik UI-ja: srpski (sr-Latn-RS)
- Mobile-first responsive dizajn
- Referentni materijali su u _docs/ folderu`;

const CLAUDE_TEMPLATES = {
  'React + Vite': `## Tech Stack: React 18 + Vite + Tailwind CSS\n\n${CLAUDE_INFRA}\n\nSetup: npm install serve, start: "serve dist -s -l 3000"`,
  'Next.js': `## Tech Stack: Next.js 14+ (App Router) + Tailwind\n\n${CLAUDE_INFRA}\n\nSetup: start: "next start -p 3000"`,
  'Node.js + Express': `## Tech Stack: Node.js + Express\n\n${CLAUDE_INFRA}\n\nSetup: start: "node server.js", port: process.env.PORT || 3000`,
  'Landing Page': `## Tech Stack: Vanilla HTML/CSS/JS + Vite\n\n${CLAUDE_INFRA}\n\nSetup: npm install vite serve, start: "serve dist -s -l 3000"`,
  'Prazno': CLAUDE_INFRA,
};

function ProjectFormModal({ initial = {}, onSave, onDelete, onClose, githubOrg }) {
  const isEdit = !!initial?.id;
  const [form, setForm] = useState({
    name: initial.name || '',
    client: initial.client || '',
    status: initial.status || 'idea',
    type: initial.type || 'client',
    github: initial.github || '',
    liveUrl: initial.liveUrl || '',
    tech: initial.tech || [],
    notes: initial.notes || '',
    githubOrg: githubOrg || '',
    cloneUrl: '',
    claudeTemplate: 'React + Vite',
    claudeInstructions: '',
    includeLicensing: false,
  });
  const [techInput, setTechInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [showClaudePreview, setShowClaudePreview] = useState(false);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const addTech = (t) => {
    const v = t.trim();
    if (v && !form.tech.includes(v)) set('tech', [...form.tech, v]);
    setTechInput('');
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  const inputCls = "w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all";
  const labelCls = "block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-xl bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden">

        <div className="px-8 py-5 border-b border-zinc-800/80 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">{isEdit ? 'Uredi projekat' : 'Novi projekat'}</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-zinc-900 rounded-lg text-zinc-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-8 space-y-5 max-h-[65vh] overflow-y-auto custom-scrollbar">

          {!isEdit && (
            <div className="flex items-center gap-2 bg-indigo-500/5 border border-indigo-500/20 rounded-xl px-4 py-3 text-xs text-indigo-400">
              <Sparkles size={14} className="shrink-0" />
              <span>One-click: kreira GitHub repo, folder, Coolify app</span>
            </div>
          )}

          {/* Name */}
          <div>
            <label className={labelCls}>Naziv projekta *</label>
            <input className={inputCls} placeholder="Npr. Klijent Portal" value={form.name} onChange={e => set('name', e.target.value)} autoFocus />
          </div>

          {/* Git Clone URL (only for new) */}
          {!isEdit && (
            <div>
              <label className={labelCls}>Git Clone URL (opciono)</label>
              <input className={`${inputCls} font-mono`} placeholder="https://github.com/user/repo.git" value={form.cloneUrl} onChange={e => set('cloneUrl', e.target.value)} />
              <p className="text-[11px] text-zinc-600 mt-1.5">Ako imaš postojeći repo, unesi URL — preskače kreiranje novog GitHub repoa</p>
            </div>
          )}

          {/* GitHub org (only for new, hidden when cloneUrl is set) */}
          {!isEdit && !form.cloneUrl.trim() && (
            <div>
              <label className={labelCls}>GitHub organizacija</label>
              <input className={`${inputCls} font-mono`} placeholder="panto032" value={form.githubOrg} onChange={e => set('githubOrg', e.target.value)} />
            </div>
          )}

          {isEdit && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Klijent</label>
                <input className={inputCls} placeholder="Acme Corp" value={form.client} onChange={e => set('client', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Status</label>
                <select className={inputCls} value={form.status} onChange={e => set('status', e.target.value)}>
                  <option value="idea">Ideja</option>
                  <option value="in-progress">U razvoju</option>
                  <option value="completed">Završen</option>
                  <option value="deployed">Live / Deployed</option>
                  <option value="paused">Pauzirano</option>
                </select>
              </div>
            </div>
          )}

          {isEdit && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>GitHub URL</label>
                <input className={inputCls} placeholder="https://github.com/..." value={form.github} onChange={e => set('github', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Live URL</label>
                <input className={inputCls} placeholder="https://app.example.com" value={form.liveUrl} onChange={e => set('liveUrl', e.target.value)} />
              </div>
            </div>
          )}

          {/* Tech stack */}
          <div>
            <label className={labelCls}>Tech stack</label>
            {form.tech.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {form.tech.map(t => (
                  <span key={t} className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs text-emerald-400 font-medium">
                    {t}
                    <button onClick={() => set('tech', form.tech.filter(x => x !== t))} className="hover:text-white transition-colors"><X size={11} /></button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                className={`${inputCls} flex-1`}
                placeholder="Dodaj tehnologiju..."
                value={techInput}
                onChange={e => setTechInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTech(techInput); } }}
              />
              <button onClick={() => addTech(techInput)} className="px-4 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-xl text-zinc-300 text-sm font-bold transition-colors">+</button>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {TECH_SUGGESTIONS.filter(t => !form.tech.includes(t)).map(t => (
                <button key={t} onClick={() => addTech(t)} className="px-2.5 py-1 text-[11px] bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-md text-zinc-500 hover:text-zinc-300 transition-all">+ {t}</button>
              ))}
            </div>
          </div>

          {/* Claude Instructions (only for new projects) */}
          {!isEdit && (
            <div>
              <label className={labelCls}>
                <span className="flex items-center gap-2">
                  <Sparkles size={12} className="text-indigo-400" />
                  Claude Instrukcije (CLAUDE.md)
                </span>
              </label>

              {/* Template selector */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                {Object.keys(CLAUDE_TEMPLATES).map(tmpl => (
                  <button
                    key={tmpl}
                    onClick={() => set('claudeTemplate', tmpl)}
                    className={`px-3 py-1.5 text-[11px] font-medium rounded-lg border transition-all ${
                      form.claudeTemplate === tmpl
                        ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-400'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700'
                    }`}
                  >
                    {tmpl}
                  </button>
                ))}
              </div>

              {/* Custom instructions */}
              <textarea
                value={form.claudeInstructions}
                onChange={e => set('claudeInstructions', e.target.value)}
                placeholder="Dodatne instrukcije za Claude agenta... (npr. opis projekta, šta treba napraviti, koje boje koristiti, reference na fajlove iz _docs/ foldera)"
                className={`${inputCls} resize-none min-h-[100px] leading-relaxed`}
              />

              {/* Include Licensing checkbox */}
              <label className="flex items-center gap-2.5 mt-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={form.includeLicensing}
                  onChange={e => set('includeLicensing', e.target.checked)}
                  className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-purple-500 focus:ring-purple-500/30 cursor-pointer"
                />
                <span className="flex items-center gap-1.5 text-[12px] text-zinc-400 group-hover:text-zinc-300 transition-colors">
                  <Shield size={12} className="text-purple-400" />
                  Uključi licenciranje (IMPULSE License API)
                </span>
              </label>

              {/* Preview */}
              <button
                type="button"
                onClick={() => setShowClaudePreview(!showClaudePreview)}
                className="mt-2 text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors"
              >
                {showClaudePreview ? 'Sakrij preview' : 'Prikaži CLAUDE.md preview'}
              </button>
              {showClaudePreview && (
                <pre className="mt-2 bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-[11px] text-zinc-400 font-mono whitespace-pre-wrap max-h-48 overflow-y-auto custom-scrollbar">
{`# ${form.name || 'Naziv projekta'}

${CLAUDE_TEMPLATES[form.claudeTemplate] || ''}

## Opis projekta
${form.claudeInstructions || 'Ovde dodaj opis i kontekst za Claude AI agenta.'}

## Gde smo stali
-

## Šta treba uraditi
- `}
                </pre>
              )}
            </div>
          )}
        </div>

        <div className="px-8 py-5 border-t border-zinc-800/80 flex items-center justify-between">
          {onDelete ? (
            <button onClick={onDelete} className="text-sm text-red-500 hover:text-red-400 font-medium transition-colors">Obriši projekat</button>
          ) : <span />}
          <div className="flex gap-3">
            <button onClick={onClose} className="px-5 py-2.5 text-sm text-zinc-400 hover:text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-xl transition-all">Otkaži</button>
            <button
              onClick={handleSubmit}
              disabled={!form.name.trim() || saving}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition-all disabled:opacity-50 shadow-lg shadow-emerald-500/20"
            >
              {saving && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {isEdit ? 'Sačuvaj izmene' : 'Kreiraj projekat'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Licence Tab Component ──────────────────────────────────────────────────────

function LicenceTab({ project, onUpdate }) {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ clientName: '', clientEmail: '', plan: 'monthly' });
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [copiedKey, setCopiedKey] = useState(null);

  const licenses = project?.licenses || [];

  const createLicense = async () => {
    if (!formData.clientName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`${API}/projects/${project.id}/licenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        const refreshed = await fetch(`${API}/projects/${project.id}`).then(r => r.json());
        onUpdate(refreshed);
        setFormData({ clientName: '', clientEmail: '', plan: 'monthly' });
        setShowForm(false);
      }
    } catch {}
    setSaving(false);
  };

  const doAction = async (licId, action, body) => {
    setActionLoading(licId + action);
    try {
      const method = action === 'delete' ? 'DELETE' : action === 'renew' ? 'POST' : 'PUT';
      const url = action === 'renew'
        ? `${API}/projects/${project.id}/licenses/${licId}/renew`
        : `${API}/projects/${project.id}/licenses/${licId}`;
      await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      const refreshed = await fetch(`${API}/projects/${project.id}`).then(r => r.json());
      onUpdate(refreshed);
    } catch {}
    setActionLoading(null);
  };

  const copyKey = (key) => {
    navigator.clipboard.writeText(key).catch(() => {});
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const daysLeft = (expiresAt) => {
    const diff = new Date(expiresAt) - new Date();
    return Math.max(0, Math.ceil(diff / 86400000));
  };

  const statusBadge = (status) => {
    const m = {
      active: { label: 'Aktivna', cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
      expired: { label: 'Istekla', cls: 'bg-red-500/15 text-red-400 border-red-500/30' },
      suspended: { label: 'Suspendovana', cls: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30' },
    };
    const s = m[status] || m.expired;
    return <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md border ${s.cls}`}>{s.label}</span>;
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-zinc-200 font-semibold">
          <Shield className="w-4 h-4 text-purple-400" />
          Licence ({licenses.length})
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 text-purple-400 rounded-lg transition-all"
        >
          <Plus size={12} /> Nova licenca
        </button>
      </div>

      {/* New license form */}
      {showForm && (
        <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input
              value={formData.clientName}
              onChange={e => setFormData(f => ({ ...f, clientName: e.target.value }))}
              placeholder="Ime klijenta *"
              className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-purple-500/50"
            />
            <input
              value={formData.clientEmail}
              onChange={e => setFormData(f => ({ ...f, clientEmail: e.target.value }))}
              placeholder="Email klijenta"
              className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-purple-500/50"
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="text-xs text-zinc-500">Plan:</label>
            {['monthly', 'yearly'].map(p => (
              <button
                key={p}
                onClick={() => setFormData(f => ({ ...f, plan: p }))}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                  formData.plan === p
                    ? 'bg-purple-500/15 border-purple-500/30 text-purple-400'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {p === 'monthly' ? 'Mesečna (30 dana)' : 'Godišnja (365 dana)'}
              </button>
            ))}
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={createLicense}
              disabled={!formData.clientName.trim() || saving}
              className="px-4 py-2 text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-all disabled:opacity-50"
            >
              {saving ? 'Kreiram...' : 'Kreiraj licencu'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Otkaži</button>
          </div>
        </div>
      )}

      {/* License list */}
      {licenses.length === 0 && !showForm && (
        <div className="text-center py-12 text-zinc-600">
          <Key size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nema licenci za ovaj projekat</p>
          <p className="text-xs mt-1">Klikni "Nova licenca" da kreiraš prvu</p>
        </div>
      )}

      {licenses.map(lic => (
        <div key={lic.id} className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-5 space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                {statusBadge(lic.status)}
                <span className="text-sm font-semibold text-zinc-200">{lic.clientName}</span>
              </div>
              {lic.clientEmail && <p className="text-xs text-zinc-500">{lic.clientEmail}</p>}
            </div>
            <span className="text-[10px] text-zinc-600 uppercase tracking-wider font-bold">
              {lic.plan === 'yearly' ? 'Godišnja' : 'Mesečna'}
            </span>
          </div>

          {/* Key */}
          <div className="flex items-center gap-2 bg-zinc-900/60 border border-zinc-800/60 rounded-lg px-3 py-2">
            <Key size={12} className="text-purple-400 shrink-0" />
            <code className="text-xs text-zinc-300 font-mono flex-1 select-all">{lic.key}</code>
            <button onClick={() => copyKey(lic.key)} className="text-zinc-600 hover:text-zinc-300 transition-colors">
              {copiedKey === lic.key ? <CheckCircle2 size={12} className="text-emerald-400" /> : <Copy size={12} />}
            </button>
          </div>

          {/* Stats */}
          <div className="flex flex-wrap gap-4 text-xs text-zinc-500">
            <span>Ističe: <span className={daysLeft(lic.expiresAt) <= 7 ? 'text-red-400 font-medium' : 'text-zinc-400'}>{new Date(lic.expiresAt).toLocaleDateString('sr-Latn-RS')} ({daysLeft(lic.expiresAt)} dana)</span></span>
            <span>Verifikacije: <span className="text-zinc-400">{lic.verifyCount || 0}</span></span>
            {lic.lastVerifiedAt && <span>Poslednja: <span className="text-zinc-400">{formatRelativeTime(lic.lastVerifiedAt)}</span></span>}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => doAction(lic.id, 'renew')}
              disabled={actionLoading === lic.id + 'renew'}
              className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 rounded-lg transition-all disabled:opacity-50"
            >
              <RotateCcw size={10} /> Produži
            </button>
            {lic.status === 'active' ? (
              <button
                onClick={() => doAction(lic.id, 'suspend', { status: 'suspended' })}
                disabled={actionLoading === lic.id + 'suspend'}
                className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium bg-zinc-500/10 hover:bg-zinc-500/20 border border-zinc-500/20 text-zinc-400 rounded-lg transition-all disabled:opacity-50"
              >
                <Ban size={10} /> Suspendiraj
              </button>
            ) : (
              <button
                onClick={() => doAction(lic.id, 'activate', { status: 'active' })}
                disabled={actionLoading === lic.id + 'activate'}
                className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 rounded-lg transition-all disabled:opacity-50"
              >
                <Play size={10} /> Aktiviraj
              </button>
            )}
            <button
              onClick={() => { if (window.confirm('Obrisati licencu?')) doAction(lic.id, 'delete'); }}
              disabled={actionLoading === lic.id + 'delete'}
              className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-red-400/60 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all disabled:opacity-50"
            >
              <Trash2 size={10} /> Obriši
            </button>
          </div>
        </div>
      ))}

      {/* Integration snippet */}
      {licenses.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-zinc-400 text-xs font-semibold uppercase tracking-wider">
            <FileText size={12} /> Integracija
          </div>
          <pre className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-[11px] text-zinc-400 font-mono whitespace-pre-wrap overflow-x-auto custom-scrollbar">
{`// Provjera licence na startu aplikacije
async function verifyLicense() {
  try {
    const res = await fetch('https://app.impulsee.dev/api/license/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: process.env.IMPULSE_LICENSE_KEY }),
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    if (!data.valid) {
      console.error('Licenca nije validna:', data.reason);
      // Blokiraj pristup admin panelu
    }
  } catch {
    // Offline fallback - nastavi normalno
  }
}`}
          </pre>
        </div>
      )}
    </div>
  );
}

// ── Helper Components ──────────────────────────────────────────────────────────

function SidebarItem({ icon, label, count, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all text-sm font-medium group ${
        active ? 'bg-emerald-500/10 text-emerald-400' : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
      }`}
    >
      <div className="flex items-center gap-3">
        {React.cloneElement(icon, { className: active ? 'text-emerald-400' : 'text-zinc-500 group-hover:text-zinc-400' })}
        {label}
      </div>
      {count !== undefined && (
        <span className={`text-[10px] px-2 py-0.5 rounded-full ${active ? 'bg-emerald-500/20 text-emerald-300' : 'bg-zinc-900 text-zinc-500'}`}>
          {count}
        </span>
      )}
    </button>
  );
}

function StatusBadge({ status }) {
  const map = {
    live:          { label: 'Live',      cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', dot: 'bg-emerald-400' },
    deployed:      { label: 'Live',      cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', dot: 'bg-emerald-400' },
    completed:     { label: 'Završen',   cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', dot: 'bg-emerald-400' },
    'in-progress': { label: 'U razvoju', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20',      dot: 'bg-amber-400' },
    paused:        { label: 'Pauzirano', cls: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',         dot: 'bg-zinc-400' },
    idea:          { label: 'Ideja',     cls: 'bg-purple-500/10 text-purple-400 border-purple-500/20',   dot: 'bg-purple-400' },
  };
  const cfg = map[status] ?? map.idea;
  return (
    <div className={`px-2.5 py-1 rounded-full text-[10px] uppercase tracking-wider font-bold border flex items-center gap-1.5 shrink-0 ${cfg.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </div>
  );
}
