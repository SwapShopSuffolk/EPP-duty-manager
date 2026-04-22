import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

import { useState, useEffect, useCallback } from "react";

// ─────────────────────────────────────────────
//  SECURITY UTILITIES
//  SHA-256 hashing for passwords (no plain-text stored)
//  Session tokens with expiry
//  XSS-safe storage via JSON sanitisation
// ─────────────────────────────────────────────
async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

// Admin credentials only — staff have immediate open access (no login required)
// Default admin: username "admin" / password "admin123"
// To change, update ADMIN_PASSWORD below.
const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "admin123";

const SESSION_KEY = "dm_session";
const DATA_KEY = "dm_data_v2";
const SESSION_DURATION = 8 * 60 * 60 * 1000; // 8 hours

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
//  DATA LAYER  (localStorage with 6-month pruning)
// ─────────────────────────────────────────────
const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000;

const DEFAULT_DATA = {
  // Config (admin-editable)
  dailyChecklistTemplate: [
    "Check all entrance doors are secure",
    "Walk all public areas",
    "Check CCTV is operational",
    "Verify first aid kit is stocked",
    "Check fire exits are clear",
    "Review incident log from previous shift",
    "Confirm staff on duty",
    "Check temperature logs",
  ],
  barChecklistTemplate: [
    "Check bar stock levels",
    "Verify fridge temperatures",
    "Clean and sanitise bar surfaces",
    "Check till float is correct",
    "Inspect glassware for chips/cracks",
    "Check optics and measures",
    "Verify ID check policy is displayed",
    "Check draught lines are clean",
  ],
  fireSafetyTemplate: [
    "Locate nearest fire extinguisher",
    "Check fire alarm panel for faults",
    "Confirm assembly point is clear",
    "Check fire door closer mechanisms",
    "Verify emergency lighting is functional",
    "Check fire log book is up to date",
    "Confirm evacuation plan is posted",
  ],
  codeListPin: "1234",
  codes: [
    { id: 1, label: "Lock Box", code: "0000" },
    { id: 2, label: "Bin Store", code: "0000" },
    { id: 3, label: "Safe Code", code: "0000" },
  ],
  contacts: [
    { id: 1, name: "Head Office", number: "01234 567890", role: "Management" },
    { id: 2, name: "On-Call Manager", number: "07700 900000", role: "Emergency" },
    { id: 3, name: "Maintenance", number: "07700 900001", role: "Facilities" },
  ],
  // Daily session state (per-day checklists reset by date)
  checklistSessions: {},   // { "YYYY-MM-DD": { daily: [...], bar: [...], fire: [...] } }
  // Historical records
  signInHistory: [],       // [{ id, name, role, date, signIn, signOut }]
  loginHistory: [],        // [{ timestamp, role, displayName, action }]
  noteHistory: [],         // [{ id, text, author, timestamp, date }]
  checklistHistory: [],    // [{ date, type, completedCount, totalCount, items[] }]
};

function pruneOldData(data) {
  const cutoff = Date.now() - SIX_MONTHS_MS;
  const dateFilter = arr => arr.filter(r => {
    const ts = r.timestamp || r.date || r.signIn;
    return ts && new Date(ts).getTime() > cutoff;
  });
  return {
    ...data,
    signInHistory: dateFilter(data.signInHistory || []),
    loginHistory: dateFilter(data.loginHistory || []),
    noteHistory: dateFilter(data.noteHistory || []),
    checklistHistory: (data.checklistHistory || []).filter(r => new Date(r.date).getTime() > cutoff),
  };
}

function loadData() {
  try {
    const raw = localStorage.getItem(DATA_KEY);
    if (!raw) return { ...DEFAULT_DATA };
    const parsed = JSON.parse(raw);
    return pruneOldData({ ...DEFAULT_DATA, ...parsed });
  } catch { return { ...DEFAULT_DATA }; }
}

function saveData(data) {
  try { localStorage.setItem(DATA_KEY, JSON.stringify(data)); } catch (e) { console.error("Storage error", e); }
}

// ─────────────────────────────────────────────
//  DATE HELPERS
// ─────────────────────────────────────────────
const todayKey = () => new Date().toISOString().split("T")[0];
const fmtDate = (d) => new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
const fmtTime = () => new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const fmtDateTime = () => new Date().toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const isoNow = () => new Date().toISOString();

// Get or initialise today's checklist session
function getTodaySession(data) {
  const key = todayKey();
  if (data.checklistSessions[key]) return data.checklistSessions[key];
  return {
    daily: data.dailyChecklistTemplate.map((t, i) => ({ id: i, text: t, done: false })),
    bar: data.barChecklistTemplate.map((t, i) => ({ id: i, text: t, done: false })),
    fire: data.fireSafetyTemplate.map((t, i) => ({ id: i, text: t, done: false })),
  };
}

// ─────────────────────────────────────────────
//  REPORT GENERATOR
// ─────────────────────────────────────────────
function generateCSV(type, data, from, to) {
  const fromDate = new Date(from);
  const toDate = new Date(to);
  toDate.setHours(23, 59, 59);

  const inRange = (dateStr) => {
    const d = new Date(dateStr);
    return d >= fromDate && d <= toDate;
  };

  let csv = "";
  if (type === "signins") {
    csv = "Date,Name,Role,Sign In,Sign Out,Duration\n";
    const rows = (data.signInHistory || []).filter(r => inRange(r.date));
    rows.forEach(r => {
      const duration = r.signOut ? `${r.signIn} - ${r.signOut}` : "Still signed in";
      csv += `"${r.date}","${r.name}","${r.role || ""}","${r.signIn}","${r.signOut || ""}","${duration}"\n`;
    });
  } else if (type === "checklists") {
    csv = "Date,Type,Completed,Total,Percent\n";
    const rows = (data.checklistHistory || []).filter(r => inRange(r.date));
    rows.forEach(r => {
      const pct = Math.round((r.completedCount / r.totalCount) * 100);
      csv += `"${r.date}","${r.type}","${r.completedCount}","${r.totalCount}","${pct}%"\n`;
    });
  } else if (type === "logins") {
    csv = "Timestamp,User,Role,Action\n";
    const rows = (data.loginHistory || []).filter(r => inRange(r.timestamp));
    rows.forEach(r => {
      csv += `"${r.timestamp}","${r.displayName}","${r.role}","${r.action}"\n`;
    });
  } else if (type === "notes") {
    csv = "Date,Author,Note\n";
    const rows = (data.noteHistory || []).filter(r => inRange(r.date));
    rows.forEach(r => {
      csv += `"${r.timestamp}","${r.author}","${r.text.replace(/"/g, "'").replace(/\n/g, " ")}"\n`;
    });
  }
  return csv;
}

function downloadCSV(csv, filename) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────
//  ICONS
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

// ─────────────────────────────────────────────
//  STYLES
// ─────────────────────────────────────────────
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

/* LOGIN */
.login-wrap{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;background:linear-gradient(160deg,#1e1e1e 0%,#2d1b69 100%)}
.login-card{background:white;border-radius:16px;padding:32px 28px;width:100%;max-width:380px;box-shadow:0 20px 60px rgba(0,0,0,.4)}
.login-logo{display:flex;align-items:center;gap:10px;margin-bottom:28px}
.login-logo-icon{width:42px;height:42px;background:var(--admin);border-radius:10px;display:flex;align-items:center;justify-content:center;color:white}
.login-title{font-family:'DM Serif Display',serif;font-size:22px}
.login-sub{font-size:13px;color:var(--muted);margin-top:2px}
.login-tabs{display:flex;background:var(--bg);border-radius:8px;padding:3px;margin-bottom:20px;gap:3px}
.login-tab{flex:1;padding:8px;border:none;border-radius:6px;font-family:inherit;font-size:13px;font-weight:500;cursor:pointer;background:none;color:var(--muted);transition:all .15s}
.login-tab.active{background:white;color:var(--text);box-shadow:0 1px 4px rgba(0,0,0,.1)}
.login-field{margin-bottom:14px}
.login-field label{display:block;font-size:12px;font-weight:600;color:var(--muted);margin-bottom:5px;text-transform:uppercase;letter-spacing:.5px}
.security-note{background:#f0f0ff;border:1px solid #c7d2fe;border-radius:8px;padding:10px 12px;font-size:12px;color:#3730a3;margin-top:16px;line-height:1.5}

/* HEADER */
.header{background:var(--surface);border-bottom:1px solid var(--border);padding:12px 16px;position:sticky;top:0;z-index:100}
.header-row{display:flex;align-items:center;justify-content:space-between}
.header-title{font-family:'DM Serif Display',serif;font-size:18px}
.header-date{font-size:11px;color:var(--muted);margin-top:1px}
.role-pill{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;padding:4px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:.4px}
.role-admin{background:var(--admin-lt);color:var(--admin)}
.role-staff{background:var(--green-lt);color:var(--green)}
.logout-btn{background:none;border:none;cursor:pointer;color:var(--muted);display:flex;align-items:center;gap:4px;font-size:12px;padding:4px 8px;border-radius:6px;transition:all .15s}
.logout-btn:hover{background:var(--red-lt);color:var(--red)}

/* NAV */
.nav{display:flex;overflow-x:auto;gap:2px;padding:8px 10px;background:var(--surface);border-bottom:1px solid var(--border);scrollbar-width:none}
.nav::-webkit-scrollbar{display:none}
.nav-btn{display:flex;flex-direction:column;align-items:center;gap:3px;padding:7px 11px;border:none;background:none;cursor:pointer;border-radius:8px;color:var(--muted);font-family:inherit;font-size:10px;font-weight:500;white-space:nowrap;transition:all .15s;flex-shrink:0}
.nav-btn:hover{background:var(--accent-lt);color:var(--text)}
.nav-btn.active{background:var(--accent);color:white}
.nav-btn.admin-tab{color:#7c3aed}
.nav-btn.admin-tab.active{background:var(--admin);color:white}

/* CONTENT */
.content{flex:1;padding:14px}

/* CARDS */
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:16px;margin-bottom:12px;box-shadow:var(--sh)}
.card-title{font-weight:600;font-size:14px;margin-bottom:12px;display:flex;align-items:center;gap:8px}
.card-icon{width:28px;height:28px;border-radius:7px;background:var(--accent-lt);display:flex;align-items:center;justify-content:center;flex-shrink:0}

/* INPUTS */
.input{width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;font-family:inherit;font-size:14px;background:var(--bg);transition:border .15s;outline:none}
.input:focus{border-color:var(--accent);background:white}
textarea.input{resize:vertical;min-height:72px}
.field{margin-bottom:10px}
.field label{display:block;font-size:12px;font-weight:600;color:var(--muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.4px}

/* BUTTONS */
.btn{padding:10px 16px;border-radius:8px;border:none;font-family:inherit;font-weight:500;font-size:13px;cursor:pointer;transition:all .15s;display:inline-flex;align-items:center;gap:6px}
.btn-primary{background:var(--accent);color:white}.btn-primary:hover{background:#333}
.btn-admin{background:var(--admin);color:white}.btn-admin:hover{background:#3b2385}
.btn-danger{background:var(--red-lt);color:var(--red);border:1px solid #fecaca}.btn-danger:hover{background:#fee2e2}
.btn-ghost{background:var(--accent-lt);color:var(--text)}.btn-ghost:hover{background:var(--border)}
.btn-green{background:var(--green-lt);color:var(--green)}.btn-green:hover{background:#a7f3d0}
.btn-sm{padding:6px 10px;font-size:12px}
.btn-full{width:100%;justify-content:center}

/* CHECKLIST */
.cl-item{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border);cursor:pointer}
.cl-item:last-child{border-bottom:none;padding-bottom:0}
.cl-item:first-child{padding-top:0}
.cl-box{width:20px;height:20px;border-radius:5px;border:2px solid var(--border);display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .15s;background:white}
.cl-box.done{background:var(--green);border-color:var(--green)}
.cl-text{font-size:13.5px;line-height:1.4;flex:1}
.cl-text.done{text-decoration:line-through;color:var(--muted)}
.progress-bar{height:5px;background:var(--border);border-radius:3px;margin-bottom:12px;overflow:hidden}
.progress-fill{height:100%;background:var(--green);border-radius:3px;transition:width .3s}
.progress-label{font-size:12px;color:var(--muted);margin-bottom:6px}

/* SIGN IN */
.si-entry{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:var(--bg);border-radius:8px;margin-bottom:6px}
.si-name{font-weight:500;font-size:14px}
.si-meta{font-size:12px;color:var(--muted)}
.badge{font-size:11px;font-weight:600;padding:3px 9px;border-radius:20px}
.badge-green{background:var(--green-lt);color:var(--green)}
.badge-red{background:var(--red-lt);color:var(--red)}
.badge-blue{background:var(--blue-lt);color:var(--blue)}
.badge-admin{background:var(--admin-lt);color:var(--admin)}

/* CONTACTS */
.ct-entry{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--border)}
.ct-entry:last-child{border-bottom:none}
.ct-avatar{width:36px;height:36px;border-radius:50%;background:var(--accent);color:white;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;flex-shrink:0}
.ct-info{flex:1}
.ct-name{font-weight:500;font-size:14px}
.ct-role{font-size:12px;color:var(--muted)}
.ct-num{font-size:13px;font-weight:500}
.call-btn{background:var(--green-lt);color:var(--green);border:none;border-radius:8px;padding:7px 12px;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:4px;text-decoration:none}
.call-btn:hover{background:#a7f3d0}

/* CODE LIST */
.code-row{display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border)}
.code-row:last-child{border-bottom:none}
.code-label{font-weight:500;font-size:14px}
.code-val{font-size:20px;font-weight:700;letter-spacing:4px;font-variant-numeric:tabular-nums}
.code-hidden{letter-spacing:4px;font-size:20px;color:var(--muted)}

/* NOTES */
.note-card{padding:12px;background:var(--bg);border-radius:8px;margin-bottom:8px}
.note-text{font-size:14px;line-height:1.5;margin-bottom:6px;white-space:pre-wrap}
.note-meta{font-size:11px;color:var(--muted);display:flex;justify-content:space-between;align-items:center}

/* SECTION */
.sec-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.sec-title{font-family:'DM Serif Display',serif;font-size:20px}

/* ADMIN - editable list */
.edit-list-item{display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border)}
.edit-list-item:last-child{border-bottom:none}
.edit-list-text{flex:1;font-size:14px}
.edit-input{flex:1;padding:7px 10px;border:1px solid var(--border);border-radius:6px;font-family:inherit;font-size:13px;background:white;outline:none}
.edit-input:focus{border-color:var(--admin)}

/* REPORTS */
.report-row{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px}
.report-type-btn{padding:10px;border-radius:8px;border:1px solid var(--border);background:white;cursor:pointer;font-family:inherit;font-size:13px;font-weight:500;text-align:left;transition:all .15s;display:flex;flex-direction:column;gap:4px}
.report-type-btn.selected{border-color:var(--admin);background:var(--admin-lt);color:var(--admin)}
.report-type-label{font-size:11px;color:var(--muted)}

/* HISTORY TABLE */
.hist-table{width:100%;border-collapse:collapse;font-size:12px}
.hist-table th{text-align:left;padding:8px 10px;border-bottom:2px solid var(--border);font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;font-size:11px}
.hist-table td{padding:8px 10px;border-bottom:1px solid var(--border);vertical-align:middle}
.hist-table tr:last-child td{border-bottom:none}

/* OVERVIEW GRID */
.ov-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px}
.ov-tile{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:14px;box-shadow:var(--sh)}
.ov-label{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px}
.ov-val{font-size:24px;font-weight:700}

/* MODAL */
.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:200;display:flex;align-items:flex-end;justify-content:center}
.modal{background:white;border-radius:16px 16px 0 0;padding:22px;width:100%;max-width:480px;max-height:80vh;overflow-y:auto}
.modal-title{font-family:'DM Serif Display',serif;font-size:18px;margin-bottom:14px}
.modal-actions{display:flex;gap:8px;margin-top:14px}

/* UTILS */
.row{display:flex;gap:8px;align-items:center}
.muted{color:var(--muted);font-size:13px}
.empty{text-align:center;padding:28px;color:var(--muted);font-size:14px}
.divider{border:none;border-top:1px solid var(--border);margin:12px 0}
.tag{display:inline-flex;align-items:center;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:500}
.warn-box{background:var(--amber-lt);border:1px solid #fcd34d;border-radius:8px;padding:10px 12px;font-size:13px;color:var(--amber);margin-bottom:12px}
.icon-btn{background:none;border:none;cursor:pointer;color:var(--muted);padding:4px;border-radius:6px;display:flex;align-items:center;transition:all .15s}
.icon-btn:hover{color:var(--text);background:var(--accent-lt)}
.icon-btn.danger:hover{color:var(--red);background:var(--red-lt)}
`;

// ─────────────────────────────────────────────
//  MAIN APP
// ─────────────────────────────────────────────
export default function DutyManagerApp() {
  // null = open/staff view, "admin" = admin session active
  const [session, setSession] = useState(getSession);
  const [data, setData] = useState(loadData);
  const [tab, setTab] = useState("home");

  // Login state — only for admin
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  // Code list
  const [codesUnlocked, setCodesUnlocked] = useState(false);
  const [codePin, setCodePin] = useState("");
  const [codePinErr, setCodePinErr] = useState("");
  const [showCodeVals, setShowCodeVals] = useState({});
  const [editCodeId, setEditCodeId] = useState(null);

  // Sign In
  const [siName, setSiName] = useState("");
  const [siRole, setSiRole] = useState("");

  // Notes
  const [noteText, setNoteText] = useState("");
  const [noteAuthor, setNoteAuthor] = useState("");

  // Contacts modal
  const [showAddContact, setShowAddContact] = useState(false);
  const [newContact, setNewContact] = useState({ name: "", role: "", number: "" });
  const [editContactId, setEditContactId] = useState(null);

  // Admin - editable lists
  const [editingList, setEditingList] = useState(null); // "daily"|"bar"|"fire"
  const [listDraft, setListDraft] = useState([]);
  const [newListItem, setNewListItem] = useState("");

  // Reports
  const [reportType, setReportType] = useState("signins");
  const [reportPeriod, setReportPeriod] = useState("week");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  // PIN change (admin)
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinMsg, setPinMsg] = useState(null); // { type: "ok"|"err", text }

  // Admin password change
  const [newAdminPass, setNewAdminPass] = useState("");
  const [confirmAdminPass, setConfirmAdminPass] = useState("");
  const [adminPassMsg, setAdminPassMsg] = useState(null);

  useEffect(() => { saveData(data); }, [data]);

  const upd = useCallback((key, val) => setData(d => ({ ...d, [key]: typeof val === "function" ? val(d[key]) : val })), []);

  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const isAdmin = session?.role === "admin";

  // Today's checklist session
  const todaySession = getTodaySession(data);
  const setTodaySession = (sess) => {
    upd("checklistSessions", prev => ({ ...prev, [todayKey()]: sess }));
    // Archive snapshot to history
    ["daily", "bar", "fire"].forEach(type => {
      const items = sess[type];
      const done = items.filter(i => i.done).length;
      setData(d => {
        const existing = d.checklistHistory.find(h => h.date === todayKey() && h.type === type);
        const newEntry = { date: todayKey(), type, completedCount: done, totalCount: items.length, items };
        if (existing) {
          return { ...d, checklistHistory: d.checklistHistory.map(h => h.date === todayKey() && h.type === type ? newEntry : h) };
        }
        return { ...d, checklistHistory: [...d.checklistHistory, newEntry] };
      });
    });
  };

  // ── ADMIN LOGIN ──
  const handleLogin = async () => {
    setLoginLoading(true); setLoginError("");
    await new Promise(r => setTimeout(r, 400));
    const storedPass = data.adminPassword || ADMIN_PASSWORD;
    const storedUser = data.adminUsername || ADMIN_USERNAME;
    if (loginUser.trim().toLowerCase() !== storedUser || loginPass !== storedPass) {
      setLoginError("Invalid username or password."); setLoginLoading(false); return;
    }
    const sess = createSession("admin", "Administrator");
    setData(d => ({ ...d, loginHistory: [{ timestamp: isoNow(), role: "admin", displayName: "Administrator", action: "Admin Login" }, ...d.loginHistory] }));
    setSession(sess);
    setLoginUser(""); setLoginPass(""); setShowAdminLogin(false);
    setLoginLoading(false);
  };

  const handleLogout = () => {
    setData(d => ({ ...d, loginHistory: [{ timestamp: isoNow(), role: "admin", displayName: "Administrator", action: "Admin Logout" }, ...d.loginHistory] }));
    clearSession(); setSession(null); setTab("home"); setCodesUnlocked(false);
  };

  // ── SIGN IN / OUT ──
  const todayStr = new Date().toLocaleDateString("en-GB");
  const todaySignIns = (data.signInHistory || []).filter(s => s.date === todayStr);
  const activeStaff = todaySignIns.filter(s => !s.signOut).length;

  const handleSignIn = () => {
    if (!siName.trim()) return;
    const entry = { id: `si_${Date.now()}`, name: siName.trim(), role: siRole.trim(), date: todayStr, signIn: fmtTime(), signOut: null, timestamp: isoNow() };
    upd("signInHistory", prev => [entry, ...prev]);
    setSiName(""); setSiRole("");
  };
  const handleSignOut = (id) => upd("signInHistory", prev => prev.map(s => s.id === id && !s.signOut ? { ...s, signOut: fmtTime() } : s));

  // ── CHECKLIST TOGGLE ──
  const toggleCheck = (type, id) => {
    const sess = { ...todaySession, [type]: todaySession[type].map(i => i.id === id ? { ...i, done: !i.done } : i) };
    setTodaySession(sess);
  };
  const resetChecklist = (type) => {
    const sess = { ...todaySession, [type]: todaySession[type].map(i => ({ ...i, done: false })) };
    setTodaySession(sess);
  };

  // ── CODES ──
  const unlockCodes = () => {
    const pin = data.codeListPin || "1234";
    if (codePin === pin) { setCodesUnlocked(true); setCodePinErr(""); setCodePin(""); }
    else { setCodePinErr("Incorrect PIN. Try again."); setCodePin(""); }
  };
  const saveCode = (id, val) => { upd("codes", data.codes.map(c => c.id === id ? { ...c, code: val } : c)); setEditCodeId(null); };
  const addCode = () => upd("codes", [...data.codes, { id: Date.now(), label: "New Code", code: "0000" }]);
  const deleteCode = (id) => upd("codes", data.codes.filter(c => c.id !== id));

  // ── NOTES ──
  const addNote = () => {
    if (!noteText.trim()) return;
    const note = { id: `n_${Date.now()}`, text: noteText.trim(), author: noteAuthor.trim() || (session?.displayName || "Unknown"), timestamp: fmtDateTime(), date: todayStr };
    upd("noteHistory", prev => [note, ...prev]);
    setNoteText(""); setNoteAuthor("");
  };
  const deleteNote = (id) => upd("noteHistory", prev => prev.filter(n => n.id !== id));

  // ── CONTACTS ──
  const addContact = () => {
    if (!newContact.name.trim()) return;
    upd("contacts", [...data.contacts, { ...newContact, id: Date.now() }]);
    setNewContact({ name: "", role: "", number: "" }); setShowAddContact(false);
  };
  const deleteContact = (id) => upd("contacts", data.contacts.filter(c => c.id !== id));
  const startEditContact = (c) => { setNewContact({ name: c.name, role: c.role, number: c.number }); setEditContactId(c.id); setShowAddContact(true); };
  const saveContact = () => {
    upd("contacts", data.contacts.map(c => c.id === editContactId ? { ...c, ...newContact } : c));
    setNewContact({ name: "", role: "", number: "" }); setEditContactId(null); setShowAddContact(false);
  };

  // ── ADMIN LIST EDITOR ──
  const startEditList = (key) => {
    const map = { daily: "dailyChecklistTemplate", bar: "barChecklistTemplate", fire: "fireSafetyTemplate" };
    setEditingList(key); setListDraft([...data[map[key]]]);
  };
  const saveList = () => {
    const map = { daily: "dailyChecklistTemplate", bar: "barChecklistTemplate", fire: "fireSafetyTemplate" };
    upd(map[editingList], listDraft);
    // Reset today's session so it reflects changes
    setData(d => { const s = { ...d.checklistSessions }; delete s[todayKey()]; return { ...d, checklistSessions: s, [map[editingList]]: listDraft }; });
    setEditingList(null); setNewListItem("");
  };

  // ── REPORTS ──
  const getDateRange = () => {
    const now = new Date();
    if (reportPeriod === "week") {
      const from = new Date(now); from.setDate(now.getDate() - 7);
      return { from: from.toISOString().split("T")[0], to: now.toISOString().split("T")[0] };
    } else if (reportPeriod === "month") {
      const from = new Date(now); from.setMonth(now.getMonth() - 1);
      return { from: from.toISOString().split("T")[0], to: now.toISOString().split("T")[0] };
    }
    return { from: customFrom, to: customTo };
  };
  const handleDownloadReport = () => {
    const { from, to } = getDateRange();
    if (!from || !to) return;
    const csv = generateCSV(reportType, data, from, to);
    const label = { signins: "staff-signins", checklists: "checklists", logins: "login-history", notes: "notes" }[reportType];
    downloadCSV(csv, `duty-manager-${label}-${from}-to-${to}.csv`);
  };

  // ── PROGRESS HELPERS ──
  const pct = (arr) => arr.length ? Math.round((arr.filter(i => i.done).length / arr.length) * 100) : 0;
  const dailyProgress = pct(todaySession.daily);
  const barProgress = pct(todaySession.bar);
  const fireProgress = pct(todaySession.fire);

  // ─── RENDER: ALWAYS ACCESSIBLE (no staff login required) ───

  // ── PIN CHANGE ──
  const handleSavePin = () => {
    if (!newPin.trim()) { setPinMsg({ type: "err", text: "PIN cannot be empty." }); return; }
    if (newPin !== confirmPin) { setPinMsg({ type: "err", text: "PINs do not match." }); return; }
    upd("codeListPin", newPin.trim());
    setNewPin(""); setConfirmPin("");
    setPinMsg({ type: "ok", text: "Code List PIN updated successfully." });
    setTimeout(() => setPinMsg(null), 3000);
  };

  // ── ADMIN PASSWORD CHANGE ──
  const handleSaveAdminPass = () => {
    if (!newAdminPass.trim()) { setAdminPassMsg({ type: "err", text: "Password cannot be empty." }); return; }
    if (newAdminPass !== confirmAdminPass) { setAdminPassMsg({ type: "err", text: "Passwords do not match." }); return; }
    upd("adminPassword", newAdminPass.trim());
    setNewAdminPass(""); setConfirmAdminPass("");
    setAdminPassMsg({ type: "ok", text: "Admin password updated. Use it next time you log in." });
    setTimeout(() => setAdminPassMsg(null), 4000);
  };

  // ─── NAV TABS ───
  const staffTabs = [
    { id: "home", label: "Home", Icon: I.Home },
    { id: "signin", label: "Sign In/Out", Icon: I.Users },
    { id: "daily", label: "Daily", Icon: I.Check },
    { id: "bar", label: "Bar", Icon: I.Beer },
    { id: "fire", label: "Fire", Icon: I.Fire },
    { id: "codes", label: "Codes", Icon: I.KeyRound },
    { id: "notes", label: "Notes", Icon: I.Note },
    { id: "contacts", label: "Contacts", Icon: I.Phone },
  ];
  const adminTabs = isAdmin ? [
    { id: "admin", label: "Admin", Icon: I.Settings, adminStyle: true },
    { id: "reports", label: "Reports", Icon: I.Download, adminStyle: true },
    { id: "history", label: "History", Icon: I.History, adminStyle: true },
  ] : [];
  const allTabs = [...staffTabs, ...adminTabs];

  // Checklist Section component
  const ChecklistSection = ({ type, title }) => {
    const items = todaySession[type] || [];
    const done = items.filter(i => i.done).length;
    return (
      <div>
        <div className="sec-hdr">
          <span className="sec-title">{title}</span>
          <button style={{ fontSize: 11, color: "var(--muted)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }} onClick={() => resetChecklist(type)}>Reset</button>
        </div>
        <div className="card">
          <div className="progress-label">{done} of {items.length} complete</div>
          <div className="progress-bar"><div className="progress-fill" style={{ width: `${(done / items.length) * 100}%` }} /></div>
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

  // ─── RENDER ───
  return (
    <>
      <style>{CSS}</style>
      <div className="app">
        {/* HEADER */}
        <div className="header">
          <div className="header-row">
            <div>
              <div className="header-title">Duty Manager</div>
              <div className="header-date">{today}</div>
            </div>
            <div className="row">
              {isAdmin ? (
                <>
                  <span className="role-pill role-admin"><I.Shield /> Admin</span>
                  <button className="logout-btn" onClick={handleLogout}><I.LogOut /> Exit Admin</button>
                </>
              ) : (
                <button className="btn btn-ghost btn-sm" style={{ fontSize: 12, color: "var(--admin)", border: "1px solid var(--admin-lt)" }} onClick={() => { setShowAdminLogin(true); setLoginError(""); setLoginUser(""); setLoginPass(""); }}>
                  <I.Shield /> Admin Login
                </button>
              )}
            </div>
          </div>
        </div>

        {/* NAV */}
        <nav className="nav">
          {allTabs.map(({ id, label, Icon, adminStyle }) => (
            <button key={id} className={`nav-btn ${tab === id ? "active" : ""} ${adminStyle ? "admin-tab" : ""}`} onClick={() => setTab(id)}>
              <Icon />{label}
            </button>
          ))}
        </nav>

        <div className="content">

          {/* ── HOME ── */}
          {tab === "home" && (
            <div>
              <div className="sec-title" style={{ marginBottom: 12 }}>Overview</div>
              <div className="ov-grid">
                {[
                  { label: "Staff on Duty", val: activeStaff, color: activeStaff > 0 ? "var(--green)" : "var(--muted)" },
                  { label: "Notes Today", val: (data.noteHistory || []).filter(n => n.date === todayStr).length, color: "var(--text)" },
                  { label: "Daily Checklist", val: `${dailyProgress}%`, color: dailyProgress === 100 ? "var(--green)" : "var(--amber)" },
                  { label: "Fire Safety", val: `${fireProgress}%`, color: fireProgress === 100 ? "var(--green)" : "var(--red)" },
                ].map(({ label, val, color }) => (
                  <div key={label} className="ov-tile">
                    <div className="ov-label">{label}</div>
                    <div className="ov-val" style={{ color }}>{val}</div>
                  </div>
                ))}
              </div>
              <div className="card">
                <div className="card-title">Quick Access</div>
                {[
                  { label: "Sign someone in →", t: "signin" },
                  { label: "Daily checklist →", t: "daily" },
                  { label: "Bar checklist →", t: "bar" },
                  { label: "Fire safety →", t: "fire" },
                ].map(({ label, t }) => (
                  <div key={t} onClick={() => setTab(t)} style={{ padding: "10px 0", borderBottom: "1px solid var(--border)", cursor: "pointer", fontSize: 14, display: "flex", justifyContent: "space-between" }}>
                    {label}
                  </div>
                ))}
              </div>
              {isAdmin && (
                <div className="card" style={{ borderLeft: "3px solid var(--admin)" }}>
                  <div className="card-title"><I.Shield /> Admin Tools</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="btn btn-admin btn-sm" onClick={() => setTab("admin")}>Edit App Data</button>
                    <button className="btn btn-admin btn-sm" onClick={() => setTab("reports")}>Download Reports</button>
                    <button className="btn btn-admin btn-sm" onClick={() => setTab("history")}>View History</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── SIGN IN / OUT ── */}
          {tab === "signin" && (
            <div>
              <div className="sec-title" style={{ marginBottom: 12 }}>Sign In / Out</div>
              <div className="card">
                <div className="card-title"><div className="card-icon"><I.Users /></div>Sign Someone In</div>
                <div className="field"><input className="input" placeholder="Full name" value={siName} onChange={e => setSiName(e.target.value)} /></div>
                <div className="field"><input className="input" placeholder="Role / Position (optional)" value={siRole} onChange={e => setSiRole(e.target.value)} /></div>
                <button className="btn btn-primary btn-full" onClick={handleSignIn}><I.Plus /> Sign In</button>
              </div>
              {todaySignIns.length > 0 && (
                <div className="card">
                  <div className="card-title">Today's Log</div>
                  {todaySignIns.map(e => (
                    <div key={e.id} className="si-entry">
                      <div>
                        <div className="si-name">{e.name}</div>
                        <div className="si-meta">{e.role && `${e.role} · `}In: {e.signIn}{e.signOut && ` · Out: ${e.signOut}`}</div>
                      </div>
                      {!e.signOut
                        ? <button className="btn btn-danger btn-sm" onClick={() => handleSignOut(e.id)}><I.LogOut /> Sign Out</button>
                        : <span className="badge badge-red">Signed Out</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── DAILY CHECKLIST ── */}
          {tab === "daily" && <ChecklistSection type="daily" title="Daily Checklist" />}

          {/* ── BAR CHECKLIST ── */}
          {tab === "bar" && <ChecklistSection type="bar" title="Bar Checklist" />}

          {/* ── FIRE SAFETY ── */}
          {tab === "fire" && (
            <div>
              <ChecklistSection type="fire" title="Fire Safety" />
              <div className="card" style={{ borderLeft: "3px solid var(--red)" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--red)", marginBottom: 8 }}>🔥 Emergency Numbers</div>
                <div style={{ fontSize: 13, lineHeight: 1.8 }}>
                  <div><strong>Fire / Police / Ambulance:</strong> 999</div>
                  <div><strong>Non-emergency police:</strong> 101</div>
                  <div><strong>Poison Control:</strong> 0344 892 0111</div>
                </div>
              </div>
            </div>
          )}

          {/* ── CODES ── */}
          {tab === "codes" && (
            <div>
              <div className="sec-title" style={{ marginBottom: 12 }}>Code List</div>
              {!codesUnlocked ? (
                <div className="card">
                  <div style={{ textAlign: "center", padding: "20px 0" }}>
                    <div style={{ width: 48, height: 48, background: "var(--accent-lt)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}><I.Lock /></div>
                    <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 18, marginBottom: 6 }}>Restricted Access</div>
                    <div className="muted" style={{ marginBottom: 16 }}>Enter PIN to view codes</div>
                    <input className="input" type="password" placeholder="••••" value={codePin} onChange={e => setCodePin(e.target.value)} onKeyDown={e => e.key === "Enter" && unlockCodes()} style={{ textAlign: "center", fontSize: 20, letterSpacing: 8, maxWidth: 200, margin: "0 auto" }} maxLength={8} />
                    {codePinErr && <div style={{ color: "var(--red)", fontSize: 13, marginTop: 8 }}>{codePinErr}</div>}
                    <button className="btn btn-primary btn-full" style={{ marginTop: 14 }} onClick={unlockCodes}>Unlock</button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="card">
                    {data.codes.map(c => (
                      <div key={c.id} className="code-row">
                        <div>
                          {editCodeId === c.id && isAdmin ? (
                            <div className="row">
                              <input className="edit-input" defaultValue={c.label} id={`cl_${c.id}`} style={{ width: 120 }} />
                              <input className="edit-input" defaultValue={c.code} id={`cv_${c.id}`} style={{ width: 90 }} />
                              <button className="btn btn-primary btn-sm" onClick={() => saveCode(c.id, document.getElementById(`cv_${c.id}`).value)}>Save</button>
                              <button className="btn btn-ghost btn-sm" onClick={() => setEditCodeId(null)}>✕</button>
                            </div>
                          ) : (
                            <>
                              <div className="code-label">{c.label}</div>
                              <div className="row" style={{ marginTop: 4 }}>
                                {showCodeVals[c.id] ? <span className="code-val">{c.code}</span> : <span className="code-hidden">{"•".repeat(c.code.length)}</span>}
                                <button className="icon-btn" onClick={() => setShowCodeVals(p => ({ ...p, [c.id]: !p[c.id] }))}>
                                  {showCodeVals[c.id] ? <I.EyeOff /> : <I.Eye />}
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                        {isAdmin && editCodeId !== c.id && (
                          <div className="row">
                            <button className="icon-btn" onClick={() => setEditCodeId(c.id)}><I.Edit /></button>
                            <button className="icon-btn danger" onClick={() => deleteCode(c.id)}><I.Trash /></button>
                          </div>
                        )}
                      </div>
                    ))}
                    {isAdmin && <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={addCode}><I.Plus /> Add Code</button>}
                  </div>
                  <button className="btn btn-ghost btn-full" onClick={() => setCodesUnlocked(false)}>Lock Codes</button>
                </div>
              )}
            </div>
          )}

          {/* ── NOTES ── */}
          {tab === "notes" && (
            <div>
              <div className="sec-title" style={{ marginBottom: 12 }}>Notes</div>
              <div className="card">
                <div className="card-title"><div className="card-icon"><I.Note /></div>Add Note</div>
                <div className="field"><input className="input" placeholder="Your name" value={noteAuthor} onChange={e => setNoteAuthor(e.target.value)} /></div>
                <div className="field"><textarea className="input" placeholder="Write a note for the team…" value={noteText} onChange={e => setNoteText(e.target.value)} /></div>
                <button className="btn btn-primary btn-full" onClick={addNote}><I.Plus /> Post Note</button>
              </div>
              {(data.noteHistory || []).length === 0
                ? <div className="empty">No notes yet.</div>
                : (data.noteHistory || []).map(n => (
                    <div key={n.id} className="note-card">
                      <div className="note-text">{n.text}</div>
                      <div className="note-meta">
                        <span><strong>{n.author}</strong> · {n.timestamp}</span>
                        {isAdmin && (
                          <button className="icon-btn danger" onClick={() => deleteNote(n.id)}><I.Trash /></button>
                        )}
                      </div>
                    </div>
                  ))}
            </div>
          )}

          {/* ── CONTACTS ── */}
          {tab === "contacts" && (
            <div>
              <div className="sec-hdr">
                <span className="sec-title">Contacts</span>
                {isAdmin && <button className="btn btn-ghost btn-sm" onClick={() => { setEditContactId(null); setNewContact({ name: "", role: "", number: "" }); setShowAddContact(true); }}><I.Plus /> Add</button>}
              </div>
              <div className="card">
                {data.contacts.map(c => (
                  <div key={c.id} className="ct-entry">
                    <div className="ct-avatar">{c.name.charAt(0).toUpperCase()}</div>
                    <div className="ct-info">
                      <div className="ct-name">{c.name}</div>
                      <div className="ct-role">{c.role}</div>
                      <div className="ct-num">{c.number}</div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                      <a href={`tel:${c.number}`} className="call-btn"><I.Phone /> Call</a>
                      {isAdmin && (
                        <div className="row">
                          <button className="icon-btn" onClick={() => startEditContact(c)}><I.Edit /></button>
                          <button className="icon-btn danger" onClick={() => deleteContact(c.id)}><I.Trash /></button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── ADMIN ── */}
          {tab === "admin" && isAdmin && (
            <div>
              <div className="sec-title" style={{ marginBottom: 12 }}>Admin Panel</div>
              <div className="warn-box">Changes to checklists take effect immediately and reset today's progress.</div>

              {/* Checklist editors */}
              {[
                { key: "daily", label: "Daily Checklist", template: data.dailyChecklistTemplate },
                { key: "bar", label: "Bar Checklist", template: data.barChecklistTemplate },
                { key: "fire", label: "Fire Safety Checklist", template: data.fireSafetyTemplate },
              ].map(({ key, label, template }) => (
                <div key={key} className="card">
                  <div className="sec-hdr">
                    <div className="card-title" style={{ margin: 0 }}>{label}</div>
                    {editingList !== key
                      ? <button className="btn btn-admin btn-sm" onClick={() => startEditList(key)}><I.Edit /> Edit</button>
                      : <button className="btn btn-primary btn-sm" onClick={saveList}>Save</button>}
                  </div>
                  {editingList === key ? (
                    <div>
                      {listDraft.map((item, i) => (
                        <div key={i} className="edit-list-item">
                          <input className="edit-input" value={item} onChange={e => setListDraft(d => d.map((v, j) => j === i ? e.target.value : v))} />
                          <button className="icon-btn danger" onClick={() => setListDraft(d => d.filter((_, j) => j !== i))}><I.Trash /></button>
                        </div>
                      ))}
                      <div className="row" style={{ marginTop: 10 }}>
                        <input className="input" placeholder="Add new item…" value={newListItem} onChange={e => setNewListItem(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && newListItem.trim()) { setListDraft(d => [...d, newListItem.trim()]); setNewListItem(""); }}} />
                        <button className="btn btn-primary btn-sm" onClick={() => { if (newListItem.trim()) { setListDraft(d => [...d, newListItem.trim()]); setNewListItem(""); }}}><I.Plus /></button>
                      </div>
                      <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => setEditingList(null)}>Cancel</button>
                    </div>
                  ) : (
                    template.map((item, i) => <div key={i} className="edit-list-item"><span className="edit-list-text">{item}</span></div>)
                  )}
                </div>
              ))}

              {/* Code List PIN change */}
              <div className="card">
                <div className="card-title"><div className="card-icon"><I.KeyRound /></div>Change Code List PIN</div>
                <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12, lineHeight: 1.5 }}>Current PIN is used to unlock the Codes tab. Staff will need the new PIN after you change it.</p>
                <div className="field"><label>New PIN</label><input className="input" type="password" placeholder="Enter new PIN" value={newPin} onChange={e => setNewPin(e.target.value)} /></div>
                <div className="field"><label>Confirm PIN</label><input className="input" type="password" placeholder="Repeat new PIN" value={confirmPin} onChange={e => setConfirmPin(e.target.value)} /></div>
                {pinMsg && <div style={{ fontSize: 13, padding: "8px 12px", borderRadius: 6, marginBottom: 8, background: pinMsg.type === "ok" ? "var(--green-lt)" : "var(--red-lt)", color: pinMsg.type === "ok" ? "var(--green)" : "var(--red)" }}>{pinMsg.text}</div>}
                <button className="btn btn-admin btn-full" onClick={handleSavePin}>Update PIN</button>
              </div>

              {/* Admin password change */}
              <div className="card">
                <div className="card-title"><div className="card-icon"><I.Lock /></div>Change Admin Password</div>
                <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12, lineHeight: 1.5 }}>This changes the password required for the Admin Login. Default username remains <strong>admin</strong>.</p>
                <div className="field"><label>New Password</label><input className="input" type="password" placeholder="Enter new password" value={newAdminPass} onChange={e => setNewAdminPass(e.target.value)} /></div>
                <div className="field"><label>Confirm Password</label><input className="input" type="password" placeholder="Repeat new password" value={confirmAdminPass} onChange={e => setConfirmAdminPass(e.target.value)} /></div>
                {adminPassMsg && <div style={{ fontSize: 13, padding: "8px 12px", borderRadius: 6, marginBottom: 8, background: adminPassMsg.type === "ok" ? "var(--green-lt)" : "var(--red-lt)", color: adminPassMsg.type === "ok" ? "var(--green)" : "var(--red)" }}>{adminPassMsg.text}</div>}
                <button className="btn btn-admin btn-full" onClick={handleSaveAdminPass}>Update Admin Password</button>
              </div>
            </div>
          )}

          {/* ── REPORTS ── */}
          {tab === "reports" && isAdmin && (
            <div>
              <div className="sec-title" style={{ marginBottom: 12 }}>Download Reports</div>
              <div className="card">
                <div className="card-title">Report Type</div>
                <div className="report-row">
                  {[
                    { id: "signins", label: "Staff Sign-Ins / Outs" },
                    { id: "checklists", label: "Checklist Completion" },
                    { id: "logins", label: "Login Activity" },
                    { id: "notes", label: "Team Notes" },
                  ].map(r => (
                    <button key={r.id} className={`report-type-btn ${reportType === r.id ? "selected" : ""}`} onClick={() => setReportType(r.id)}>
                      {r.label}
                      <span className="report-type-label">CSV Export</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="card">
                <div className="card-title">Date Range</div>
                <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                  {["week", "month", "custom"].map(p => (
                    <button key={p} className={`btn btn-sm ${reportPeriod === p ? "btn-admin" : "btn-ghost"}`} onClick={() => setReportPeriod(p)}>
                      {p === "week" ? "Last 7 days" : p === "month" ? "Last 30 days" : "Custom"}
                    </button>
                  ))}
                </div>
                {reportPeriod === "custom" && (
                  <div className="row" style={{ marginBottom: 14 }}>
                    <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                      <label>From</label>
                      <input className="input" type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
                    </div>
                    <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                      <label>To</label>
                      <input className="input" type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} />
                    </div>
                  </div>
                )}
                <button className="btn btn-admin btn-full" onClick={handleDownloadReport}><I.Download /> Download CSV</button>
              </div>
              <div className="card" style={{ borderLeft: "3px solid var(--admin)" }}>
                <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>
                  Reports are exported as <strong>.csv</strong> files compatible with Excel, Google Sheets, and Numbers. Data is retained for <strong>6 months</strong> automatically.
                </div>
              </div>
            </div>
          )}

          {/* ── HISTORY ── */}
          {tab === "history" && isAdmin && (
            <div>
              <div className="sec-title" style={{ marginBottom: 12 }}>Data History</div>

              <div className="card">
                <div className="card-title">Recent Sign-Ins (All Time)</div>
                {(data.signInHistory || []).length === 0 ? <div className="empty">No records yet.</div> : (
                  <div style={{ overflowX: "auto" }}>
                    <table className="hist-table">
                      <thead><tr><th>Date</th><th>Name</th><th>In</th><th>Out</th></tr></thead>
                      <tbody>
                        {(data.signInHistory || []).slice(0, 50).map(r => (
                          <tr key={r.id}>
                            <td>{r.date}</td>
                            <td><strong>{r.name}</strong>{r.role && <div style={{ fontSize: 11, color: "var(--muted)" }}>{r.role}</div>}</td>
                            <td>{r.signIn}</td>
                            <td>{r.signOut || <span style={{ color: "var(--green)", fontWeight: 600 }}>Active</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="card">
                <div className="card-title">Checklist History</div>
                {(data.checklistHistory || []).length === 0 ? <div className="empty">No records yet.</div> : (
                  <div style={{ overflowX: "auto" }}>
                    <table className="hist-table">
                      <thead><tr><th>Date</th><th>Type</th><th>Complete</th></tr></thead>
                      <tbody>
                        {(data.checklistHistory || []).slice(0, 30).map((r, i) => (
                          <tr key={i}>
                            <td>{r.date}</td>
                            <td><span className="badge badge-blue" style={{ textTransform: "capitalize" }}>{r.type}</span></td>
                            <td>{r.completedCount}/{r.totalCount} ({Math.round((r.completedCount / r.totalCount) * 100)}%)</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="card">
                <div className="card-title">Login Activity</div>
                {(data.loginHistory || []).length === 0 ? <div className="empty">No records yet.</div> : (
                  <div style={{ overflowX: "auto" }}>
                    <table className="hist-table">
                      <thead><tr><th>Time</th><th>User</th><th>Action</th></tr></thead>
                      <tbody>
                        {(data.loginHistory || []).slice(0, 30).map((r, i) => (
                          <tr key={i}>
                            <td style={{ fontSize: 11 }}>{new Date(r.timestamp).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                            <td><span className={`badge ${r.role === "admin" ? "badge-admin" : "badge-green"}`}>{r.displayName}</span></td>
                            <td>{r.action}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ADMIN LOGIN MODAL */}
        {showAdminLogin && (
          <div className="modal-overlay" onClick={() => setShowAdminLogin(false)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <div style={{ width: 36, height: 36, background: "var(--admin)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "white" }}><I.Shield /></div>
                <div>
                  <div className="modal-title" style={{ marginBottom: 0 }}>Admin Login</div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>Restricted access</div>
                </div>
              </div>
              <div className="field"><label>Username</label><input className="input" placeholder="admin" value={loginUser} onChange={e => setLoginUser(e.target.value)} autoCapitalize="none" autoCorrect="off" /></div>
              <div className="field">
                <label>Password</label>
                <div style={{ position: "relative" }}>
                  <input className="input" type={showPass ? "text" : "password"} placeholder="••••••••" value={loginPass} onChange={e => setLoginPass(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} style={{ paddingRight: 40 }} />
                  <button onClick={() => setShowPass(v => !v)} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--muted)" }}>
                    {showPass ? <I.EyeOff /> : <I.Eye />}
                  </button>
                </div>
              </div>
              {loginError && <div style={{ color: "var(--red)", fontSize: 13, marginBottom: 8 }}>{loginError}</div>}
              <div className="modal-actions">
                <button className="btn btn-admin" style={{ flex: 1 }} onClick={handleLogin} disabled={loginLoading}>{loginLoading ? "Verifying…" : "Sign In as Admin"}</button>
                <button className="btn btn-ghost" onClick={() => { setShowAdminLogin(false); setLoginError(""); }}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* CONTACTS MODAL */}
        {showAddContact && (
          <div className="modal-overlay" onClick={() => setShowAddContact(false)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-title">{editContactId ? "Edit Contact" : "Add Contact"}</div>
              <div className="field"><label>Name *</label><input className="input" placeholder="Name" value={newContact.name} onChange={e => setNewContact(p => ({ ...p, name: e.target.value }))} /></div>
              <div className="field"><label>Role</label><input className="input" placeholder="e.g. Security, Manager" value={newContact.role} onChange={e => setNewContact(p => ({ ...p, role: e.target.value }))} /></div>
              <div className="field"><label>Phone Number</label><input className="input" placeholder="Phone number" value={newContact.number} onChange={e => setNewContact(p => ({ ...p, number: e.target.value }))} /></div>
              <div className="modal-actions">
                <button className="btn btn-admin" style={{ flex: 1 }} onClick={editContactId ? saveContact : addContact}>{editContactId ? "Save Changes" : "Add Contact"}</button>
                <button className="btn btn-ghost" onClick={() => { setShowAddContact(false); setEditContactId(null); }}>Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
