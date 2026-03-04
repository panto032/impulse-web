import React, { useState, useEffect, useRef } from 'react';
import {
  Rocket, FolderGit2, LayoutGrid,
  Search, Clock, CheckCircle2, AlertCircle, X,
  Github, Activity, Globe, RefreshCw, Copy,
  Terminal,
} from 'lucide-react';

const API = '/api';
const TOKEN_KEY = 'impulse_web_token';

// ── Login Page ────────────────────────────────────────────────────────────────

function LoginPage({ onLogin }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Greška'); return; }
      localStorage.setItem(TOKEN_KEY, data.token);
      onLogin(data.token);
    } catch {
      setError('Backend nije dostupan.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Rocket className="text-cyan-400" size={28} />
            <span className="text-2xl font-bold text-white tracking-tight">IMPULSE</span>
          </div>
          <p className="text-zinc-500 text-sm">Client Dashboard</p>
        </div>
        <form onSubmit={handleSubmit} className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
          <div>
            <label className="block text-xs text-zinc-400 mb-1.5">Lozinka</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoFocus
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-cyan-500 transition-colors"
              placeholder="••••••••"
            />
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <button
            type="submit"
            disabled={loading || !password}
            className="w-full bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-semibold py-2.5 rounded-lg text-sm transition-colors"
          >
            {loading ? 'Prijava...' : 'Prijavi se'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

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

// ── Main App ──────────────────────────────────────────────────────────────────

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || '');
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState(null);
  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState(null);
  const [notesText, setNotesText] = useState('');
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);

  // Command Center tabs
  const [panelTab, setPanelTab] = useState('pregled');

  // Coolify
  const [coolifyStatus, setCoolifyStatus] = useState(null);
  const [isFetchingCoolifyStatus, setIsFetchingCoolifyStatus] = useState(false);
  const [isCoolifyDeploying, setIsCoolifyDeploying] = useState(false);
  const [coolifyLogs, setCoolifyLogs] = useState(null);
  const [showCoolifyLogs, setShowCoolifyLogs] = useState(false);

  // Client preview
  const [tokenCopied, setTokenCopied] = useState(false);
  const [isRotatingToken, setIsRotatingToken] = useState(false);

  // Custom domain
  const [domainInput, setDomainInput] = useState('');
  const [isDomainAdding, setIsDomainAdding] = useState(false);
  const [isDomainVerifying, setIsDomainVerifying] = useState(false);
  const [domainVerified, setDomainVerified] = useState(null);

  const coolifyPollRef = useRef(null);

  // Sync state on project change
  useEffect(() => {
    setNotesText(selectedProject?.notes || '');
    setNotesSaved(false);
    setPanelTab('pregled');
    setCoolifyStatus(null);
    setCoolifyLogs(null);
    setShowCoolifyLogs(false);
    setTokenCopied(false);
    setDomainInput('');
    setDomainVerified(null);
  }, [selectedProject?.id]);

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
        if (prev?.status === 'starting' || prev?.status === 'building') poll();
        return prev;
      });
    }, 5000);
    return () => { active = false; clearInterval(coolifyPollRef.current); };
  }, [selectedProject?.id, panelTab]);

  const authHeaders = (extra = {}) => ({
    Authorization: `Bearer ${token}`,
    ...extra,
  });

  const handleLogout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setToken('');
  };

  const fetchProjects = async () => {
    try {
      const res = await fetch(`${API}/projects`, { headers: authHeaders() });
      if (res.status === 401) { handleLogout(); return; }
      setProjects(await res.json());
    } catch {
      showToast('Backend nije dostupan.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (token) fetchProjects(); else setLoading(false); }, [token]);

  const callApi = async (method, path, body) => {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: authHeaders(body ? { 'Content-Type': 'application/json' } : {}),
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) { handleLogout(); throw new Error('Unauthorized'); }
    return res.json();
  };

  const showToast = (message, type, duration = 4000) => {
    setToast({ message, type });
    if (duration > 0) setTimeout(() => setToast(null), duration);
  };

  // Filtering
  const filteredProjects = projects.filter(p => {
    const matchTab = activeTab === 'all' || (activeTab === 'clients' && p.type !== 'saas') || (activeTab === 'saas' && p.type === 'saas');
    const q = search.toLowerCase();
    const matchSearch = !q || [p.name, p.client, ...(p.tech || [])].some(f => f?.toLowerCase().includes(q));
    return matchTab && matchSearch;
  });

  const counts = {
    all: projects.length,
    clients: projects.filter(p => p.type !== 'saas').length,
    saas: projects.filter(p => p.type === 'saas').length,
  };

  // Notes
  const handleSaveNotes = async (projectId, notes) => {
    setIsSavingNotes(true);
    try {
      const updated = await callApi('PUT', `/projects/${projectId}`, { notes });
      setProjects(prev => prev.map(p => p.id === projectId ? updated : p));
      if (selectedProject?.id === projectId) setSelectedProject(prev => ({ ...prev, notes }));
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 2000);
    } catch {
      showToast('Greška pri čuvanju.', 'error');
    }
    setIsSavingNotes(false);
  };

  // Coolify
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
        setCoolifyLogs(typeof data.logs === 'string' ? data.logs : JSON.stringify(data.logs, null, 2));
        setShowCoolifyLogs(true);
        showToast('Logovi učitani.', 'success');
      } else {
        showToast(data.error || 'Greška.', 'error');
      }
    } catch {
      showToast('Server nije dostupan.', 'error');
    }
  };

  // Custom Domain
  const handleAddDomain = async () => {
    if (!domainInput.trim()) return;
    setIsDomainAdding(true);
    try {
      const data = await callApi('POST', `/projects/${selectedProject.id}/add-domain`, { domain: domainInput.trim() });
      if (data.ok) {
        const updated = { ...selectedProject, customDomain: data.domain };
        setSelectedProject(updated);
        setProjects(prev => prev.map(p => p.id === selectedProject.id ? updated : p));
        setDomainInput('');
        showToast(`Domen ${data.domain} sačuvan!`, 'success');
      }
    } catch {} finally { setIsDomainAdding(false); }
  };

  const handleVerifyDomain = async () => {
    setIsDomainVerifying(true);
    setDomainVerified(null);
    try {
      const data = await callApi('GET', `/projects/${selectedProject.id}/verify-domain`);
      setDomainVerified(data.verified);
      showToast(data.verified ? 'DNS verifikovan!' : 'DNS nije propagiran.', data.verified ? 'success' : 'error');
    } catch {} finally { setIsDomainVerifying(false); }
  };

  // Client Preview
  const handleCopyClientLink = () => {
    const link = `${window.location.origin}/client/${selectedProject.clientToken}`;
    navigator.clipboard.writeText(link).then(() => {
      setTokenCopied(true);
      setTimeout(() => setTokenCopied(false), 2000);
    });
  };

  const handleRotateToken = async () => {
    if (!window.confirm('Generiši novi token? Stari link više neće raditi.')) return;
    setIsRotatingToken(true);
    try {
      const data = await callApi('POST', `/projects/${selectedProject.id}/rotate-token`);
      if (data.ok) {
        setSelectedProject(data.project);
        setProjects(prev => prev.map(p => p.id === data.project.id ? data.project : p));
        setTokenCopied(false);
        showToast('Novi token generisan.', 'success');
      }
    } catch {
      showToast('Server nije dostupan.', 'error');
    }
    setIsRotatingToken(false);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (!token) return <LoginPage onLogin={setToken} />;

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100 font-sans overflow-hidden selection:bg-cyan-500/30">

      {/* SIDEBAR */}
      <aside className="w-64 border-r border-zinc-800/60 bg-zinc-950/50 flex flex-col justify-between shrink-0">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-10">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Rocket className="text-white w-4 h-4" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white">IMPULSE<span className="text-cyan-500">.</span><span className="text-xs text-zinc-500 ml-1">Client</span></h1>
          </div>

          <nav className="space-y-1.5">
            <SidebarItem icon={<LayoutGrid size={18} />} label="Svi Projekti" count={counts.all} active={activeTab === 'all'} onClick={() => setActiveTab('all')} />
            <SidebarItem icon={<FolderGit2 size={18} />} label="Klijenti" count={counts.clients} active={activeTab === 'clients'} onClick={() => setActiveTab('clients')} />
            <SidebarItem icon={<Rocket size={18} />} label="Interni SaaS" count={counts.saas} active={activeTab === 'saas'} onClick={() => setActiveTab('saas')} />
          </nav>
        </div>

        <div className="p-6">
          <button onClick={handleLogout} className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 transition-all text-sm">
            <X size={16} /><span>Odjava</span>
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <main className="flex-1 flex flex-col relative overflow-hidden bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(6,182,212,0.05),rgba(255,255,255,0))]">

        <header className="h-20 border-b border-zinc-800/60 bg-zinc-950/80 backdrop-blur-md flex items-center justify-between px-8 z-10 shrink-0">
          <div className="relative w-[400px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Pretraži projekte..."
              className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-cyan-500/50 transition-all text-zinc-300 placeholder-zinc-600" />
          </div>
          <div className="flex items-center gap-2 text-sm text-zinc-400 bg-zinc-900/50 px-3 py-1.5 rounded-full border border-zinc-800/60">
            <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
            Web Dashboard
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-2">Projekti</h2>
            <p className="text-zinc-400">Pregled projekata, deploy i klijentski linkovi.</p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="w-8 h-8 border-2 border-zinc-700 border-t-cyan-500 rounded-full animate-spin" />
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-zinc-600">
              <FolderGit2 size={48} className="mb-4 opacity-30" />
              <p className="text-lg font-medium mb-2">{search ? 'Nema rezultata' : 'Nema projekata'}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
              {filteredProjects.map(project => (
                <div
                  key={project.id}
                  onClick={() => setSelectedProject(project)}
                  className="group relative bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-6 hover:bg-zinc-800/40 hover:border-zinc-700 transition-all duration-300 cursor-pointer shadow-sm hover:shadow-xl hover:shadow-cyan-500/5 overflow-hidden"
                >
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="flex justify-between items-start mb-5">
                    <div className="min-w-0 flex-1 pr-3">
                      <h3 className="text-lg font-bold text-zinc-100 group-hover:text-white transition-colors truncate">{project.name || '(bez naziva)'}</h3>
                      <p className="text-sm text-zinc-500 mt-1">{project.client || '—'}</p>
                    </div>
                    <StatusBadge status={project.status} />
                  </div>
                  {project.tech?.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-6">
                      {project.tech.map(t => (
                        <span key={t} className="px-2.5 py-1 text-[11px] font-medium bg-zinc-800/50 text-zinc-400 rounded-md border border-zinc-700/50">{t}</span>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center justify-between text-xs text-zinc-500 border-t border-zinc-800/60 pt-4">
                    <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />{formatRelativeTime(project.updatedAt)}</span>
                    <span className="text-zinc-400 group-hover:text-cyan-400 font-medium transition-colors">Otvori &rarr;</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* COMMAND CENTER */}
        {selectedProject && (
          <div className="absolute inset-0 z-50 flex justify-end overflow-hidden">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setSelectedProject(null)} />
            <div className="w-full max-w-2xl h-full bg-zinc-950 border-l border-zinc-800 relative flex flex-col shadow-2xl animate-in slide-in-from-right duration-300">

              <div className="px-8 py-5 border-b border-zinc-800/80 bg-zinc-950 flex justify-between items-start">
                <div className="min-w-0 flex-1 pr-4">
                  <div className="flex items-center gap-3 mb-1.5 flex-wrap">
                    <h2 className="text-xl font-bold text-white truncate">{selectedProject.name}</h2>
                    <StatusBadge status={selectedProject.status} />
                  </div>
                  <p className="text-sm text-zinc-500">{selectedProject.client || 'Nema klijenta'}</p>
                </div>
                <button onClick={() => setSelectedProject(null)} className="p-2 hover:bg-zinc-900 rounded-lg text-zinc-400 hover:text-white transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="flex border-b border-zinc-800/60 px-8 bg-zinc-950">
                {[
                  { id: 'pregled', label: 'Pregled' },
                  { id: 'beleski', label: 'Beleške' },
                ].map(tab => (
                  <button key={tab.id} onClick={() => setPanelTab(tab.id)}
                    className={`px-5 py-3.5 text-sm font-medium border-b-2 transition-colors ${panelTab === tab.id ? 'border-cyan-500 text-cyan-400' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
                  >{tab.label}</button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar">

                {panelTab === 'pregled' && (
                  <div className="p-8 space-y-6">

                    {/* Coolify Status */}
                    {selectedProject.coolifyAppId && (
                      <div className="bg-zinc-900/30 border border-zinc-800/60 rounded-2xl p-5">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2">
                            <Rocket className="w-4 h-4 text-zinc-400" />
                            <span className="text-sm font-semibold text-zinc-200">Coolify Deploy</span>
                          </div>
                          <button
                            onClick={() => {
                              setIsFetchingCoolifyStatus(true);
                              callApi('GET', `/projects/${selectedProject.id}/coolify-status`)
                                .then(d => { setCoolifyStatus(d); setIsFetchingCoolifyStatus(false); })
                                .catch(() => setIsFetchingCoolifyStatus(false));
                            }}
                            className="p-1 hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-zinc-300 transition-colors"
                          >
                            <RefreshCw size={13} className={isFetchingCoolifyStatus ? 'animate-spin' : ''} />
                          </button>
                        </div>

                        <div className="flex items-center gap-3 bg-zinc-950 border border-zinc-800 rounded-xl p-4 mb-3">
                          {coolifyStatus?.status === 'running'
                            ? <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                            : (coolifyStatus?.status === 'starting' || coolifyStatus?.status === 'building')
                            ? <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
                            : <span className="w-2.5 h-2.5 rounded-full bg-zinc-700 shrink-0" />
                          }
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-white">{!coolifyStatus ? 'Učitavam...' : coolifyStatus.status || 'Nepoznato'}</div>
                            {selectedProject.coolifyDomain && (
                              <a href={selectedProject.coolifyDomain} target="_blank" rel="noreferrer" className="text-xs text-cyan-400 hover:text-cyan-300 font-mono">
                                {selectedProject.coolifyDomain.replace('https://', '')}
                              </a>
                            )}
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <button onClick={handleCoolifyDeploy} disabled={isCoolifyDeploying}
                              className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-50"
                            >{isCoolifyDeploying ? 'Deploy...' : 'Deploy'}</button>
                            <button onClick={handleFetchCoolifyLogs}
                              className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-xs font-bold rounded-lg transition-colors"
                            >Logs</button>
                          </div>
                        </div>

                        {showCoolifyLogs && coolifyLogs && (
                          <div className="relative bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-xs font-mono text-zinc-400 max-h-40 overflow-y-auto custom-scrollbar">
                            <button onClick={() => setShowCoolifyLogs(false)} className="absolute top-2 right-2 text-zinc-500 hover:text-zinc-300"><X size={13} /></button>
                            <pre className="whitespace-pre-wrap break-all pr-4">{coolifyLogs}</pre>
                          </div>
                        )}
                      </div>
                    )}

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

                    {/* Custom Domain */}
                    <div className="bg-zinc-900/30 border border-zinc-800/60 rounded-2xl p-5">
                      <div className="flex items-center gap-2 mb-4">
                        <Globe className="w-4 h-4 text-zinc-400" />
                        <span className="text-sm font-semibold text-zinc-200">Custom Domen</span>
                        {selectedProject.customDomain && domainVerified === true && (
                          <span className="ml-auto flex items-center gap-1 text-emerald-400 text-xs"><CheckCircle2 size={12} /> Verifikovan</span>
                        )}
                      </div>
                      <div className="flex gap-2 mb-4">
                        <input value={domainInput} onChange={e => setDomainInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddDomain()}
                          placeholder={selectedProject.customDomain || 'portal.klijent.com'}
                          className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500 transition-colors" />
                        <button onClick={handleAddDomain} disabled={isDomainAdding || !domainInput.trim()}
                          className="px-4 py-2 text-xs font-bold bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-black rounded-xl transition-colors"
                        >{isDomainAdding ? 'Čuva...' : 'Dodaj'}</button>
                      </div>
                      {selectedProject.customDomain && (
                        <>
                          <p className="text-xs text-zinc-500 mb-2">DNS rekorde:</p>
                          <div className="bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden mb-3">
                            <table className="w-full text-xs">
                              <thead><tr className="border-b border-zinc-800">
                                <th className="text-left px-3 py-2 text-zinc-500 font-medium">Tip</th>
                                <th className="text-left px-3 py-2 text-zinc-500 font-medium">Ime</th>
                                <th className="text-left px-3 py-2 text-zinc-500 font-medium">Vrednost</th>
                              </tr></thead>
                              <tbody>
                                <tr className="border-b border-zinc-800/50">
                                  <td className="px-3 py-2 text-cyan-400 font-mono font-bold">A</td>
                                  <td className="px-3 py-2 text-zinc-300 font-mono">@</td>
                                  <td className="px-3 py-2 text-zinc-300 font-mono">167.99.141.246</td>
                                </tr>
                                <tr>
                                  <td className="px-3 py-2 text-cyan-400 font-mono font-bold">A</td>
                                  <td className="px-3 py-2 text-zinc-300 font-mono">www</td>
                                  <td className="px-3 py-2 text-zinc-300 font-mono">167.99.141.246</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                          <div className="flex items-center gap-3">
                            <button onClick={handleVerifyDomain} disabled={isDomainVerifying}
                              className="flex items-center gap-2 px-4 py-2 text-xs font-bold bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 rounded-xl transition-colors disabled:opacity-50"
                            >
                              <RefreshCw size={12} className={isDomainVerifying ? 'animate-spin' : ''} />
                              {isDomainVerifying ? 'Provjerava...' : 'Provjeri DNS'}
                            </button>
                            {domainVerified === true && <span className="flex items-center gap-1 text-emerald-400 text-xs"><CheckCircle2 size={13} /> DNS OK</span>}
                            {domainVerified === false && <span className="flex items-center gap-1 text-amber-400 text-xs"><AlertCircle size={13} /> Nije propagiran</span>}
                          </div>
                        </>
                      )}
                    </div>

                    {/* Client Preview Link */}
                    {selectedProject.clientToken && (
                      <div className="bg-zinc-900/30 border border-zinc-800/60 rounded-2xl p-5">
                        <div className="flex items-center gap-2 mb-3">
                          <Globe className="w-4 h-4 text-zinc-400" />
                          <span className="text-sm font-semibold text-zinc-200">Klijentski preview link</span>
                        </div>
                        <div className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 mb-3 overflow-hidden">
                          <span className="text-xs text-zinc-400 font-mono break-all">
                            {window.location.origin}/client/{selectedProject.clientToken}
                          </span>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={handleCopyClientLink}
                            className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-xl border transition-all ${
                              tokenCopied ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-300 hover:text-white'
                            }`}
                          >
                            {tokenCopied ? <CheckCircle2 size={13} /> : <Copy size={13} />}
                            {tokenCopied ? 'Kopirano!' : 'Kopiraj link'}
                          </button>
                          <button onClick={handleRotateToken} disabled={isRotatingToken}
                            className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-zinc-400 hover:text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-xl transition-colors disabled:opacity-50"
                          >
                            <RefreshCw size={13} className={isRotatingToken ? 'animate-spin' : ''} /> Novi token
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {panelTab === 'beleski' && (
                  <div className="p-8 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-zinc-200 font-semibold">
                        <Activity className="w-4 h-4 text-cyan-500" />
                        Beleške
                      </div>
                      <button onClick={() => handleSaveNotes(selectedProject.id, notesText)} disabled={isSavingNotes}
                        className="text-xs text-cyan-500 hover:text-cyan-400 font-medium disabled:opacity-50"
                      >{isSavingNotes ? 'Čuvam...' : notesSaved ? 'Sačuvano' : 'Sačuvaj'}</button>
                    </div>
                    <textarea value={notesText} onChange={e => setNotesText(e.target.value)}
                      onBlur={() => { if (notesText !== (selectedProject.notes || '')) handleSaveNotes(selectedProject.id, notesText); }}
                      placeholder="Beleške o projektu..."
                      className="w-full bg-zinc-950/50 border border-zinc-800 rounded-xl p-4 text-sm text-zinc-300 focus:outline-none focus:border-cyan-500/50 transition-all resize-none min-h-[300px] leading-relaxed custom-scrollbar" />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TOAST */}
        {toast && (
          <div className={`fixed bottom-6 right-6 z-[100] flex items-center gap-3 px-4 py-3 rounded-xl border shadow-xl text-sm font-medium ${
            toast.type === 'success' ? 'bg-emerald-950 border-emerald-500/30 text-emerald-400' :
            toast.type === 'error' ? 'bg-red-950 border-red-500/30 text-red-400' :
            'bg-zinc-900 border-zinc-700 text-zinc-300'
          }`}>
            {toast.type === 'loading' && <div className="w-4 h-4 border-2 border-zinc-600 border-t-zinc-200 rounded-full animate-spin shrink-0" />}
            {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
            {toast.type === 'error' && <AlertCircle className="w-4 h-4 shrink-0" />}
            <span className="max-w-xs">{toast.message}</span>
            <button onClick={() => setToast(null)} className="ml-1 opacity-50 hover:opacity-100"><X size={14} /></button>
          </div>
        )}
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #27272a; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #3f3f46; }
      `}</style>
    </div>
  );
}

// ── Helper Components ────────────────────────────────────────────────────────

function SidebarItem({ icon, label, count, active, onClick }) {
  return (
    <button onClick={onClick}
      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all text-sm font-medium group ${
        active ? 'bg-cyan-500/10 text-cyan-400' : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
      }`}
    >
      <div className="flex items-center gap-3">
        {React.cloneElement(icon, { className: active ? 'text-cyan-400' : 'text-zinc-500 group-hover:text-zinc-400' })}
        {label}
      </div>
      {count !== undefined && (
        <span className={`text-[10px] px-2 py-0.5 rounded-full ${active ? 'bg-cyan-500/20 text-cyan-300' : 'bg-zinc-900 text-zinc-500'}`}>
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
