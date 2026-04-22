import { createClient } from '@supabase/supabase-js'
import { useState, useEffect, useCallback } from "react";

// Initialize Supabase client
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ─────────────────────────────────────────────
//  SECURITY & SESSION UTILITIES
// ─────────────────────────────────────────────
const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "admin123";
const SESSION_KEY = "dm_session";
const SESSION_DURATION = 8 * 60 * 60 * 1000;

function createSession(role, displayName) {
  const token = Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, "0")).join("");
  const session = { token, role, displayName, expires: Date.now() + SESSION_DURATION, created: Date.now() };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

function getSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (Date.now() > session.expires) { sessionStorage.removeItem(SESSION_KEY); return null; }
    return session;
  } catch { return null; }
}

function clearSession() { sessionStorage.removeItem(SESSION_KEY); }

// ─────────────────────────────────────────────
//  DATE HELPERS
// ─────────────────────────────────────────────
const todayKey = () => new Date().toISOString().split("T")[0];
const fmtTime = () => new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const fmtDateTime = () => new Date().toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const isoNow = () => new Date().toISOString();

// ─────────────────────────────────────────────
//  ICONS & STYLES (Omitted for brevity in this block, but included in final file)
// ─────────────────────────────────────────────
const I = {
  Lock: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
  Home: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  Users: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  Check: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  Beer: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 11h1a3 3 0 0 1 0 6h-1"/><path d="M9 12v6"/><path d="M13 12v6"/><path d="M14 7.5c-1 0-1.44.5-3 .5s-2-.5-3-.5-1.44.5-3 .5"/><path d="M5 8v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8"/><path d="M6 7V5"/><path d="M10 7V4"/><path d="M14 7V5"/></svg>,
  KeyRound: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="7.5" cy="15.5" r="5.5"/><path d="M21 2l-9.6 9.6"/><path d="M15.5 7.5l3 3L22 7l-3-3"/></svg>,
  Note: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  Phone: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.48 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>,
  Fire: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>,
  Download: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  Settings: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  Plus: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Trash: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>,
  Edit: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  LogOut: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  Eye: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  EyeOff: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>,
  Shield: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  History: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.52"/></svg>,
};

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Serif+Display&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#f4f4f2;--surface:#fff;--border:#e4e4e1;
  --text:#1a1a18;--muted:#8a8a85;--accent:#1e1e1e;
  --accent-lt:#efefed;--green:#1d7d4f;--green-lt:#d1fae5;
  --red:#b91c1c;--red-lt:#fee2e2;--amber:#b45309;--amber-lt:#fef3c7;
  --blue:#1d4ed8;--blue-lt:#dbeafe;--admin:#2d1b69;--admin-lt:#ede9fe;
  --r:10px;--sh:0 1px 3px rgba(0,0,0,.07),0 4px 14px rgba(0,0,0,.05);
}
body{font-family:'DM Sans',sans-serif;background:var(--bg);color:var(--text)}
.app{display:flex;flex-direction:column;min-height:100vh;max-width:480px;margin:0 auto}
.header{background:var(--surface);border-bottom:1px solid var(--border);padding:12px 16px;position:sticky;top:0;z-index:100}
.header-row{display:flex;align-items:center;justify-content:space-between}
.header-title{font-family:'DM Serif Display',serif;font-size:18px}
.header-date{font-size:11px;color:var(--muted);margin-top:1px}
.role-pill{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;padding:4px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:.4px}
.role-admin{background:var(--admin-lt);color:var(--admin)}
.logout-btn{background:none;border:none;cursor:pointer;color:var(--muted);display:flex;align-items:center;gap:4px;font-size:12px;padding:4px 8px;border-radius:6px;transition:all .15s}
.logout-btn:hover{background:var(--red-lt);color:var(--red)}
.nav{display:flex;overflow-x:auto;gap:2px;padding:8px 10px;background:var(--surface);border-bottom:1px solid var(--border);scrollbar-width:none}
.nav-btn{display:flex;flex-direction:column;align-items:center;gap:3px;padding:7px 11px;border:none;background:none;cursor:pointer;border-radius:8px;color:var(--muted);font-family:inherit;font-size:10px;font-weight:500;white-space:nowrap;transition:all .15s;flex-shrink:0}
.nav-btn.active{background:var(--accent);color:white}
.nav-btn.admin-tab{color:#7c3aed}
.nav-btn.admin-tab.active{background:var(--admin);color:white}
.content{flex:1;padding:14px}
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:16px;margin-bottom:12px;box-shadow:var(--sh)}
.card-title{font-weight:600;font-size:14px;margin-bottom:12px;display:flex;align-items:center;gap:8px}
.card-icon{width:28px;height:28px;border-radius:7px;background:var(--accent-lt);display:flex;align-items:center;justify-content:center;flex-shrink:0}
.input{width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;font-family:inherit;font-size:14px;background:var(--bg);outline:none}
.field{margin-bottom:10px}
.field label{display:block;font-size:12px;font-weight:600;color:var(--muted);margin-bottom:4px;text-transform:uppercase}
.btn{padding:10px 16px;border-radius:8px;border:none;font-family:inherit;font-weight:500;font-size:13px;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.btn-primary{background:var(--accent);color:white}
.btn-ghost{background:var(--accent-lt);color:var(--text)}
.btn-full{width:100%;justify-content:center}
.cl-item{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border);cursor:pointer}
.cl-box{width:20px;height:20px;border-radius:5px;border:2px solid var(--border);display:flex;align-items:center;justify-content:center;flex-shrink:0;background:white}
.cl-box.done{background:var(--green);border-color:var(--green)}
.cl-text{font-size:13.5px;line-height:1.4;flex:1}
.cl-text.done{text-decoration:line-through;color:var(--muted)}
.progress-bar{height:5px;background:var(--border);border-radius:3px;margin-bottom:12px;overflow:hidden}
.progress-fill{height:100%;background:var(--green);transition:width .3s}
.si-entry{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:var(--bg);border-radius:8px;margin-bottom:6px}
.si-name{font-weight:500;font-size:14px}
.si-meta{font-size:12px;color:var(--muted)}
.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:200;display:flex;align-items:flex-end;justify-content:center}
.modal{background:white;border-radius:16px 16px 0 0;padding:22px;width:100%;max-width:480px;max-height:80vh;overflow-y:auto}
.modal-title{font-family:'DM Serif Display',serif;font-size:18px;margin-bottom:14px}
.row{display:flex;gap:8px;align-items:center}
.sec-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.sec-title{font-family:'DM Serif Display',serif;font-size:20px}
.note-card{padding:12px;background:var(--bg);border-radius:8px;margin-bottom:8px}
.note-text{font-size:14px;line-height:1.5;white-space:pre-wrap}
.note-meta{font-size:11px;color:var(--muted);display:flex;justify-content:space-between}
.ct-entry{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--border)}
.ct-info{flex:1}
.code-row{display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border)}
.code-val{font-size:20px;font-weight:700;letter-spacing:4px}
.ov-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px}
.ov-tile{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:14px}
.ov-label{font-size:10px;color:var(--muted);text-transform:uppercase}
.ov-val{font-size:24px;font-weight:700}
`;

// ─────────────────────────────────────────────
//  MAIN APP
// ─────────────────────────────────────────────
export default function DutyManagerApp() {
  const [session, setSession] = useState(getSession);
  const [tab, setTab] = useState("home");
  
  // Data State
  const [noteHistory, setNoteHistory] = useState([]);
  const [signInHistory, setSignInHistory] = useState([]);
  const [checklists, setChecklists] = useState({ daily: [], bar: [], fire: [] });
  const [codes, setCodes] = useState([]);
  const [contacts, setContacts] = useState([]);
  
  // Local UI State
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [siName, setSiName] = useState("");
  const [noteText, setNoteText] = useState("");
  const [codesUnlocked, setCodesUnlocked] = useState(false);
  const [codePin, setCodePin] = useState("");

  // 1. FETCH DATA FROM SUPABASE
  const fetchData = useCallback(async () => {
    // Notes
    const { data: n } = await supabase.from('notes').select('*').order('id', { ascending: false });
    if (n) setNoteHistory(n);
    
    // Sign-ins (Profiles)
    const { data: p } = await supabase.from('profiles').select('*').order('id', { ascending: false });
    if (p) setSignInHistory(p);

    // Contacts
    const { data: c } = await supabase.from('contacts').select('*');
    if (c) setContacts(c);

    // Codes
    const { data: cd } = await supabase.from('secure_codes').select('*');
    if (cd) setCodes(cd);

    // Checklists (Fetch today's)
    const { data: cl } = await supabase.from('checklists').select('*').eq('date', todayKey());
    if (cl) {
      const formatted = { daily: [], bar: [], fire: [] };
      cl.forEach(item => { formatted[item.type] = item.items || []; });
      setChecklists(formatted);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const isAdmin = session?.role === "admin";
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  // 2. ACTIONS: SAVE TO SUPABASE
  const handleSignIn = async () => {
    if (!siName.trim()) return;
    const entry = { name: siName, role: "Staff", date: new Date().toLocaleDateString("en-GB"), sign_in: fmtTime(), sign_out: null };
    const { error } = await supabase.from('profiles').insert([entry]);
    if (!error) { setSignInHistory(prev => [entry, ...prev]); setSiName(""); }
  };

  const handleSignOut = async (id) => {
    const { error } = await supabase.from('profiles').update({ sign_out: fmtTime() }).eq('id', id);
    if (!error) fetchData();
  };

  const addNote = async () => {
    if (!noteText.trim()) return;
    const note = { text: noteText, author: session?.displayName || "Staff", timestamp: fmtTime(), date: todayKey() };
    const { error } = await supabase.from('notes').insert([note]);
    if (!error) { setNoteHistory(prev => [note, ...prev]); setNoteText(""); }
  };

  const toggleCheck = async (type, itemId) => {
    const updatedItems = checklists[type].map(i => i.id === itemId ? { ...i, done: !i.done } : i);
    const { error } = await supabase.from('checklists').upsert({
      date: todayKey(),
      type: type,
      items: updatedItems,
      completed_count: updatedItems.filter(i => i.done).length,
      total_count: updatedItems.length
    }, { onConflict: 'date,type' });
    if (!error) setChecklists(prev => ({ ...prev, [type]: updatedItems }));
  };

  const handleLogin = () => {
    if (loginUser === ADMIN_USERNAME && loginPass === ADMIN_PASSWORD) {
      const sess = createSession("admin", "Administrator");
      setSession(sess); setShowAdminLogin(false);
    }
  };

  // UI Components (Checklist)
  const ChecklistSection = ({ type, title }) => {
    const items = checklists[type] || [];
    const done = items.filter(i => i.done).length;
    return (
      <div>
        <div className="sec-hdr"><span className="sec-title">{title}</span></div>
        <div className="card">
          <div className="progress-bar"><div className="progress-fill" style={{ width: `${(done / (items.length || 1)) * 100}%` }} /></div>
          {items.map(item => (
            <div key={item.id} className="cl-item" onClick={() => toggleCheck(type, item.id)}>
              <div className={`cl-box ${item.done ? "done" : ""}`}>{item.done && <I.Check />}</div>
              <span className={`cl-text ${item.done ? "done" : ""}`}>{item.text}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <>
      <style>{CSS}</style>
      <div className="app">
        <div className="header">
          <div className="header-row">
            <div><div className="header-title">Duty Manager</div><div className="header-date">{today}</div></div>
            {isAdmin ? <span className="role-pill role-admin"><I.Shield /> Admin</span> : 
            <button className="btn btn-ghost btn-sm" onClick={() => setShowAdminLogin(true)}>Admin Login</button>}
          </div>
        </div>

        <nav className="nav">
          <button className={`nav-btn ${tab === "home" ? "active" : ""}`} onClick={() => setTab("home")}><I.Home />Home</button>
          <button className={`nav-btn ${tab === "signin" ? "active" : ""}`} onClick={() => setTab("signin")}><I.Users />Staff</button>
          <button className={`nav-btn ${tab === "daily" ? "active" : ""}`} onClick={() => setTab("daily")}><I.Check />Daily</button>
          <button className={`nav-btn ${tab === "notes" ? "active" : ""}`} onClick={() => setTab("notes")}><I.Note />Notes</button>
        </nav>

        <div className="content">
          {tab === "home" && (
            <div className="ov-grid">
              <div className="ov-tile"><div className="ov-label">On Duty</div><div className="ov-val">{signInHistory.filter(s => !s.sign_out).length}</div></div>
              <div className="ov-tile"><div className="ov-label">Daily Task</div><div className="ov-val">{Math.round((checklists.daily.filter(i => i.done).length / (checklists.daily.length || 1)) * 100)}%</div></div>
            </div>
          )}

          {tab === "signin" && (
            <div>
              <div className="card">
                <div className="field"><input className="input" placeholder="Name" value={siName} onChange={e => setSiName(e.target.value)} /></div>
                <button className="btn btn-primary btn-full" onClick={handleSignIn}>Sign In</button>
              </div>
              {signInHistory.map(s => (
                <div key={s.id} className="si-entry">
                  <div><div className="si-name">{s.name}</div><div className="si-meta">In: {s.sign_in}</div></div>
                  {!s.sign_out ? <button className="btn btn-primary btn-sm" onClick={() => handleSignOut(s.id)}>Sign Out</button> : <span className="si-meta">Out: {s.sign_out}</span>}
                </div>
              ))}
            </div>
          )}

          {tab === "daily" && <ChecklistSection type="daily" title="Daily Checklist" />}

          {tab === "notes" && (
            <div>
              <div className="card">
                <textarea className="input" placeholder="Add note..." value={noteText} onChange={e => setNoteText(e.target.value)} style={{ height: 80, marginBottom: 10 }} />
                <button className="btn btn-primary btn-full" onClick={addNote}>Post Note</button>
              </div>
              {noteHistory.map(n => (
                <div key={n.id} className="note-card">
                  <div className="note-text">{n.text}</div>
                  <div className="note-meta"><span>{n.author}</span><span>{n.timestamp}</span></div>
                </div>
              ))}
            </div>
          )}
        </div>

        {showAdminLogin && (
          <div className="modal-overlay">
            <div className="modal">
              <div className="modal-title">Admin Login</div>
              <div className="field"><input className="input" placeholder="User" onChange={e => setLoginUser(e.target.value)} /></div>
              <div className="field"><input className="input" type="password" placeholder="Pass" onChange={e => setLoginPass(e.target.value)} /></div>
              <div className="row"><button className="btn btn-primary" onClick={handleLogin}>Login</button><button onClick={() => setShowAdminLogin(false)}>Cancel</button></div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
