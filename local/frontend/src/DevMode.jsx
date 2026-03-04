import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Sparkles, Monitor, Smartphone, Loader2,
  ChevronLeft, ExternalLink, X, Tablet,
  CheckCircle2, AlertCircle, ArrowLeft, RefreshCw, Upload,
  Image, FileText, Copy, Trash2, Shield,
} from 'lucide-react';

const API = '/api';

// Viewport presets
const VIEWPORTS = [
  { id: 'desktop', icon: Monitor, label: 'Desktop', width: '100%' },
  { id: 'tablet',  icon: Tablet,  label: 'Tablet',  width: '768px' },
  { id: 'mobile',  icon: Smartphone, label: 'Mobile', width: '390px' },
];

export default function DevMode({ project, onBack }) {
  const [leftWidth, setLeftWidth] = useState(38);
  const [isResizing, setIsResizing] = useState(false);
  const isResizingRef = useRef(false);
  const [viewport, setViewport] = useState('desktop');
  const [publishStatus, setPublishStatus] = useState(null); // null | 'publishing' | 'done' | 'error'
  const [commitMsg, setCommitMsg] = useState('');
  const [showCommitInput, setShowCommitInput] = useState(false);
  const [devPort, setDevPort] = useState(null);
  const [devLoading, setDevLoading] = useState(true);
  const [previewUrl, setPreviewUrl] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [copiedPath, setCopiedPath] = useState(null);
  const imgInputRef = useRef(null);
  const docInputRef = useRef(null);
  const containerRef = useRef(null);
  const previewIframeRef = useRef(null);
  const terminalRef = useRef(null);
  const termRef = useRef(null);
  const wsRef = useRef(null);
  const fitAddonRef = useRef(null);

  // Auto-start dev server on mount, stop on unmount
  useEffect(() => {
    let mounted = true;
    setDevLoading(true);

    const startDev = async () => {
      try {
        const res = await fetch(`${API}/projects/${project.id}/dev-start`, { method: 'POST' });
        const data = await res.json();
        if (!mounted) return;
        if (data.ok && data.port) {
          const url = `http://localhost:${data.port}`;
          setPreviewUrl(url);
          setUrlInput(url);
          setDevPort(data.port);
        } else {
          // Fallback to default
          setPreviewUrl('http://localhost:5173');
          setUrlInput('http://localhost:5173');
          setDevPort(5173);
        }
      } catch {
        setPreviewUrl('http://localhost:5173');
        setUrlInput('http://localhost:5173');
        setDevPort(5173);
      }
      if (mounted) setDevLoading(false);
    };

    startDev();

    return () => {
      mounted = false;
      // Stop dev server on unmount (keepalive ensures delivery during page unload)
      fetch(`${API}/projects/${project.id}/dev-stop`, { method: 'POST', keepalive: true }).catch(() => {});
    };
  }, [project.id]);

  // Initialize xterm.js terminal
  useEffect(() => {
    let term, fitAddon, ws;
    let mounted = true;

    const initTerminal = async () => {
      const { Terminal } = await import('@xterm/xterm');
      const { FitAddon } = await import('@xterm/addon-fit');
      const { WebLinksAddon } = await import('@xterm/addon-web-links');
      // Import xterm CSS
      await import('@xterm/xterm/css/xterm.css');

      if (!mounted || !terminalRef.current) return;

      term = new Terminal({
        cursorBlink: true,
        fontSize: 13,
        fontFamily: "'Cascadia Code', 'Fira Code', Menlo, monospace",
        theme: {
          background: '#0a0a0c',
          foreground: '#d4d4d8',
          cursor: '#a78bfa',
          selectionBackground: '#6366f140',
          black: '#09090b',
          red: '#f87171',
          green: '#4ade80',
          yellow: '#facc15',
          blue: '#60a5fa',
          magenta: '#c084fc',
          cyan: '#22d3ee',
          white: '#f4f4f5',
        },
        allowProposedApi: true,
      });

      fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.loadAddon(new WebLinksAddon());

      term.open(terminalRef.current);
      fitAddon.fit();
      term.focus();

      // Click to focus
      terminalRef.current.addEventListener('click', () => term.focus());

      termRef.current = term;
      fitAddonRef.current = fitAddon;

      // Connect WebSocket to backend terminal
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${wsProtocol}//${window.location.host}/terminal/${project.id}?cmd=claude&cwd=${encodeURIComponent(project.serverPath || '')}`;

      ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        // Send initial resize
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'data') {
            term.write(msg.data);
          } else if (msg.type === 'exit') {
            term.write('\r\n\x1b[90m[Terminal exited]\x1b[0m\r\n');
          }
        } catch {
          // Raw data
          term.write(event.data);
        }
      };

      ws.onclose = () => {
        term.write('\r\n\x1b[90m[Disconnected]\x1b[0m\r\n');
      };

      // Forward input to backend
      term.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'data', data }));
        }
      });

      // Forward resize events
      term.onResize(({ cols, rows }) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'resize', cols, rows }));
        }
      });
    };

    initTerminal();

    return () => {
      mounted = false;
      if (ws) ws.close();
      if (term) term.dispose();
    };
  }, [project.id, project.serverPath]);

  // Resize terminal on panel resize
  useEffect(() => {
    if (!isResizing && fitAddonRef.current) {
      setTimeout(() => {
        try { fitAddonRef.current.fit(); } catch {}
      }, 100);
    }
  }, [leftWidth, isResizing]);

  // Window resize handler
  useEffect(() => {
    const handleResize = () => {
      if (fitAddonRef.current) {
        try { fitAddonRef.current.fit(); } catch {}
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Resizable panels
  const startResizing = (e) => {
    isResizingRef.current = true;
    setIsResizing(true);
    e.preventDefault();
  };

  useEffect(() => {
    const onMove = (e) => {
      if (!isResizingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      if (pct > 20 && pct < 75) setLeftWidth(pct);
    };
    const onUp = () => {
      isResizingRef.current = false;
      setIsResizing(false);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  // Publish (commit + push)
  const handlePublish = async () => {
    setPublishStatus('publishing');
    try {
      const body = commitMsg.trim() ? { message: commitMsg.trim() } : undefined;
      const res = await fetch(`${API}/projects/${project.id}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      setPublishStatus(data.ok ? 'done' : 'error');
    } catch {
      setPublishStatus('error');
    }
    setCommitMsg('');
    setShowCommitInput(false);
    setTimeout(() => setPublishStatus(null), 4000);
  };

  // Refresh preview
  const refreshPreview = () => {
    if (previewIframeRef.current) {
      previewIframeRef.current.src = previewIframeRef.current.src;
    }
  };

  // Upload
  const handleUpload = async (files) => {
    if (!files?.length || !project?.id) return;
    setIsUploading(true);
    try {
      const form = new FormData();
      Array.from(files).forEach(f => form.append('files', f));
      const res = await fetch(`${API}/projects/${project.id}/upload`, {
        method: 'POST',
        body: form,
      });
      const data = await res.json();
      if (data.ok) {
        const newFiles = Array.from(files).map(f => ({
          name: f.name,
          path: `${project.serverPath}/_docs/${f.name}`,
          type: f.type.startsWith('image/') ? 'image' : 'doc',
        }));
        setUploadedFiles(prev => [...newFiles, ...prev]);
        if (newFiles[0]) copyPath(newFiles[0].path);
      }
    } catch {}
    setIsUploading(false);
  };

  const copyPath = (path) => {
    navigator.clipboard.writeText(path).catch(() => {});
    setCopiedPath(path);
    setTimeout(() => setCopiedPath(null), 2000);
  };

  // Kill port to free it up
  const [killingPort, setKillingPort] = useState(false);
  const handleKillPort = async () => {
    if (!devPort) return;
    setKillingPort(true);
    try {
      await fetch(`${API}/kill-port/${devPort}`, { method: 'POST' });
    } catch {}
    setKillingPort(false);
  };

  const vp = VIEWPORTS.find(v => v.id === viewport) || VIEWPORTS[0];

  return (
    <div
      ref={containerRef}
      className={`h-screen w-full bg-[#09090b] text-zinc-300 flex overflow-hidden font-sans ${isResizing ? 'cursor-col-resize select-none' : ''}`}
    >
      {/* Iframe overlay during resize */}
      {isResizing && <div className="fixed inset-0 z-50 cursor-col-resize" />}

      {/* BACK BUTTON */}
      <div className="w-[40px] border-r border-[#27272a] flex flex-col items-center pt-4 bg-[#09090b] z-20 shrink-0">
        <button
          onClick={onBack}
          className="w-8 h-8 flex items-center justify-center rounded-xl text-zinc-600 hover:text-white hover:bg-[#18181b] transition-all"
          title="Nazad na Dashboard"
        >
          <ArrowLeft size={16} />
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">

        {/* LEFT PANEL — xterm.js Terminal */}
        <div style={{ width: `${leftWidth}%` }} className="flex flex-col bg-[#0a0a0c] border-r border-[#1a1a1c] min-w-0">

          <header className="h-11 border-b border-[#27272a] flex items-center px-4 justify-between shrink-0 bg-[#0a0a0c]">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]" />
              <span className="text-[10px] font-bold tracking-[0.15em] text-zinc-500 uppercase">Claude Agent</span>
            </div>
            <span className="text-[10px] text-zinc-600 font-mono">{project?.name}</span>
          </header>

          {/* Terminal container */}
          <div ref={terminalRef} className="flex-1 overflow-hidden" />

          {/* Upload toolbar */}
          <div className="border-t border-[#27272a] bg-[#0a0a0c] shrink-0">
            {uploadedFiles.length > 0 && (
              <div className="px-3 pt-2 pb-1 flex flex-wrap gap-1.5">
                {uploadedFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-1.5 bg-[#18181b] border border-[#27272a] rounded-lg px-2 py-1 text-[10px] group">
                    {f.type === 'image'
                      ? <Image size={10} className="text-indigo-400 shrink-0" />
                      : <FileText size={10} className="text-amber-400 shrink-0" />}
                    <span className="text-zinc-400 max-w-[120px] truncate font-mono">{f.name}</span>
                    <button
                      onClick={() => copyPath(f.path)}
                      className={`transition-colors ${copiedPath === f.path ? 'text-emerald-400' : 'text-zinc-600 hover:text-zinc-300'}`}
                    >
                      {copiedPath === f.path ? <CheckCircle2 size={10} /> : <Copy size={10} />}
                    </button>
                    <button onClick={() => setUploadedFiles(prev => prev.filter((_, j) => j !== i))} className="text-zinc-700 hover:text-red-400 transition-colors">
                      <X size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="px-3 py-2 flex items-center gap-2">
              <span className="text-[10px] text-zinc-700 uppercase tracking-wider mr-1">Pošalji Claudeu:</span>
              <input ref={imgInputRef} type="file" accept="image/*" multiple className="hidden"
                onChange={e => { handleUpload(e.target.files); e.target.value = ''; }} />
              <button onClick={() => imgInputRef.current?.click()} disabled={isUploading}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#18181b] hover:bg-[#27272a] border border-[#27272a] hover:border-indigo-500/40 rounded-lg text-[10px] text-zinc-400 hover:text-indigo-400 transition-all disabled:opacity-50"
              >
                <Image size={12} /> Slika
              </button>
              <input ref={docInputRef} type="file" accept=".pdf,.txt,.md,.csv,.json,.doc,.docx" multiple className="hidden"
                onChange={e => { handleUpload(e.target.files); e.target.value = ''; }} />
              <button onClick={() => docInputRef.current?.click()} disabled={isUploading}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#18181b] hover:bg-[#27272a] border border-[#27272a] hover:border-amber-500/40 rounded-lg text-[10px] text-zinc-400 hover:text-amber-400 transition-all disabled:opacity-50"
              >
                <FileText size={12} /> Dokument
              </button>
              <button
                onClick={() => {
                  if (wsRef.current?.readyState === WebSocket.OPEN) {
                    const licensePrompt = `Implementiraj IMPULSE licenciranje u ovaj projekat. API dokumentacija:\n\nENDPOINT: POST https://app.impulsee.dev/api/license/verify\nBODY: { "key": "LICENCE_KEY" }\nRESPONSE: { "valid": true/false, "plan": "monthly|yearly", "expiresAt": "ISO date", "daysLeft": number, "reason": "expired|suspended|invalid" }\n\nPRAVILA:\n- Na startu aplikacije pozovi verify endpoint\n- Ako valid=false, prikaži korisniku poruku da je licenca istekla/nevalidna i blokiraj pristup admin panelu\n- Ako fetch fails (offline/timeout 5s), nastavi normalno - ne blokiraj\n- Provjeru radi jednom na startu servera ili pri prvom pristupu admin ruti\n- Licence key čuvaj u environment varijabli IMPULSE_LICENSE_KEY\n- Dodaj middleware koji provjerava licence status prije admin ruta\n\nNapravi implementaciju sada.\n`;
                    wsRef.current.send(JSON.stringify({ type: 'data', data: licensePrompt }));
                  }
                }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#18181b] hover:bg-[#27272a] border border-[#27272a] hover:border-purple-500/40 rounded-lg text-[10px] text-zinc-400 hover:text-purple-400 transition-all"
                title="Pošalji API docs za licenciranje u Claude terminal"
              >
                <Shield size={12} /> Licenca
              </button>
              {isUploading && <Loader2 size={12} className="animate-spin text-zinc-500" />}
              {copiedPath && (
                <span className="text-[10px] text-emerald-400 flex items-center gap-1 ml-1">
                  <CheckCircle2 size={10} /> Putanja kopirana
                </span>
              )}
            </div>
          </div>
        </div>

        {/* DRAG HANDLE */}
        <div
          onMouseDown={startResizing}
          className={`w-[3px] h-full cursor-col-resize shrink-0 relative transition-colors
            ${isResizing ? 'bg-indigo-500' : 'bg-[#1a1a1c] hover:bg-indigo-500/40'}`}
        />

        {/* RIGHT PANEL — Browser Preview */}
        <div style={{ width: `${100 - leftWidth}%` }} className="bg-[#0c0c0e] flex flex-col min-w-0">

          <header className="h-11 border-b border-[#27272a] flex items-center px-4 gap-3 shrink-0 bg-[#09090b]">
            <div className="flex gap-1.5 text-zinc-600 shrink-0">
              <button onClick={refreshPreview} className="p-1.5 hover:text-white hover:bg-[#18181b] rounded-lg transition-all">
                <RefreshCw size={14} />
              </button>
            </div>

            {/* URL bar */}
            <form
              className="flex-1 bg-[#18181b] border border-[#27272a] rounded-xl px-3 py-1.5 flex items-center gap-2 focus-within:border-indigo-500/50 transition-colors min-w-0"
              onSubmit={e => { e.preventDefault(); setPreviewUrl(urlInput); }}
            >
              <input
                value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
                className="flex-1 bg-transparent text-[12px] text-zinc-300 focus:outline-none min-w-0 font-mono"
                placeholder="http://localhost:5173"
              />
              {previewUrl && (
                <a href={previewUrl} target="_blank" rel="noreferrer" className="text-zinc-700 hover:text-zinc-400 transition-colors shrink-0">
                  <ExternalLink size={12} />
                </a>
              )}
            </form>

            {/* Viewport switcher */}
            <div className="flex bg-[#18181b] rounded-xl p-1 border border-[#27272a] gap-0.5 shrink-0">
              {VIEWPORTS.map(v => (
                <button
                  key={v.id}
                  onClick={() => setViewport(v.id)}
                  className={`p-1.5 rounded-lg transition-all ${viewport === v.id ? 'bg-[#27272a] text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                  title={v.label}
                >
                  <v.icon size={14} />
                </button>
              ))}
            </div>

            {/* Publish button */}
            <div className="flex items-center gap-1.5 shrink-0">
              {showCommitInput && (
                <input
                  value={commitMsg}
                  onChange={e => setCommitMsg(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handlePublish(); if (e.key === 'Escape') setShowCommitInput(false); }}
                  placeholder="Commit poruka..."
                  className="bg-[#18181b] border border-[#27272a] rounded-lg px-2 py-1 text-[11px] text-zinc-300 focus:outline-none focus:border-indigo-500/50 w-48 font-mono"
                  autoFocus
                />
              )}
              <button
                onClick={() => {
                  if (!showCommitInput) { setShowCommitInput(true); return; }
                  handlePublish();
                }}
                disabled={publishStatus === 'publishing'}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all shadow-lg
                  ${publishStatus === 'publishing' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 cursor-wait' :
                    publishStatus === 'done' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                    publishStatus === 'error' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                    'bg-white text-black hover:bg-zinc-200 cursor-pointer'}`}
              >
                {publishStatus === 'publishing' ? <><Loader2 size={12} className="animate-spin" /> Publishing...</> :
                 publishStatus === 'done' ? <><CheckCircle2 size={12} /> Published!</> :
                 publishStatus === 'error' ? <><AlertCircle size={12} /> Greška</> :
                 <><Sparkles size={12} /> Publish</>}
              </button>
            </div>
          </header>

          {/* Preview canvas */}
          <div className="flex-1 overflow-auto bg-[#09090b] flex items-start justify-center p-3">
            {devLoading ? (
              <div className="flex-1 flex flex-col items-center justify-center text-zinc-700 h-full gap-3">
                <Loader2 size={32} className="animate-spin opacity-30" />
                <p className="text-sm">Pokrećem dev server...</p>
              </div>
            ) : previewUrl ? (
              <div
                className="h-full transition-all duration-300 rounded-xl overflow-hidden border border-[#27272a] shadow-2xl"
                style={{ width: vp.width, minWidth: viewport === 'desktop' ? undefined : vp.width, maxWidth: vp.width }}
              >
                <iframe
                  ref={previewIframeRef}
                  src={previewUrl}
                  className="w-full h-full border-0 bg-white"
                  title="Dev Preview"
                />
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-zinc-700 h-full gap-3">
                <Monitor size={40} className="opacity-20" />
                <p className="text-sm">Dev server nije pokrenut</p>
              </div>
            )}
          </div>

          {/* Status bar */}
          <footer className="h-7 border-t border-[#27272a] flex items-center justify-between px-4 bg-[#09090b] shrink-0">
            <div className="flex gap-4 items-center text-[10px] text-zinc-600">
              {devPort && (
                <span>Dev: <span className="text-emerald-400">localhost:{devPort}</span></span>
              )}
              {devPort && (
                <button
                  onClick={handleKillPort}
                  disabled={killingPort}
                  className="flex items-center gap-1 text-zinc-700 hover:text-red-400 transition-colors disabled:opacity-50"
                  title={`Oslobodi port ${devPort}`}
                >
                  <Trash2 size={10} />
                  <span>{killingPort ? 'Ubijam...' : 'Kill port'}</span>
                </button>
              )}
              {project?.github && (
                <span className="text-zinc-700">{project.github.split('/').slice(-2).join('/')}</span>
              )}
            </div>
            <div className="flex gap-3 text-[10px] text-zinc-700 uppercase tracking-widest">
              <span>{vp.label}</span>
              {project?.tech?.[0] && <span className="text-indigo-500">{project.tech[0]}</span>}
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
