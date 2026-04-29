import { createClient } from '@supabase/supabase-js'
import { useState, useEffect, useCallback } from "react";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ─────────────────────────────────────────────
//  CONFIG & HELPERS
// ─────────────────────────────────────────────
const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "admin123";
const CODE_PIN = "1234"; 
const SESSION_KEY = "dm_session";
const CHECKLIST_RESET_KEY = "dm_checklist_reset";

const getSession = () => {
  const raw = sessionStorage.getItem(SESSION_KEY);
  return raw ? JSON.parse(raw) : null;
};

const getToday = () => {
  const d = new Date();
  return d.getFullYear() + "-" +
    String(d.getMonth() + 1).padStart(2, "0") + "-" +
    String(d.getDate()).padStart(2, "0");
};
const fmtTime = () => new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

const I = {
  Home: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  Users: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>,
  Check: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  Note: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3z"/><path d="M15 3v6h6"/><path d="M9 18h6"/><path d="M9 14h6"/></svg>,
  Phone: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.81 12.81 0 0 0 .62 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.62A2 2 0 0 1 22 16.92z"/></svg>,
  Download: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  Key: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="7.5" cy="15.5" r="5.5"/><path d="M21 2l-9.6 9.6"/><path d="M15.5 7.5l3 3L22 7l-3-3"/></svg>,
  LogOut: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  Trash: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>,
  Plus: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
};

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=DM+Serif+Display&display=swap');
:root{--bg:#f4f4f2;--surface:#fff;--border:#e4e4e1;--text:#1a1a18;--muted:#8a8a85;--accent:#1e1e1e;--red:#b91c1c;--sh:0 4px 12px rgba(0,0,0,0.05);}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'DM Sans',sans-serif;background:var(--bg);color:var(--text)}
.app{max-width:480px;margin:0 auto;min-height:100vh;display:flex;flex-direction:column}
.header{background:var(--surface);padding:16px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:100}
.header h1{font-family:'DM Serif Display',serif;font-size:20px}
.nav{display:flex;overflow-x:auto;gap:4px;padding:8px;background:var(--surface);border-bottom:1px solid var(--border);scrollbar-width:none}
.nav-btn{display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 12px;border:none;background:none;font-size:10px;font-weight:600;color:var(--muted);cursor:pointer;min-width:70px}
.nav-btn.active{color:var(--accent)}
.content{padding:16px;flex:1}
.card{background:var(--surface);border-radius:12px;padding:16px;margin-bottom:12px;box-shadow:var(--sh);border:1px solid var(--border)}
.card h3{font-family:'DM Serif Display',serif;margin-bottom:12px;font-size:18px}
.input{width:100%;padding:10px;margin-bottom:8px;border:1px solid var(--border);border-radius:8px;font-family:inherit}
.btn{padding:10px 16px;border-radius:8px;border:none;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:8px;font-size:14px;justify-content:center}
.btn-primary{background:var(--accent);color:white;width:100%}
.ov-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px}
.ov-tile{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px}
.ov-label{font-size:10px;color:var(--muted);text-transform:uppercase}
.ov-val{font-size:24px;font-weight:700}
.sub-nav{display:flex;gap:10px;margin-bottom:15px;overflow-x:auto}
.sub-btn{padding:6px 12px;background:var(--border);border-radius:20px;font-size:12px;border:none;cursor:pointer;white-space:nowrap}
.sub-btn.active{background:var(--accent);color:white}
.item-row{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border)}
.si-entry{display:flex;align-items:center;justify-content:space-between;padding:10px;background:#f9f9f7;border-radius:8px;margin-bottom:8px}
.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:1000;padding:20px}
`;

export default function DutyManagerApp() {
  const [session, setSession] = useState(getSession);
  const [tab, setTab] = useState("home");
  const [checklistTab, setChecklistTab] = useState("daily");
  
  const [signInHistory, setSignInHistory] = useState([]);
  const [noteHistory, setNoteHistory] = useState([]);
  const [codes, setCodes] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [checklists, setChecklists] = useState({ daily: [], bar: [], fire: [] });
  
  const [siName, setSiName] = useState("");
  const [siRole, setSiRole] = useState("");
  const [noteText, setNoteText] = useState("");
  const [taskInput, setTaskInput] = useState("");
  const [contactForm, setContactForm] = useState({ name: '', phone: '' });
  const [codeForm, setCodeForm] = useState({ label: '', code: '' });
  const [codesUnlocked, setCodesUnlocked] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [showReports, setShowReports] = useState(false);
  const [creds, setCreds] = useState({ user: '', pass: '' });
  const [editChecklist, setEditChecklist] = useState({ id: null, text: '', type: 'daily' });

  const isAdmin = session?.role === "admin";

  const fetchData = useCallback(async () => {
    // Fetch today's attendance records
    const today = getToday();

    const lastReset = localStorage.getItem(CHECKLIST_RESET_KEY);
    if (lastReset !== today) {
      const { error: resetError } = await supabase.from('checklists').update({ done: false }).neq('done', false);
      if (resetError) {
        console.error("Checklist Reset Error:", resetError.message);
      } else {
        localStorage.setItem(CHECKLIST_RESET_KEY, today);
      }
    }

    const { data: p, error: pError } = await supabase
      .from('profiles')
      .select('*')
      .eq('date', today)
      .order('id', { ascending: false });

    if (pError) {
      console.error("Profile Fetch Error:", pError.message);
      setSignInHistory([]);
    }

    const { data: n, error: nError } = await supabase.from('notes').select('*').order('id', { ascending: false });
    const { data: cd, error: cdError } = await supabase.from('secure_codes').select('*').order('label');
    const { data: cl, error: clError } = await supabase.from('checklists').select('*');
    const { data: ct, error: ctError } = await supabase.from('contacts').select('*').order('name');

    if (nError) console.error("Notes Fetch Error:", nError.message);
    if (cdError) console.error("Codes Fetch Error:", cdError.message);
    if (clError) console.error("Checklists Fetch Error:", clError.message);
    if (ctError) console.error("Contacts Fetch Error:", ctError.message);

    if (p) setSignInHistory(p);
    if (n) setNoteHistory(n);
    if (cd) setCodes(cd);
    if (ct) setContacts(ct);
    if (cl) {
      const sorted = { daily: [], bar: [], fire: [] };
      cl.forEach(t => { if(sorted[t.type]) sorted[t.type].push(t); });
      setChecklists(sorted);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleExport = async (days) => {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase.from('profiles').select('*').gt('created_at', cutoff).order('created_at', { ascending: false });
    if (!data?.length) return alert("No data.");
    const headers = ["Date", "Name", "Role", "In", "Out"];
    const csv = [headers, ...data.map(s => [new Date(s.created_at).toLocaleDateString(), s.name, s.role, s.sign_in, s.sign_out || "Active"])].map(e => e.join(",")).join("\n");
    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Report_${days}d.csv`;
    link.click();
    setShowReports(false);
  };

  const handleSignIn = async () => {
  if (!siName.trim()) return;

  const today = getToday();

  // Prevent duplicate active sign-in on the same day
  const { data: existing, error: existingError } = await supabase
    .from('profiles')
    .select('id, sign_out')
    .eq('name', siName)
    .eq('date', today)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    alert("Sign In Error: " + existingError.message);
    return;
  }

  if (existing && !existing.sign_out) {
    alert("Already signed in today");
    return;
  }

  const { error } = await supabase.from('profiles').insert([{
    name: siName,
    role: siRole || "Staff",
    date: today,
    sign_in: fmtTime()
  }]);

  if (error) {
    alert("Sign In Error: " + error.message);
  } else {
    setSiName("");
    setSiRole("");
    fetchData();
  }
};

  const handleSignOut = async (id) => {
    const { error } = await supabase.from('profiles').update({ sign_out: fmtTime() }).eq('id', id);
    if (error) {
        alert("Sign Out Error: " + error.message);
    } else {
        fetchData();
    }
  };

  const saveChecklistEdit = async () => {
    if (!editChecklist.text.trim()) return;
    const { error } = await supabase.from('checklists').update({
      text: editChecklist.text.trim(),
      type: editChecklist.type
    }).eq('id', editChecklist.id);

    if (error) {
      alert("Checklist Update Error: " + error.message);
    } else {
      setEditChecklist({ id: null, text: '', type: 'daily' });
      fetchData();
    }
  };

  const deleteItem = async (table, id) => {
    if (confirm("Delete this item?")) {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) alert("Delete error: " + error.message);
      fetchData();
    }
  };

  return (
    <div className="app">
      <style>{CSS}</style>
      <header className="header">
        <h1>Duty Manager</h1>
        <button className="btn" style={{fontSize:'11px'}} onClick={() => isAdmin ? (sessionStorage.clear(), setSession(null)) : setShowLogin(true)}>
          {isAdmin ? 'Logout' : 'Admin'}
        </button>
      </header>

      <nav className="nav">
        <button className={`nav-btn ${tab==='home'?'active':''}`} onClick={()=>setTab('home')}><I.Home/>Home</button>
        <button className={`nav-btn ${tab==='signin'?'active':''}`} onClick={()=>setTab('signin')}><I.Users/>Sign In</button>
        <button className={`nav-btn ${tab==='checklists'?'active':''}`} onClick={()=>setTab('checklists')}><I.Check/>Tasks</button>
        <button className={`nav-btn ${tab==='notes'?'active':''}`} onClick={()=>setTab('notes')}><I.Note/>Handover</button>
        <button className={`nav-btn ${tab==='contacts'?'active':''}`} onClick={()=>setTab('contacts')}><I.Phone/>Contacts</button>
        <button className={`nav-btn ${tab==='codes'?'active':''}`} onClick={()=>setTab('codes')}><I.Key/>Codes</button>
      </nav>

      <div className="content">
        {tab === 'home' && (
          <>
            <div className="ov-grid">
              <div className="ov-tile"><div className="ov-label">On Duty</div><div className="ov-val">{signInHistory.filter(s => !s.sign_out).length}</div></div>
              <div className="ov-tile"><div className="ov-label">Daily Progress</div><div className="ov-val">{Math.round((checklists.daily.filter(i => i.done).length / (checklists.daily.length || 1)) * 100)}%</div></div>
            </div>
            {isAdmin && (
              <div className="card">
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'15px'}}>
                   <h3>Admin Panel</h3>
                   <button onClick={()=>setShowReports(true)} className="btn" style={{background:'#eee', padding:'6px 12px'}}><I.Download/> Exports</button>
                </div>
                <div className="ov-grid">
                  <div className="ov-tile"><div className="ov-label">24h Entries</div><div className="ov-val">{signInHistory.length}</div></div>
                  <div className="ov-tile"><div className="ov-label">Notes</div><div className="ov-val">{noteHistory.length}</div></div>
                </div>
              </div>
            )}
          </>
        )}

        {tab === 'signin' && (
          <div className="card">
            <h3>Staff Attendance</h3>
            <input className="input" placeholder="Full Name" value={siName} onChange={e=>setSiName(e.target.value)} />
            <input className="input" placeholder="Role/Position" value={siRole} onChange={e=>setSiRole(e.target.value)} />
            <button className="btn btn-primary" onClick={handleSignIn}>Sign In</button>
            <div style={{marginTop:'20px'}}>
              {signInHistory.map(s => (
                <div key={s.id} className="si-entry">
                  <div>
                    <div style={{fontWeight:'bold'}}>{s.name} <small style={{color:'var(--muted)'}}>{s.role}</small></div>
                    <div style={{fontSize:'12px', color:'var(--muted)'}}>In: {s.sign_in} {s.sign_out && `| Out: ${s.sign_out}`}</div>
                  </div>
                  {!s.sign_out && <button onClick={() => handleSignOut(s.id)} className="btn"><I.LogOut/></button>}
                  {isAdmin && <button onClick={()=>deleteItem('profiles', s.id)} style={{color:'red', border:'none', background:'none', marginLeft:'10px'}}><I.Trash/></button>}
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'checklists' && (
          <div className="card">
            <div className="sub-nav">
              <button className={`sub-btn ${checklistTab==='daily'?'active':''}`} onClick={()=>setChecklistTab('daily')}>Daily</button>
              <button className={`sub-btn ${checklistTab==='bar'?'active':''}`} onClick={()=>setChecklistTab('bar')}>Bar</button>
              <button className={`sub-btn ${checklistTab==='fire'?'active':''}`} onClick={()=>setChecklistTab('fire')}>Fire</button>
            </div>
            {isAdmin && (
              <div style={{display:'flex', gap:'8px', marginBottom:'15px'}}>
                <input className="input" placeholder="New master task..." value={taskInput} onChange={e=>setTaskInput(e.target.value)} />
                <button className="btn btn-primary" style={{width:'auto'}} onClick={async()=>{
                  if(!taskInput.trim())return;
                  await supabase.from('checklists').insert([{text:taskInput, type:checklistTab, done:false}]);
                  setTaskInput(""); fetchData();
                }}><I.Plus/></button>
              </div>
            )}
            {(checklists[checklistTab] || []).map(t => (
              <div key={t.id} className="item-row">
                 <div onClick={async()=>{await supabase.from('checklists').update({done:!t.done}).eq('id',t.id); fetchData();}} style={{display:'flex', gap:'10px', alignItems:'center', flex:1, cursor:'pointer'}}>
                    <div style={{width:'20px', height:'20px', border:'2px solid var(--border)', borderRadius:'4px', background:t.done?'var(--accent)':'none', color:'white', display:'flex', alignItems:'center', justifyContent:'center'}}>
                      {t.done && '✓'}
                    </div>
                    {editChecklist.id === t.id ? (
                      <input
                        className="input"
                        value={editChecklist.text}
                        onChange={e => setEditChecklist({...editChecklist, text: e.target.value})}
                        onClick={e => e.stopPropagation()}
                        style={{flex:1, margin:0, padding:'8px'}}
                      />
                    ) : (
                      <span style={{textDecoration: t.done?'line-through':'none'}}>{t.text}</span>
                    )}
                 </div>
                 <div style={{display:'flex', gap:'8px', alignItems:'center'}}>
                   {isAdmin && editChecklist.id === t.id ? (
                     <>
                       <select
                         value={editChecklist.type}
                         onChange={e => setEditChecklist({...editChecklist, type: e.target.value})}
                         style={{padding:'6px 8px', borderRadius:'8px', border:'1px solid var(--border)'}}
                       >
                         <option value="daily">Daily</option>
                         <option value="bar">Bar</option>
                         <option value="fire">Fire</option>
                       </select>
                       <button
                         onClick={async (e) => { e.stopPropagation(); await saveChecklistEdit(); }}
                         className="btn"
                         style={{padding:'6px 10px'}}
                       >Save</button>
                       <button
                         onClick={(e) => { e.stopPropagation(); setEditChecklist({ id: null, text: '', type: 'daily' }); }}
                         className="btn"
                         style={{padding:'6px 10px', background:'#eee'}}
                       >Cancel</button>
                     </>
                   ) : isAdmin ? (
                     <>
                       <button
                         onClick={(e) => { e.stopPropagation(); setEditChecklist({ id: t.id, text: t.text, type: t.type || checklistTab }); }}
                         className="btn"
                         style={{padding:'6px 10px'}}
                       >Edit</button>
                       <button
                         onClick={(e) => { e.stopPropagation(); deleteItem('checklists', t.id); }}
                         style={{color:'red', border:'none', background:'none'}}
                       ><I.Trash/></button>
                     </>
                   ) : null}
                 </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'notes' && (
          <div>
            <div className="card">
              <h3>Handover & Issues</h3>
              <textarea className="input" placeholder="Notes for next shift..." value={noteText} onChange={e=>setNoteText(e.target.value)} style={{height:'80px'}} />
              <button className="btn btn-primary" onClick={async()=>{
                 if(!noteText.trim())return;
                 await supabase.from('notes').insert([{text:noteText, author: isAdmin?'Admin':'Staff', timestamp:fmtTime()}]);
                 setNoteText(""); fetchData();
              }}>Post Note</button>
            </div>
            {noteHistory.map(n => (
              <div key={n.id} className="card">
                <div style={{display:'flex', justifyContent:'space-between'}}>
                  <p>{n.text}</p>
                  {isAdmin && <button onClick={()=>deleteItem('notes', n.id)} style={{color:'red', border:'none', background:'none'}}><I.Trash/></button>}
                </div>
                <div style={{fontSize:'11px', color:'var(--muted)', marginTop:'8px'}}>{n.author} @ {n.timestamp}</div>
              </div>
            ))}
          </div>
        )}

        {tab === 'contacts' && (
          <div className="card">
            <h3>Directory</h3>
            {isAdmin && (
               <div style={{marginBottom:'15px', paddingBottom:'15px', borderBottom:'1px dashed var(--border)'}}>
                  <input className="input" placeholder="Name" value={contactForm.name} onChange={e=>setContactForm({...contactForm, name:e.target.value})} />
                  <input className="input" placeholder="Phone" value={contactForm.phone} onChange={e=>setContactForm({...contactForm, phone:e.target.value})} />
                  <button className="btn btn-primary" onClick={async()=>{
                    if(!contactForm.name) return;
                    await supabase.from('contacts').insert([contactForm]); setContactForm({name:'', phone:''}); fetchData();
                  }}>Add Contact</button>
               </div>
            )}
            {contacts.map(c => (
              <div key={c.id} className="item-row">
                <div><div style={{fontWeight:'bold'}}>{c.name}</div><div style={{color:'var(--muted)'}}>{c.phone}</div></div>
                <div style={{display:'flex', gap:'8px'}}>
                  <a href={`tel:${c.phone}`} className="btn" style={{background:'#eef2ff', color:'#4338ca', padding:'6px 12px'}}>Call</a>
                  {isAdmin && <button onClick={()=>deleteItem('contacts', c.id)} style={{color:'red', border:'none', background:'none'}}><I.Trash/></button>}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'codes' && (
          <div className="card">
            <h3>Secure Codes</h3>
            {isAdmin && (
               <div style={{marginBottom:'15px', paddingBottom:'15px', borderBottom:'1px dashed var(--border)'}}>
                  <input className="input" placeholder="Label (e.g. Alarm)" value={codeForm.label} onChange={e=>setCodeForm({...codeForm, label:e.target.value})} />
                  <input className="input" placeholder="Code" value={codeForm.code} onChange={e=>setCodeForm({...codeForm, code:e.target.value})} />
                  <button className="btn btn-primary" onClick={async()=>{
                    if(!codeForm.label) return;
                    await supabase.from('secure_codes').insert([codeForm]); setCodeForm({label:'', code:''}); fetchData();
                  }}>Add Code</button>
               </div>
            )}
            {!codesUnlocked && !isAdmin ? (
              <input className="input" type="password" placeholder="Enter PIN" onChange={e => e.target.value === CODE_PIN && setCodesUnlocked(true)} />
            ) : (
              codes.map(c => (
                <div key={c.id} className="item-row">
                  <span>{c.label}</span>
                  <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                    <span style={{fontWeight:'bold', color:'var(--red)'}}>{c.code}</span>
                    {isAdmin && <button onClick={()=>deleteItem('secure_codes', c.id)} style={{color:'red', border:'none', background:'none'}}><I.Trash/></button>}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {showReports && (
        <div className="modal-overlay" onClick={()=>setShowReports(false)}>
          <div className="card" style={{width:'100%', maxWidth:'320px'}} onClick={e=>e.stopPropagation()}>
            <h3>Export Reports</h3>
            <button className="btn btn-primary" style={{marginBottom:'10px'}} onClick={()=>handleExport(1)}>Last 24 Hours</button>
            <button className="btn btn-primary" style={{marginBottom:'10px'}} onClick={()=>handleExport(7)}>Weekly (7d)</button>
            <button className="btn btn-primary" style={{marginBottom:'15px'}} onClick={()=>handleExport(30)}>Monthly (30d)</button>
            <button className="btn" style={{width:'100%'}} onClick={()=>setShowReports(false)}>Close</button>
          </div>
        </div>
      )}

      {showLogin && (
        <div className="modal-overlay">
          <div className="card" style={{width:'300px'}}>
            <h3>Admin Login</h3>
            <input className="input" placeholder="User" onChange={e=>setCreds({...creds, user:e.target.value})} />
            <input className="input" type="password" placeholder="Pass" onChange={e=>setCreds({...creds, pass:e.target.value})} />
            <button className="btn btn-primary" onClick={() => {
              if(creds.user === ADMIN_USERNAME && creds.pass === ADMIN_PASSWORD) {
                const s = {role:'admin'}; sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)); setSession(s); setShowLogin(false);
              } else { alert("Invalid credentials"); }
            }}>Login</button>
            <button className="btn" style={{width:'100%', marginTop:'5px'}} onClick={()=>setShowLogin(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}