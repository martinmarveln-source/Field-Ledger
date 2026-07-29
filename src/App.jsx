import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { usePaystackPayment } from 'react-paystack';
import { createClient } from '@supabase/supabase-js';
import * as pdfjsLib from 'pdfjs-dist';

// Use a CDN for the worker to avoid Vite build configuration issues
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

// Supabase anon key is safe to expose publicly — it is a read-restricted public key designed for browser use.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://wswrzwtktbhoftblbyxt.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indzd3J6d3RrdGJob2Z0YmxieXh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5NzYzOTUsImV4cCI6MjEwMDU1MjM5NX0.U7vZGApCx9qCLuQqIZpppv2Gy0Lz2x-RP2QzJp7M5Qk';
const supabase = (SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_URL.startsWith('http'))
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;
import {
  ClipboardList, Users, Printer, ShieldCheck, Boxes, LogOut, Plus, Minus,
  Check, X, Package, TrendingUp, User, ChevronRight, AlertCircle,
  CircleDollarSign, Crown, Home, UserPlus, Trash2, Loader2, RefreshCw,
  ArrowRight, Eye, EyeOff, CheckCircle2, XCircle, Clock, Settings,
  Search, FileText, KeyRound, Wallet, Smartphone, Fingerprint, MapPin, 
  Edit, Activity, Navigation, FileCheck, Copy, Download, Target, Calendar, Send, Grid, Moon, Sun, HelpCircle
} from 'lucide-react';

/* ---------------------------------- config ---------------------------------- */

const ACCESS_CODE = 'AGENCY2026';

const ROLES = [
  { id: 'agent', label: 'Agent', desc: 'Field registration & live verify', icon: ClipboardList, needsCode: false },
  { id: 'supervisor', label: 'Supervisor', desc: 'Leads 5–10 agents', icon: Users, needsCode: false },
  { id: 'ict', label: 'ICT', desc: 'Printing & ID production', icon: Printer, needsCode: true },
  { id: 'store', label: 'Store', desc: 'Logistics & distribution', icon: Boxes, needsCode: true },
  { id: 'admin', label: 'Admin', desc: 'Coordinates supervisors', icon: ShieldCheck, needsCode: true },
  { id: 'super_admin', label: 'Super Admin', desc: 'Settings & system setup', icon: Crown, needsCode: true },
];
const ROLE_MAP = Object.fromEntries(ROLES.map(r => [r.id, r]));

const DEFAULT_TYPES = [
  { id: 'nin', name: 'NIN Registration', price: 500, requiresPrinting: true, active: true },
  { id: 'bvn', name: 'BVN Registration', price: 300, requiresPrinting: false, active: true },
  { id: 'mtn', name: 'MTN SIM Registration', price: 200, requiresPrinting: false, active: true },
  { id: 'opay', name: 'Opay Account', price: 150, requiresPrinting: false, active: true },
  { id: 'moniepoint', name: 'Moniepoint Account', price: 150, requiresPrinting: false, active: true },
  { id: 'momo', name: 'MoMo Account', price: 150, requiresPrinting: false, active: true },
  { id: 'palmpay', name: 'Palmpay Account', price: 150, requiresPrinting: false, active: true },
  { id: 'uba', name: 'UBA Account', price: 200, requiresPrinting: false, active: true },
];

/* ---------------------------------- utils ---------------------------------- */

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const todayStr = () => new Date().toISOString().slice(0, 10);
const fmtNaira = (n) => '₦' + Number(n || 0).toLocaleString();
const fmtDate = (d) => {
  try { return new Date(d + 'T00:00:00').toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short' }); }
  catch (e) { return d; }
};
const fmtTime = (iso) => { try { return new Date(iso).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };
const initials = (name) => (name || '?').trim().split(/\s+/).slice(0, 2).map(s => s[0]).join('').toUpperCase();

// Securely hash a PIN using SHA-256 (Web Crypto API)
async function hashPin(pin) {
  try {
    const msgBuffer = new TextEncoder().encode(String(pin).trim());
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (e) {
    // Fallback: return plain pin if Web Crypto not available
    return String(pin).trim();
  }
}

function isInRange(dateStr, range) {
  if (range === 'all') return true;
  const d = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  if (range === 'today') return dateStr === todayStr();
  if (range === 'week') {
    const start = new Date(now); start.setDate(now.getDate() - 6); start.setHours(0, 0, 0, 0);
    return d >= start;
  }
  if (range === 'month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  return true;
}

/* ------------------------------- storage layer ------------------------------- */

function getOfflineQueue() {
  try {
    return JSON.parse(localStorage.getItem('offline_sync_queue')) || [];
  } catch (e) { return []; }
}

function saveOfflineQueue(queue) {
  localStorage.setItem('offline_sync_queue', JSON.stringify(queue));
}

function addToSyncQueue(op) {
  const queue = getOfflineQueue();
  queue.push({ ...op, timestamp: Date.now() });
  saveOfflineQueue(queue);
}

export async function processSyncQueue() {
  if (!supabase || !navigator.onLine) return;
  const queue = getOfflineQueue();
  if (queue.length === 0) return;
  
  const remaining = [];
  for (const op of queue) {
    try {
      if (op.type === 'upsert') {
        const { error } = await supabase.from('kv_store').upsert({ key: op.key, value: op.value });
        if (error) remaining.push(op);
      } else if (op.type === 'delete') {
        const { error } = await supabase.from('kv_store').delete().eq('key', op.key);
        if (error) remaining.push(op);
      }
    } catch (e) {
      remaining.push(op);
    }
  }
  saveOfflineQueue(remaining);
}

async function safeGet(key, shared) {
  try {
    if (!navigator.onLine) {
      let r = window.storage ? await window.storage.get(key, shared) : localStorage.getItem(key);
      if (r && typeof r === 'object' && 'value' in r) return r.value;
      return r;
    }

    if (supabase) {
      const { data, error } = await supabase.from('kv_store').select('value').eq('key', key).maybeSingle();
      if (!error && data !== null && data !== undefined) {
        const val = data.value;
        if (val === null || val === undefined) return null;
        if (typeof val === 'string') return val;
        if (typeof val === 'object') return JSON.stringify(val);
        return String(val);
      }
    }
    let r = window.storage ? await window.storage.get(key, shared) : localStorage.getItem(key);
    if (r && typeof r === 'object' && 'value' in r) return r.value;
    return r;
  } catch (e) { console.error('safeGet exception:', e); return null; }
}

async function listAll(prefix, shared) {
  try {
    const out = [];
    if (navigator.onLine && supabase) {
      const { data, error } = await supabase.from('kv_store').select('value').like('key', `${prefix}%`);
      if (!error && data) {
        for (const row of data) {
          try {
            const parsed = typeof row.value === 'string'
              ? JSON.parse(row.value)
              : (typeof row.value === 'object' ? row.value : JSON.parse(String(row.value)));
            if (parsed) out.push(parsed);
          } catch(e) {}
        }
        if (out.length > 0) return out;
      }
    }
    
    let keys = [];
    if (window.storage) {
      const res = await window.storage.list(prefix, shared);
      if (res && res.keys) keys = res.keys;
    } else {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(prefix)) keys.push(k);
      }
    }
    for (const k of keys) {
      let v = window.storage ? await window.storage.get(k, shared) : localStorage.getItem(k);
      if (v && typeof v === 'object' && 'value' in v) v = v.value;
      if (v) {
        try { out.push(JSON.parse(v)); } catch (e) {}
      }
    }
    return out;
  } catch (e) { return []; }
}

async function saveItem(key, obj, shared) {
  try {
    const strVal = typeof obj === 'string' ? obj : JSON.stringify(obj);
    const jsonVal = typeof obj === 'string' ? (() => { try { return JSON.parse(obj); } catch(e) { return obj; } })() : obj;
    
    if (window.storage) {
      await window.storage.set(key, strVal, shared);
    } else {
      localStorage.setItem(key, strVal);
    }

    if (supabase) {
      if (navigator.onLine) {
        supabase.from('kv_store').upsert({ key, value: jsonVal }).then(({ error }) => {
          if (error) addToSyncQueue({ type: 'upsert', key, value: jsonVal });
        }).catch(() => addToSyncQueue({ type: 'upsert', key, value: jsonVal }));
      } else {
        addToSyncQueue({ type: 'upsert', key, value: jsonVal });
      }
    }
    return true;
  } catch (e) { return false; }
}

async function deleteItem(key, shared) {
  try {
    if (window.storage) {
      await window.storage.delete(key, shared);
    } else {
      localStorage.removeItem(key);
    }

    if (supabase) {
      if (navigator.onLine) {
        supabase.from('kv_store').delete().eq('key', key).then(({ error }) => {
          if (error) addToSyncQueue({ type: 'delete', key });
        }).catch(() => addToSyncQueue({ type: 'delete', key }));
      } else {
        addToSyncQueue({ type: 'delete', key });
      }
    }
    return true;
  } catch (e) { return false; }
}

/* --------------------------------- primitives -------------------------------- */

function Btn({ children, onClick, tone = 'primary', size = 'md', full, disabled, type = 'button', icon: Icon }) {
  const base = "inline-flex items-center justify-center gap-2 rounded-xl font-bold transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:transform-none active:scale-[0.98]";
  
  const styles = {
    primary: "bg-gradient-to-r from-amber-400 to-amber-500 text-slate-900 hover:from-amber-300 hover:to-amber-400 border border-amber-400/50 shadow-md shadow-amber-500/20 hover:shadow-amber-500/30",
    dark: "bg-gradient-to-r from-slate-900 to-slate-800 text-white hover:from-slate-800 hover:to-slate-700 shadow-md shadow-slate-900/20",
    ghost: "bg-white/50 hover:bg-white text-slate-700 hover:text-slate-900 border border-slate-200 shadow-sm",
    green: "bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white shadow-md shadow-emerald-500/20",
    red: "bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-400 hover:to-rose-500 text-white shadow-md shadow-rose-500/20",
  };
  const sizes = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2.5 text-sm",
    lg: "px-5 py-3 text-base"
  };
  
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${styles[tone]} ${sizes[size]} ${full ? 'w-full' : ''}`}>
      {Icon && <Icon size={size === 'sm' ? 14 : 18} className={tone === 'primary' ? 'text-slate-800' : ''} />}
      {children}
    </button>
  );
}

function Card({ children, className = '', style = {} }) {
  return (
    <div className={`bg-white/80 backdrop-blur-xl border border-white/60 rounded-2xl shadow-xl shadow-slate-200/40 hover:shadow-2xl transition-all duration-300 ${className}`} style={style}>
      {children}
    </div>
  );
}

function Badge({ children, tone = 'default' }) {
  const styles = {
    default: "bg-slate-100 text-slate-600 border border-slate-200",
    green: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    red: "bg-rose-50 text-rose-700 border border-rose-200",
    amber: "bg-amber-50 text-amber-700 border border-amber-200",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${styles[tone]}`}>
      {children}
    </span>
  );
}

function Avatar({ name, size = 40 }) {
  return (
    <div className="flex items-center justify-center rounded-full bg-gradient-to-br from-slate-800 to-slate-900 text-amber-400 font-bold shrink-0 shadow-inner" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {initials(name)}
    </div>
  );
}

function StatTile({ label, value, sub, icon: Icon, loading = false }) {
  return (
    <Card className="flex overflow-hidden relative group hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] transition-shadow">
      <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-amber-400 to-amber-500 opacity-80" />
      <div className="p-4 flex-1 min-w-0 pl-5">
        <div className="flex items-center gap-2 mb-2 text-slate-500">
          {Icon && <Icon size={14} className="text-amber-500" />}
          <span className="text-[11px] font-bold uppercase tracking-wider truncate">{label}</span>
        </div>
        <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight leading-none truncate">
          {loading ? <Loader2 size={24} className="animate-spin text-slate-400" /> : value}
        </div>
        {sub && <div className="text-xs mt-1.5 font-medium text-slate-400 truncate">{sub}</div>}
      </div>
    </Card>
  );
}

function SectionTitle({ children, action }) {
  return (
    <div className="flex items-center justify-between mb-3 mt-6 first:mt-0">
      <h3 className="text-lg font-bold text-slate-900 tracking-tight">{children}</h3>
      {action}
    </div>
  );
}

function Empty({ text }) {
  return <div className="text-center py-10 px-4 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 text-sm font-medium text-slate-500">{text}</div>;
}

function RangeTabs({ value, onChange, options }) {
  const opts = options || [['today', 'Today'], ['week', '7 Days'], ['month', 'This Month'], ['all', 'All Time']];
  return (
    <div className="inline-flex rounded-xl bg-slate-100/80 p-1 shadow-inner overflow-x-auto max-w-full no-scrollbar">
      {opts.map(([id, label]) => (
        <button key={id} onClick={() => onChange(id)} className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${value === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}>
          {label}
        </button>
      ))}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block mb-4">
      <span className="block text-xs font-bold text-slate-700 mb-1.5">{label}</span>
      {children}
    </label>
  );
}

function TextInput(props) {
  return <input {...props} className={`w-full px-4 py-2.5 bg-white/70 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition-all text-slate-900 font-medium placeholder:font-normal placeholder:text-slate-400 ${props.className || ''}`} />;
}
function Select(props) {
  return <select {...props} className={`w-full px-4 py-2.5 bg-white/70 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition-all text-slate-900 font-medium ${props.className || ''}`} />;
}

/* --------------------------------- aggregation --------------------------------- */

function priceMapOf(types) { return Object.fromEntries(types.map(t => [t.id, Number(t.price) || 0])); }

function agentRows(agents, activities, types, range) {
  const pm = priceMapOf(types);
  return agents.map(a => {
    const own = activities.filter(x => x.agentPhone === a.phone && isInRange(x.date, range));
    const count = own.reduce((s, x) => s + Number(x.count || 0), 0);
    const value = own.reduce((s, x) => s + Number(x.count || 0) * (pm[x.typeId] || 0), 0);
    
    let totalTarget = 0;
    let targetObj = {};
    if (a.target && typeof a.target === 'object') {
      targetObj = a.target;
      totalTarget = Object.values(a.target).reduce((sum, val) => sum + (Number(val) || 0), 0);
    } else if (typeof a.target === 'number') {
      totalTarget = a.target; // backward compatibility
    }
    
    return { id: a.phone, name: a.name, phone: a.phone, count, value, target: totalTarget, targetObj };
  }).sort((a, b) => b.count - a.count);
}

function breakdown(activities, types, range) {
  const map = {};
  types.forEach(t => { map[t.id] = { id: t.id, name: t.name, count: 0 }; });
  activities.filter(x => isInRange(x.date, range)).forEach(x => {
    if (!map[x.typeId]) map[x.typeId] = { id: x.typeId, name: x.typeName || x.typeId, count: 0 };
    map[x.typeId].count += Number(x.count || 0);
  });
  return Object.values(map).filter(m => m.count > 0).sort((a, b) => b.count - a.count);
}

function downloadCSV(data, filename) {
  if (!data || !data.length) return;
  const keys = Object.keys(data[0]);
  const csv = [
    keys.join(','),
    ...data.map(row => keys.map(k => `"${String(row[k] || '').replace(/"/g, '""')}"`).join(','))
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
}

function ReportsView({ ctx }) {
  const { user, users, activities, logistics, types } = ctx;
  const [reportType, setReportType] = useState('transactions'); // 'transactions', 'activities', 'logistics'
  const [startDate, setStartDate] = useState(() => new Date(new Date().setDate(1)).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [agentFilter, setAgentFilter] = useState('all');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  // Determine which agents this user can see
  const teamPhones = useMemo(() => {
    if (user.role === 'admin' || user.role === 'super_admin') return null; // all
    if (user.role === 'supervisor') {
      const myAgents = users.filter(u => u.supervisorPhone === user.phone).map(u => u.phone);
      return [...myAgents, user.phone];
    }
    return [user.phone]; // agent
  }, [user, users]);

  const handleGenerate = async () => {
    setLoading(true);
    let raw = [];
    
    if (reportType === 'transactions') {
      // Fetch all transactions from KV store
      raw = await listAll('transactions:', true);
    } else if (reportType === 'activities') {
      raw = activities;
    } else if (reportType === 'logistics') {
      raw = logistics;
    }

    // Filter by date
    let filtered = raw.filter(row => {
      const rowDate = row.date || row.createdAt || row.created_at;
      if (!rowDate) return false;
      const d = rowDate.split('T')[0];
      return d >= startDate && d <= endDate;
    });

    // Filter by user role scoping
    if (teamPhones) {
      filtered = filtered.filter(row => {
        const phone = row.userPhone || row.agentPhone || row.requesterPhone;
        return teamPhones.includes(phone);
      });
    }

    // Filter by specific agent if supervisor/admin selected one
    if (agentFilter !== 'all') {
      filtered = filtered.filter(row => {
        const phone = row.userPhone || row.agentPhone || row.requesterPhone;
        return phone === agentFilter;
      });
    }

    // Sort descending
    filtered.sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt));

    // Format data for CSV readability
    const formatted = filtered.map(row => {
      const phone = row.userPhone || row.agentPhone || row.requesterPhone || 'N/A';
      const userRec = users.find(u => u.phone === phone);
      let supervisorName = 'N/A';
      if (userRec && userRec.supervisorPhone) {
        const supRec = users.find(u => u.phone === userRec.supervisorPhone);
        if (supRec) supervisorName = supRec.name;
      }

      const base = {
        Date: new Date(row.date || row.createdAt).toLocaleString(),
        User_Phone: phone,
        Agent_Name: userRec ? userRec.name : 'Unknown',
        Supervisor_Name: supervisorName,
      };
      
      if (reportType === 'transactions') {
        return { ...base, Service: row.serviceName, Cost: row.cost, Status: row.status, Details: row.detail || row.desc };
      }
      if (reportType === 'activities') {
        return { ...base, Type: row.typeName, Count: row.count, Note: row.note || '' };
      }
      if (reportType === 'logistics') {
        return { ...base, Item: row.item, Quantity: row.qty, Status: row.status, Note: row.note || '' };
      }
      return row;
    });

    setData(formatted);
    setLoading(false);
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <SectionTitle>Report Generator</SectionTitle>
      
      <Card className="p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Field label="Report Type">
            <Select value={reportType} onChange={e => setReportType(e.target.value)}>
              <option value="transactions">API Transactions</option>
              <option value="activities">Work Logs (Activities)</option>
              <option value="logistics">Logistics (Store)</option>
            </Select>
          </Field>
          <Field label="Start Date">
            <TextInput type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </Field>
          <Field label="End Date">
            <TextInput type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </Field>
          {(user.role === 'admin' || user.role === 'super_admin' || user.role === 'supervisor') && (
            <Field label="Agent Filter">
              <Select value={agentFilter} onChange={e => setAgentFilter(e.target.value)}>
                <option value="all">Entire Team / All</option>
                {users
                  .filter(u => u.role === 'agent')
                  .filter(u => user.role === 'supervisor' ? u.supervisorPhone === user.phone : true)
                  .map(u => <option key={u.phone} value={u.phone}>{u.name} ({u.phone})</option>)
                }
              </Select>
            </Field>
          )}
        </div>
        
        <div className="flex gap-3 justify-end border-t border-slate-100 pt-4">
          <Btn onClick={handleGenerate} disabled={loading} icon={loading ? Loader2 : FileText}>
            {loading ? 'Generating...' : 'Generate Report'}
          </Btn>
          {data.length > 0 && (
            <Btn tone="green" onClick={() => downloadCSV(data, `${reportType}_report_${startDate}_to_${endDate}.csv`)} icon={Download}>
              Download CSV ({data.length} records)
            </Btn>
          )}
        </div>
      </Card>

      {data.length > 0 && (
        <Card className="p-0 overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-200">
            <h4 className="font-bold text-slate-700">Report Preview (Top 50)</h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[10px] font-bold">
                <tr>
                  {Object.keys(data[0]).map(k => <th key={k} className="px-4 py-3">{k.replace(/_/g, ' ')}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.slice(0, 50).map((row, i) => (
                  <tr key={i} className="hover:bg-slate-50/50">
                    {Object.values(row).map((val, j) => <td key={j} className="px-4 py-3 text-slate-600">{val}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {data.length === 0 && !loading && (
        <Empty text="Configure your filters and click Generate Report to see data." />
      )}
    </div>
  );
}

/* ----------------------------------- app root ---------------------------------- */

export default function App() {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [types, setTypes] = useState(DEFAULT_TYPES);
  const [activities, setActivities] = useState([]);
  const [logistics, setLogistics] = useState([]);
  const [storeItems, setStoreItems] = useState(['NIN Capture Forms', 'SIM Starter Packs']);
  const [toast, setToast] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      processSyncQueue();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if (navigator.onLine) {
      processSyncQueue();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const flash = useCallback((msg, tone = 'default') => {
    setToast({ msg, tone });
    setTimeout(() => setToast(null), 3200);
  }, []);

  const loadAll = useCallback(async () => {
    setRefreshing(true);
    const [u, a, l, t, si] = await Promise.all([
      listAll('users:', true),
      listAll('activities:', true),
      listAll('logistics:', true),
      safeGet('activity_types', true),
      safeGet('store_items', true)
    ]);
    setUsers(u);
    setActivities(a);
    setLogistics(l);
    if (t) { try { setTypes(JSON.parse(t)); } catch (e) {} }
    else { await saveItem('activity_types', DEFAULT_TYPES, true); setTypes(DEFAULT_TYPES); }
    
    if (si) { try { setStoreItems(JSON.parse(si)); } catch (e) {} }
    else { await saveItem('store_items', JSON.stringify(['NIN Capture Forms', 'SIM Starter Packs']), true); setStoreItems(['NIN Capture Forms', 'SIM Starter Packs']); }
    
    setRefreshing(false);
  }, []);

  useEffect(() => {
    (async () => {
      await loadAll();
      const last = await safeGet('last_phone', false);
      if (last) {
        const raw = await safeGet(`users:${last}`, true);
        if (raw) { try { setUser(JSON.parse(raw)); } catch (e) {} }
      }
      setBooting(false);
    })();
  }, [loadAll]);

  const login = async (phone, pin) => {
    const raw = await safeGet(`users:${phone}`, true);
    if (!raw) return { ok: false, error: 'No account found with that phone number.' };
    let u;
    try {
      // Handle both string (TEXT column) and object (JSONB column) returns
      u = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (e) {
      return { ok: false, error: 'Account data corrupted. Please contact ICT support.' };
    }
    if (!u || typeof u !== 'object') return { ok: false, error: 'Account data corrupted. Please contact ICT support.' };
    const storedPin = String(u.pin || '').trim();
    const enteredPin = String(pin || '').trim();
    
    // Support both hashed PINs (pinHashed: true from old app) and plain text PINs
    let pinMatch = false;
    // Auto-detect hashed PINs: SHA-256 produces a 64-character hex string
    const looksHashed = /^[0-9a-f]{64}$/.test(storedPin);
    if (looksHashed || u.pinHashed === true) {
      // Hashed PIN — hash the entered PIN and compare
      const hashed = await hashPin(enteredPin);
      pinMatch = hashed === storedPin;
      // Fallback: also try plain text in case of migration edge cases
      if (!pinMatch) pinMatch = storedPin === enteredPin;
    } else {
      // Plain text PIN comparison
      pinMatch = storedPin === enteredPin;
    }
    
    console.log('[Login] stored:', storedPin.slice(0,8) + '...', '| looksHashed:', looksHashed, '| match:', pinMatch);
    if (!pinMatch) return { ok: false, error: 'Incorrect PIN.' };
    if (u.active === false) return { ok: false, error: 'This account has been deactivated. Contact your Admin.' };
    setUser(u);
    await saveItem('last_phone', phone, false);
    await loadAll();
    return { ok: true };
  };

  const signup = async (data) => {
    const existing = await safeGet(`users:${data.phone}`, true);
    if (existing) return { ok: false, error: 'That phone number is already registered. Please log in instead.' };
    const roleDef = ROLE_MAP[data.role];
    if (roleDef.needsCode && data.code !== ACCESS_CODE) return { ok: false, error: 'Incorrect agency access code for this role.' };
    const hashedPin = await hashPin(data.pin);
    const newUser = {
      phone: data.phone, name: data.name, pin: hashedPin, pinHashed: true, role: data.role,
      supervisorPhone: data.role === 'agent' ? (data.supervisorPhone || null) : undefined,
      active: true, createdAt: new Date().toISOString(), balance: 0,
    };
    await saveItem(`users:${data.phone}`, newUser, true);
    setUser(newUser);
    await saveItem('last_phone', data.phone, false);
    await loadAll();
    return { ok: true };
  };


  const logout = async () => { setUser(null); await saveItem('last_phone', '', false); };

  if (booting) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center font-sans">
        <Loader2 className="animate-spin text-amber-500" size={32} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-amber-200">
      {!isOnline && (
        <div className="bg-slate-900 text-amber-400 text-center py-1 text-xs font-bold uppercase tracking-widest fixed top-0 w-full z-[100] shadow-md flex items-center justify-center gap-2">
          <Activity size={14} /> Offline Mode (Features Limited)
        </div>
      )}
      <div className={!isOnline ? "pt-6" : ""}>
        {toast && (
          <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-50 px-4 py-3 w-[90vw] max-w-sm rounded-2xl shadow-xl flex items-start gap-3 transition-all transform animate-in fade-in slide-in-from-top-4 border ${
              toast.tone === 'red' ? 'bg-rose-50 text-rose-800 border-rose-200' : 
              toast.tone === 'green' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 
              'bg-white text-slate-800 border-slate-200'
            }`}>
            <div className={`shrink-0 mt-0.5 ${toast.tone === 'red' ? 'text-rose-600' : toast.tone === 'green' ? 'text-emerald-600' : 'text-slate-400'}`}>
               {toast.tone === 'red' ? <XCircle size={18} /> : toast.tone === 'green' ? <CheckCircle2 size={18} /> : <Activity size={18} />}
            </div>
            <div className="text-[13px] font-semibold leading-snug">
               {toast.msg}
            </div>
          </div>
        )}
        {!user ? (
          <AuthScreen onLogin={login} onSignup={signup} users={users} isOnline={isOnline} />
        ) : (
          <Dashboard
            user={user} setUser={setUser} users={users} types={types} activities={activities}
            logistics={logistics} storeItems={storeItems} onLogout={logout} refresh={loadAll} refreshing={refreshing} flash={flash} isOnline={isOnline}
          />
        )}
      </div>
    </div>
  );
}

/* ---------------------------------- auth screen --------------------------------- */

function AuthScreen({ onLogin, onSignup, users, isOnline }) {
  const [mode, setMode] = useState('login');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState('');
  const [role, setRole] = useState('agent');
  const [code, setCode] = useState('');
  const [supervisorPhone, setSupervisorPhone] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  const supervisors = users.filter(u => u.role === 'supervisor' && u.active !== false);

  const doLogin = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    const res = await onLogin(phone.trim(), pin.trim());
    setBusy(false);
    if (!res.ok) setErr(res.error);
  };

  const doSignup = async (e) => {
    e.preventDefault(); setErr('');
    if (!name.trim() || !phone.trim() || !pin.trim()) { setErr('Please fill in your name, phone and a PIN.'); return; }
    if (!/^\d{4,6}$/.test(pin)) { setErr('PIN must be 4–6 digits.'); return; }
    if (pin !== confirmPin) { setErr('PINs do not match.'); return; }
    setBusy(true);
    const res = await onSignup({ name: name.trim(), phone: phone.trim(), pin: pin.trim(), role, code, supervisorPhone: supervisorPhone || null });
    setBusy(false);
    if (!res.ok) setErr(res.error);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900 w-full absolute top-0 left-0">
      {/* Top Navigation Bar */}
      <header className="w-full bg-white/80 backdrop-blur-md border-b border-slate-200 px-6 py-4 flex justify-between items-center z-10">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-slate-900 text-white flex items-center justify-center rounded-full font-bold text-xl tracking-tighter shadow-sm overflow-hidden border border-slate-200">
            <img src={`${import.meta.env.BASE_URL}tunak-logo.jpg`} alt="Logo" className="w-full h-full object-cover" />
          </div>
          <div className="text-left hidden sm:block">
            <h1 className="text-xl font-bold tracking-tight text-slate-900 leading-none">TUNAK LEAD CONSULTING</h1>
            <p className="text-xs text-slate-500 mt-1 font-medium">Registration & agent performance tracker</p>
          </div>
        </div>
        <div className="space-x-2 sm:space-x-4 flex">
          <button onClick={() => { setMode('signup'); setErr(''); }} className={`px-4 py-2 text-sm font-semibold transition-colors ${mode === 'signup' ? 'text-amber-600' : 'text-slate-600 hover:text-slate-900'}`}>Register</button>
          <button onClick={() => { setMode('login'); setErr(''); }} className={`px-5 py-2 text-sm font-semibold rounded-lg transition-all shadow-md ${mode === 'login' ? 'bg-slate-900 text-white hover:bg-slate-800' : 'bg-white text-slate-900 border border-slate-200 hover:bg-slate-50'}`}>Log In</button>
        </div>
      </header>

      {/* Main Glassmorphism Container */}
      <main className="flex-grow flex items-center justify-center p-4 sm:p-6 relative">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 sm:w-96 sm:h-96 bg-amber-100 rounded-full blur-3xl opacity-50 pointer-events-none"></div>
        
        <div className="w-full max-w-md bg-white/70 backdrop-blur-xl border border-white/40 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6 sm:p-8 relative z-10 overflow-y-auto max-h-[85vh] fl-scroll">
          <h2 className="text-2xl font-bold text-slate-900 text-center mb-6 tracking-tight">
            {mode === 'login' ? 'Log In to Field Ledger' : 'Create an Account'}
          </h2>

          {mode === 'login' ? (
            <form className="flex flex-col space-y-5" onSubmit={doLogin}>
              <div className="flex flex-col items-start w-full">
                <label className="text-sm font-semibold text-slate-700 mb-2">Phone Number</label>
                <div className="relative w-full">
                  <input 
                    type="tel" 
                    value={phone} onChange={e => setPhone(e.target.value)}
                    placeholder="080..." 
                    className="w-full px-4 py-3 bg-white/50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition-all text-slate-900 font-medium placeholder:font-normal" 
                  />
                </div>
              </div>

              <div className="flex flex-col items-start w-full">
                <label className="text-sm font-semibold text-slate-700 mb-2">PIN</label>
                <div className="relative w-full">
                  <input 
                    type={showPin ? 'text' : 'password'}
                    value={pin} onChange={e => setPin(e.target.value)}
                    placeholder="••••" 
                    className="w-full px-4 py-3 bg-white/50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition-all text-slate-900 font-medium" 
                  />
                  <button type="button" onClick={() => setShowPin(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {showPin ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {err && <div className="flex items-center gap-1.5 text-sm text-red-600 bg-red-50 p-3 rounded-lg"><AlertCircle size={16} />{err}</div>}

              <button 
                type="submit" 
                disabled={busy}
                className="w-full mt-2 bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold py-3.5 rounded-xl shadow-sm transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
              >
                <span>{busy ? 'Checking…' : 'Log In'}</span>
                {!busy && <ArrowRight size={18} strokeWidth={2.5} />}
              </button>
            </form>
          ) : (
            <form className="flex flex-col space-y-4" onSubmit={doSignup}>
              <div className="flex flex-col items-start w-full">
                <label className="text-sm font-semibold text-slate-700 mb-1">Full Name</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Chidi Okafor" className="w-full px-4 py-2.5 bg-white/50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition-all text-slate-900 font-medium" />
              </div>
              
              <div className="flex flex-col items-start w-full">
                <label className="text-sm font-semibold text-slate-700 mb-1">Phone Number</label>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="080..." className="w-full px-4 py-2.5 bg-white/50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition-all text-slate-900 font-medium" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col items-start w-full">
                  <label className="text-sm font-semibold text-slate-700 mb-1">PIN</label>
                  <input type="password" value={pin} onChange={e => setPin(e.target.value)} placeholder="4-6 digits" className="w-full px-4 py-2.5 bg-white/50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition-all text-slate-900 font-medium" />
                </div>
                <div className="flex flex-col items-start w-full">
                  <label className="text-sm font-semibold text-slate-700 mb-1">Confirm PIN</label>
                  <input type="password" value={confirmPin} onChange={e => setConfirmPin(e.target.value)} placeholder="4-6 digits" className="w-full px-4 py-2.5 bg-white/50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition-all text-slate-900 font-medium" />
                </div>
              </div>

              <label className="text-sm font-semibold text-slate-700 mt-2">Your Role</label>
              <div className="grid grid-cols-2 gap-2">
                {ROLES.map(r => (
                  <button type="button" key={r.id} onClick={() => setRole(r.id)}
                    className={`text-left p-3 rounded-xl border transition-all ${role === r.id ? 'border-amber-500 bg-amber-50 shadow-sm' : 'border-slate-200 bg-white/50 hover:bg-white'}`}>
                    <div className="flex items-center gap-2 mb-1 text-slate-900"><r.icon size={16} /><span className="text-sm font-bold">{r.label}</span></div>
                    <div className="text-[10px] text-slate-500 leading-tight">{r.desc}</div>
                  </button>
                ))}
              </div>

              {role === 'agent' && (
                <div className="flex flex-col items-start w-full mt-2">
                  <label className="text-sm font-semibold text-slate-700 mb-1">Your Supervisor (optional)</label>
                  <select value={supervisorPhone} onChange={e => setSupervisorPhone(e.target.value)} className="w-full px-4 py-2.5 bg-white/50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition-all text-slate-900 font-medium">
                    <option value="">Not assigned yet</option>
                    {supervisors.map(s => <option key={s.phone} value={s.phone}>{s.name}</option>)}
                  </select>
                </div>
              )}

              {ROLE_MAP[role].needsCode && (
                <div className="flex flex-col items-start w-full mt-2">
                  <label className="text-sm font-semibold text-slate-700 mb-1">Agency Access Code</label>
                  <input type="text" value={code} onChange={e => setCode(e.target.value)} placeholder="Enter code" className="w-full px-4 py-2.5 bg-white/50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition-all text-slate-900 font-medium" />
                </div>
              )}

              {err && <div className="flex items-center gap-1.5 text-sm text-red-600 bg-red-50 p-3 rounded-lg mt-2"><AlertCircle size={16} />{err}</div>}
              
              {!isOnline && (
                <div className="flex items-center gap-1.5 text-sm text-amber-700 bg-amber-50 p-3 rounded-lg border border-amber-200 mt-2">
                  <Activity size={16} /> You must be online to create a new account.
                </div>
              )}

              <button type="submit" disabled={busy || !isOnline} className="w-full mt-4 bg-slate-900 hover:bg-slate-800 text-white font-bold py-3.5 rounded-xl shadow-sm transition-all flex items-center justify-center space-x-2 disabled:opacity-50">
                <span>{busy ? 'Creating account…' : 'Create Account'}</span>
                {!busy && <ArrowRight size={18} strokeWidth={2.5} />}
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}

/* ----------------------------------- dashboard shell ----------------------------------- */

const NAV = {
  agent: [['log', 'Log Work', ClipboardList], ['stats', 'My Stats', TrendingUp], ['verify', 'Live Verify', Search], ['wallet', 'Wallet', Wallet], ['reports', 'Reports', FileText], ['supplies', 'Supplies', Package], ['profile', 'Profile', User]],
  supervisor: [['team', 'My Team', Users], ['log', 'Log Work', ClipboardList], ['verify', 'Live Verify', Search], ['wallet', 'Wallet', Wallet], ['reports', 'Reports', FileText], ['supplies', 'Supplies', Package], ['profile', 'Profile', User]],
  ict: [['queue', 'Print Queue', Printer], ['profile', 'Profile', User]],
  store: [['requests', 'Requests', Boxes], ['profile', 'Profile', User]],
  admin: [['overview', 'Overview', Home], ['log', 'Log Work', ClipboardList], ['verify', 'Live Verify', Search], ['wallet', 'Wallet', Wallet], ['reports', 'Reports', FileText], ['teams', 'Supervisors', Users], ['staff', 'Staff', UserPlus], ['requests', 'Logistics', Boxes], ['profile', 'Profile', User]],
  super_admin: [['overview', 'Overview', Home], ['log', 'Log Work', ClipboardList], ['verify', 'Live Verify', Search], ['wallet', 'Wallet', Wallet], ['settings', 'Settings & Services', Settings], ['reports', 'Reports', FileText], ['teams', 'Supervisors', Users], ['staff', 'Staff', UserPlus], ['requests', 'Logistics', Boxes], ['profile', 'Profile', User]],
};

function Dashboard({ user, setUser, users, types, activities, logistics, storeItems, onLogout, refresh, refreshing, flash, isOnline }) {
  const nav = NAV[user.role];
  const [view, setView] = useState(nav[0][0]);
  const roleDef = ROLE_MAP[user.role];
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => document.documentElement.classList.contains('dark'));

  const toggleDarkMode = () => {
    if (isDarkMode) {
      document.documentElement.classList.remove('dark');
      setIsDarkMode(false);
    } else {
      document.documentElement.classList.add('dark');
      setIsDarkMode(true);
    }
  };

  const mobileNavLimit = 4;
  const mainNavItems = nav.length > mobileNavLimit ? nav.slice(0, mobileNavLimit - 1) : nav;
  const moreNavItems = nav.length > mobileNavLimit ? nav.slice(mobileNavLimit - 1) : [];

  const handleNavClick = (id) => {
    setView(id);
    setShowMoreMenu(false);
  };

  const ctx = { user, setUser, users, types, activities, logistics, storeItems, refresh, flash, isOnline };

  return (
    <div className="flex min-h-screen bg-slate-50 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-amber-100/40 via-slate-50 to-slate-100">
      {/* desktop sidebar */}
      <div className="hidden md:flex flex-col w-64 shrink-0 bg-slate-900 text-slate-300 border-r border-slate-800 shadow-2xl z-20">
        <div className="w-full flex flex-col h-full">
          <div className="p-6 flex items-center gap-3">
            <div className="w-10 h-10 bg-white text-slate-900 flex items-center justify-center rounded-xl font-black text-xl shadow-lg overflow-hidden shrink-0">
              <img src={`${import.meta.env.BASE_URL}tunak-logo.jpg`} alt="Logo" className="w-full h-full object-cover" />
            </div>
            <div className="font-bold tracking-tight text-white text-sm leading-tight uppercase">TUNAK LEAD<br/><span className="text-amber-400">CONSULTING</span></div>
          </div>
          
          <nav className="mt-4 px-4 flex-1 space-y-1.5">
            {nav.map(([id, label, Icon]) => {
              const active = view === id;
              return (
                <button key={id} onClick={() => setView(id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all group ${active ? 'bg-amber-500/10 text-amber-400' : 'hover:bg-slate-800/50 hover:text-white'}`}>
                  <Icon size={18} className={active ? 'text-amber-500' : 'text-slate-500 group-hover:text-slate-400 transition-colors'} />
                  {label}
                </button>
              );
            })}
          </nav>

          <div className="p-4 border-t border-slate-800/50 space-y-1.5">
            <button onClick={() => window.open('https://wa.me/2348166341476', '_blank')} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-sky-400 hover:bg-slate-800/50 transition-all">
              <HelpCircle size={18} /> ICT Support
            </button>
            <button onClick={toggleDarkMode} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-slate-400 hover:text-white hover:bg-slate-800/50 transition-all">
              {isDarkMode ? <Sun size={18} className="text-amber-400" /> : <Moon size={18} />} {isDarkMode ? 'Light Mode' : 'Dark Mode'}
            </button>
            <button onClick={onLogout} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-slate-400 hover:text-rose-400 hover:bg-slate-800/50 transition-all">
              <LogOut size={18} /> Log Out
            </button>
          </div>
        </div>
      </div>

      {/* main */}
      <div className="flex-1 min-w-0 flex flex-col h-screen overflow-hidden relative">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-amber-100 rounded-full blur-[100px] opacity-40 pointer-events-none -translate-y-1/2 translate-x-1/3"></div>
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-blue-50 rounded-full blur-[100px] opacity-60 pointer-events-none translate-y-1/3 -translate-x-1/4"></div>

        <header className="flex items-center justify-between px-6 py-4 bg-white/70 backdrop-blur-xl border-b border-slate-200/60 sticky top-0 z-10">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-0.5">{roleDef.label}</div>
            <div className="text-2xl font-black text-slate-900 leading-none">Hi, {user.name.split(' ')[0]}</div>
          </div>
          <div className="flex items-center gap-4">
            {user.role !== 'ict' && user.role !== 'store' && (
              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 rounded-full border border-amber-200 text-amber-700 shadow-inner">
                <Wallet size={14} className="opacity-70" />
                <span className="text-sm font-bold tracking-tight">{fmtNaira(user.balance || 0)}</span>
              </div>
            )}
            <button onClick={refresh} className="p-2.5 rounded-full bg-white border border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-50 shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-amber-500/30" title="Refresh">
              <RefreshCw size={16} className={refreshing ? 'animate-spin text-amber-500' : ''} />
            </button>
            <Avatar name={user.name} size={42} />
          </div>
        </header>

        <div className="flex-1 overflow-y-auto fl-scroll p-4 md:p-8 pb-28 md:pb-8 relative z-0">
          <div className="max-w-6xl mx-auto">
            {view === 'log' && <AgentLog ctx={ctx} />}
            {view === 'verify' && <LiveVerification ctx={ctx} />}
            {view === 'stats' && <AgentStats ctx={ctx} />}
            {view === 'supplies' && <SuppliesPanel ctx={ctx} />}
            {view === 'team' && <SupervisorTeam ctx={ctx} />}
            {view === 'queue' && <PrintQueue ctx={ctx} />}
            {view === 'requests' && (user.role === 'store' ? <StoreRequests ctx={ctx} /> : <AdminRequestsView ctx={ctx} />)}
            {view === 'overview' && <OrgOverview ctx={ctx} />}
            {view === 'teams' && <SupervisorsBreakdown ctx={ctx} />}
            {view === 'staff' && <StaffManager ctx={ctx} />}
            {view === 'settings' && <SettingsManager ctx={ctx} />}
            {view === 'wallet' && <WalletView ctx={ctx} />}
            {view === 'reports' && <ReportsView ctx={ctx} />}
            {view === 'profile' && <ProfilePanel ctx={ctx} onLogout={onLogout} />}
          </div>
        </div>
      </div>

      {/* mobile bottom nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 flex bg-white/90 backdrop-blur-lg border-t border-slate-200 pb-safe z-40 shadow-[0_-4px_20px_rgb(0,0,0,0.05)]">
        {mainNavItems.map(([id, label, Icon]) => {
          const active = view === id;
          return (
            <button key={id} onClick={() => handleNavClick(id)} className="flex-1 flex flex-col items-center gap-1 py-3 focus:outline-none">
              <Icon size={20} className={`transition-colors ${active ? 'text-amber-500' : 'text-slate-400'}`} />
              <span className={`text-[10px] font-bold transition-colors ${active ? 'text-slate-900' : 'text-slate-500'}`}>{label}</span>
            </button>
          );
        })}
        
        {moreNavItems.length > 0 && (
          <button onClick={() => setShowMoreMenu(true)} className="flex-1 flex flex-col items-center gap-1 py-3 focus:outline-none">
            <Grid size={20} className="text-slate-400" />
            <span className="text-[10px] font-bold text-slate-500">More</span>
          </button>
        )}
      </div>

      {/* mobile more options overlay */}
      {showMoreMenu && (
        <div className="md:hidden fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowMoreMenu(false)}></div>
          <div className="relative w-full max-w-md bg-slate-900 rounded-t-3xl p-6 pb-safe shadow-2xl animate-in slide-in-from-bottom border-t border-slate-800">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xs font-bold tracking-widest text-slate-400 uppercase">More Options</h3>
              <button onClick={() => setShowMoreMenu(false)} className="p-2 -mr-2 text-slate-400 hover:text-white rounded-full bg-slate-800/50">
                <X size={16} />
              </button>
            </div>
            
            <div className="grid grid-cols-4 gap-y-8 gap-x-2">
              {moreNavItems.map(([id, label, Icon]) => {
                const active = view === id;
                return (
                  <button key={id} onClick={() => handleNavClick(id)} className="flex flex-col items-center gap-2 focus:outline-none group">
                    <Icon size={24} className={active ? 'text-amber-400' : 'text-slate-400 group-hover:text-slate-300'} />
                    <span className={`text-[10px] font-bold text-center ${active ? 'text-amber-400' : 'text-slate-400 group-hover:text-slate-300'}`}>{label}</span>
                  </button>
                );
              })}
              
              <button onClick={toggleDarkMode} className="flex flex-col items-center gap-2 focus:outline-none group">
                {isDarkMode ? (
                  <Sun size={24} className="text-amber-400" />
                ) : (
                  <Moon size={24} className="text-slate-400 group-hover:text-slate-300" />
                )}
                <span className={`text-[10px] font-bold text-center ${isDarkMode ? 'text-amber-400' : 'text-slate-400 group-hover:text-slate-300'}`}>
                  {isDarkMode ? 'Light' : 'Dark'}
                </span>
              </button>

              <button onClick={() => window.open('https://wa.me/2348166341476', '_blank')} className="flex flex-col items-center gap-2 focus:outline-none group">
                <HelpCircle size={24} className="text-sky-400" />
                <span className="text-[10px] font-bold text-center text-sky-400 group-hover:text-sky-300">ICT Support</span>
              </button>

              <button onClick={onLogout} className="flex flex-col items-center gap-2 focus:outline-none group">
                <LogOut size={24} className="text-rose-400" />
                <span className="text-[10px] font-bold text-center text-rose-400 group-hover:text-rose-300">Log Out</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ----------------------------------- LIVE VERIFICATION ----------------------------------- */

function LiveVerification({ ctx }) {
  const { types, user, setUser, refresh, flash } = ctx;
  const [selectedService, setSelectedService] = useState(null);
  const [formData, setFormData] = useState({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const SERVICES = [
    { id: 'nin-verification', provider: 'fasterverify', label: 'NIN Verification', desc: 'Verify via 11-digit NIN', icon: Fingerprint, price: 500, endpoint: 'nin/verify', method: 'POST' },
    { id: 'nin-phone', provider: 'fasterverify', label: 'NIN by Phone', desc: 'Search NIN using phone number', icon: Smartphone, price: 500, endpoint: 'nin/phone', method: 'POST' },
    { id: 'nin-tracking', provider: 'fasterverify', label: 'NIN Tracking ID', desc: 'Search using slip tracking ID', icon: Navigation, price: 600, endpoint: 'personalization/submit', method: 'POST' },
    { id: 'nin-demography', provider: 'fasterverify', label: 'NIN Demography', desc: 'Search by exact demographics', icon: Users, price: 500, endpoint: 'nin/demographic', method: 'POST' },
    { id: 'bvn-verification', provider: 'fasterverify', label: 'BVN Verification', desc: 'Verify via 11-digit BVN', icon: ShieldCheck, price: 500, endpoint: 'bvn/verify-basic', method: 'POST' },
    { id: 'bvn-phone', provider: 'fasterverify', label: 'BVN by Phone', desc: 'Search BVN using phone number', icon: Smartphone, price: 500, endpoint: 'bvn/verify-advance', method: 'POST' },
    { id: 'ipe-clearance', provider: 'fasterverify', label: 'IPE Clearance', desc: 'Submit IPE tracking ID', icon: FileCheck, price: 1500, endpoint: 'ipe/clearance', method: 'POST' },
    { id: 'ipe-status', provider: 'fasterverify', label: 'IPE Status', desc: 'Check IPE clearance status', icon: Activity, price: 0, endpoint: 'ipe/status', method: 'POST' },
    { id: 'nin-validation', provider: 'fasterverify', label: 'NIN Validation', desc: 'Submit NIN for validation', icon: ShieldCheck, price: 1500, endpoint: 'nin/validation', method: 'POST' },
    { id: 'nin-validation-status', provider: 'fasterverify', label: 'NIN Validation Status', desc: 'Check validation status', icon: Activity, price: 0, endpoint: 'nin/validation-status', method: 'POST' },
  ];

  const handleSelectService = (s) => {
    setSelectedService(s);
    setFormData({});
    setResult(null);
  };

  const handleChange = (field, val) => {
    setFormData(prev => ({ ...prev, [field]: val }));
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    flash('Copied to clipboard!', 'green');
  };

  const doVerify = async (e) => {
    e.preventDefault();
    setBusy(true); setResult(null);

    const isFasterVerify = selectedService.provider === 'fasterverify';
    const checkmyninKey = await safeGet('api_key', true);
    const fasterverifyKey = await safeGet('fasterverify_key', true);
    const key = isFasterVerify ? (import.meta.env.VITE_FASTERVERIFY_KEY || fasterverifyKey) : (import.meta.env.VITE_API_KEY || checkmyninKey);

    if (!key) {
      flash(`API Key for ${isFasterVerify ? 'FasterVerify' : 'CheckMyNINBVN'} not configured. Ask Super Admin.`, 'red');
      setBusy(false); return;
    }

    let payload = { ...formData };
    
    // Payload translations for FasterVerify
    if (isFasterVerify) {
      if (selectedService.id === 'nin-demography') {
        payload = { first_name: formData.firstname, last_name: formData.lastname, gender: formData.gender, dob: formData.dob };
      } else if (selectedService.id === 'nin-tracking') {
        payload = { tracking_id: formData.tracking_id, slip_type: 'standard' };
      }
    } else {
      payload.consent = true;
      if (selectedService.serviceType) payload.service_type = selectedService.serviceType;
    }

    try {
      let res;
      let data;
      const cost = selectedService.price;
      if (cost > 0) {
        if ((user.balance || 0) < cost) {
          flash(`Insufficient funds. Please top up your wallet (Requires ₦${fmtNaira(cost)}).`, 'red');
          setBusy(false); return;
        }
      }

      if (isFasterVerify && supabase) {
        const { data: edgeData, error: edgeError } = await supabase.functions.invoke('api-proxy', {
          body: { 
            provider: 'fasterverify', 
            endpoint: selectedService.endpoint, 
            payload: payload, 
            idempotency_key: uid() 
          }
        });

        if (edgeError) {
           console.error("Edge Function Error:", edgeError);
           // Supabase-js wrap 4xx/5xx in FunctionsHttpError. The actual response is in edgeError.context
           try {
             if (edgeError.context && typeof edgeError.context.json === 'function') {
               data = await edgeError.context.json();
             } else if (edgeError.context && typeof edgeError.context.text === 'function') {
               data = JSON.parse(await edgeError.context.text());
             } else {
               const errStr = typeof edgeError.context === 'string' ? edgeError.context : edgeError.message;
               data = JSON.parse(errStr);
             }
           } catch {
             data = { message: edgeError.message || 'API Proxy Failed', success: false };
           }
           res = { ok: false };
        } else {
           data = edgeData;
           // The Edge Function now always returns HTTP 200, but injects edge_status for 4xx/5xx
           if (data.edge_status && data.edge_status >= 400) {
             res = { ok: false };
             if (data.error === 'insufficient_balance' || (data.message && data.message.includes('Insufficient wallet'))) {
               data.message = 'Verification service temporarily unavailable. Please contact ICT Support.';
             }
             if (data.error && !data.message) data.message = data.error;
           } else {
             res = { ok: true };
           }
        }
      } else {
        // Fallback for checkmynin
        const proxyPath = isFasterVerify ? 'https://fasterverify.com.ng/api/v1' : 'https://checkmyninbvn.com.ng/api';
        const headers = isFasterVerify 
          ? { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` }
          : { 'Content-Type': 'application/json', 'x-api-key': key };

        if (selectedService.method === 'GET') {
          const queryParams = new URLSearchParams(payload).toString();
          res = await fetch(`${proxyPath}/${selectedService.endpoint}?${queryParams}`, { headers });
        } else {
          res = await fetch(`${proxyPath}/${selectedService.endpoint}`, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
          });
        }
        data = await res.json();
      }
      const isSuccess = data.status === 'success' || data.success === true || data.status === true || data.data || data.photo || data.slip_image || data.slip;
      const shouldCharge = isFasterVerify ? res.ok : isSuccess; // FasterVerify charges per hit (even if not found)

      if (shouldCharge && cost > 0) {
        const updatedUser = { ...user, balance: (user.balance || 0) - cost };
        setUser(updatedUser); // assume setUser is not strictly needed here but user object is updated
        await saveItem(`users:${user.phone}`, updatedUser, true);
        const tx = { id: uid(), userPhone: user.phone, type: 'deduction', amount: cost, desc: `API Call - ${selectedService.label}`, date: new Date().toISOString() };
        await saveItem(`transactions:${tx.id}`, tx, true);
      }

      if (isSuccess) {
        // Normalize FasterVerify differences
        let normalizedData = data.data ? { ...data.data, ...data } : { ...data };
        
        // Handle image inconsistencies (base64Image from BVN, photo from NIN)
        if (normalizedData.base64Image && !normalizedData.photo) {
          normalizedData.photo = normalizedData.base64Image;
        }

        if (isFasterVerify) {
          if (normalizedData.first_name) normalizedData.firstname = normalizedData.first_name;
          if (normalizedData.middle_name) normalizedData.middlename = normalizedData.middle_name;
        }

        // Map names and fields
        if (normalizedData.first_name || normalizedData.firstName) normalizedData.firstname = normalizedData.first_name || normalizedData.firstName;
        if (normalizedData.last_name || normalizedData.lastName) normalizedData.surname = normalizedData.last_name || normalizedData.lastName;
        if (normalizedData.birthdate || normalizedData.dateOfBirth || normalizedData.date_of_birth) normalizedData.dob = normalizedData.birthdate || normalizedData.dateOfBirth || normalizedData.date_of_birth;
        if (normalizedData.address || normalizedData.residentialAddress) normalizedData.residence_address = normalizedData.address || normalizedData.residentialAddress;
        if (normalizedData.phoneNumber1) normalizedData.phone = normalizedData.phoneNumber1;

        const isStatusCheck = data.verification_status !== 'completed' && data.verification_status !== 'verified';

        setResult({ ...normalizedData, isModification: !!selectedService.serviceType, isStatusCheck });

        // LOG TO LEDGER AUTOMATICALLY
        const entry = {
          id: uid(), agentPhone: user.phone, agentName: user.name, supervisorPhone: user.supervisorPhone || null,
          typeId: selectedService.id, typeName: `Live Verify: ${selectedService.label}`, count: 1, date: new Date().toISOString().split('T')[0], note: 'API Verification',
          paymentMethod: 'wallet',
          isPartialPayment: false, debtors: [],
          totalAmount: cost, amountPaid: cost, balance: 0,
          createdAt: new Date().toISOString(), printStatus: null,
          issuedAtmCard: false,
          printFileUrls: [],
          printFileNames: [],
          printFiles: [{
             url: null, // no pdf yet
             filename: `${normalizedData.nin || normalizedData.tracking_id || selectedService.id}.json`,
             extractedName: `${normalizedData.firstname || ''} ${normalizedData.surname || ''}`.trim(),
             nin: normalizedData.nin || '',
             dob: normalizedData.dob || '',
             isVerifyResult: true,
             verifyData: normalizedData // Raw data cleanly stored in Supabase under activities
          }]
        };
        await saveItem(`activities:${entry.id}`, entry, true);

        flash(data.message || 'Operation successful', 'green');
      } else {
        flash(data.message || 'Operation failed or not found', 'red');
      }
    } catch (err) {
      console.error("doVerify Error:", err);
      flash(err.message ? `App Error: ${err.message}` : 'Network error connecting to API.', 'red');
    }
    setBusy(false);
  };

  const logToLedger = async () => {
    let typeId = null;
    if (selectedService.id.includes('nin')) typeId = types.find(t => t.id === 'nin')?.id;
    if (selectedService.id.includes('bvn')) typeId = types.find(t => t.id === 'bvn')?.id;

    if (!typeId) {
      flash('Service type not active in ledger.', 'red'); return;
    }
    const t = types.find(x => x.id === typeId);
    const entry = {
      id: uid(), agentPhone: user.phone, agentName: user.name, supervisorPhone: user.supervisorPhone || null,
      typeId, typeName: t ? t.name : typeId, count: 1, date: todayStr(), note: `Verified via API (${selectedService.label})`,
      createdAt: new Date().toISOString(), printStatus: t && t.requiresPrinting ? 'pending' : null,
    };
    await saveItem(`activities:${entry.id}`, entry, true);
    await refresh();
    flash('Automatically logged to your ledger!', 'green');
  };

  const renderSlipTypeSelect = () => (
    <>
      <Field label="Desired Slip Type (FasterVerify)">
        <Select value={formData.slip_type || ''} onChange={e => handleChange('slip_type', e.target.value)}>
          <option value="">No Slip / Data Only</option>
          <option value="premium">Premium Slip (₦500)</option>
          <option value="standard">Standard Slip (₦500)</option>
          <option value="regular">Regular Slip (₦500)</option>
          <option value="information">Information Slip (₦500)</option>
          <option value="vnin">vNIN Slip (₦500)</option>
        </Select>
      </Field>
      {formData.slip_type && (
        <div className="mt-2 p-3 bg-white border border-slate-200 rounded-xl shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sample Preview</div>
            <div className="text-xs font-bold text-blue-600 capitalize">{formData.slip_type} Slip</div>
          </div>
          <img 
            src={`${import.meta.env.BASE_URL}previews/${formData.slip_type}.png`} 
            alt={`${formData.slip_type} preview`} 
            className="w-full h-auto rounded-lg border border-slate-100 shadow-sm"
            onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
          />
          <div className="hidden h-32 flex-col items-center justify-center text-slate-400 text-xs border-2 border-dashed border-slate-200 rounded-lg bg-slate-50">
            <span>Save your sample image as:</span>
            <strong className="mt-1">/public/previews/{formData.slip_type}.png</strong>
          </div>
        </div>
      )}
    </>
  );

  const renderFormFields = () => {
    const s = selectedService;
    if (s.id === 'nin-verification') {
      return (
        <>
          <Field label="11-Digit NIN"><TextInput value={formData.nin || ''} onChange={e => handleChange('nin', e.target.value)} /></Field>
          {renderSlipTypeSelect()}
        </>
      );
    }
    if (s.id === 'nin-phone') {
      return (
        <>
          <Field label="Phone Number"><TextInput value={formData.phone || ''} onChange={e => handleChange('phone', e.target.value)} /></Field>
          {renderSlipTypeSelect()}
        </>
      );
    }
    if (s.id === 'bvn-phone') {
      return <Field label="Phone Number"><TextInput value={formData.phone || ''} onChange={e => handleChange('phone', e.target.value)} /></Field>;
    }
    if (s.id === 'nin-tracking') {
      return (
        <>
          <Field label="Tracking ID"><TextInput value={formData.tracking_id || ''} onChange={e => handleChange('tracking_id', e.target.value)} /></Field>
          {renderSlipTypeSelect()}
        </>
      );
    }
    if (s.id === 'ipe-clearance' || s.id === 'ipe-status') {
      return <Field label="Tracking ID"><TextInput value={formData.tracking_id || ''} onChange={e => handleChange('tracking_id', e.target.value)} /></Field>;
    }
    if (s.id === 'bvn-verification') {
      return <Field label="11-Digit BVN"><TextInput value={formData.bvn || ''} onChange={e => handleChange('bvn', e.target.value)} /></Field>;
    }
    if (s.id === 'nin-validation' || s.id === 'nin-validation-status') {
      return <Field label="11-Digit NIN"><TextInput value={formData.nin || ''} onChange={e => handleChange('nin', e.target.value)} /></Field>;
    }
    if (s.id === 'nin-demography') {
      return <>
        <Field label="First Name"><TextInput value={formData.firstname || ''} onChange={e => handleChange('firstname', e.target.value)} /></Field>
        <Field label="Last Name"><TextInput value={formData.lastname || ''} onChange={e => handleChange('lastname', e.target.value)} /></Field>
        <Field label="Gender">
          <Select value={formData.gender || ''} onChange={e => handleChange('gender', e.target.value)}>
            <option value="">Select Gender...</option><option value="male">Male</option><option value="female">Female</option>
          </Select>
        </Field>
        <Field label="Date of Birth (YYYY-MM-DD)"><TextInput type="date" value={formData.dob || ''} onChange={e => handleChange('dob', e.target.value)} /></Field>
        {renderSlipTypeSelect()}
      </>;
    }
    return null;
  };

  return (
    <div className="max-w-4xl mx-auto pb-10">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-black tracking-tight text-slate-900">Live API Hub</h2>
        {selectedService && (
          <Btn size="sm" tone="ghost" onClick={() => setSelectedService(null)}>Back to Services</Btn>
        )}
      </div>
      
      {!selectedService ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 animate-in fade-in slide-in-from-bottom-4">
          {SERVICES.map(s => (
            <button key={s.id} onClick={() => handleSelectService(s)} className="text-left bg-white/80 backdrop-blur-xl p-6 rounded-2xl border border-white/60 shadow-xl shadow-slate-200/40 hover:-translate-y-1 hover:shadow-2xl hover:border-amber-400/50 focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all duration-300 group flex flex-col h-full">
              <div className="flex items-start justify-between mb-5">
                <div className="w-14 h-14 bg-slate-50 group-hover:bg-amber-100 rounded-2xl flex items-center justify-center transition-colors duration-300 shadow-inner">
                  <s.icon size={26} className="text-slate-600 group-hover:text-amber-600 transition-colors duration-300" />
                </div>
                <div className="text-right">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Fee</div>
                  <div className="font-black text-slate-900">{s.price === 0 ? 'Free' : fmtNaira(s.price)}</div>
                </div>
              </div>
              <h3 className="font-bold text-slate-900 text-lg mb-1">{s.label}</h3>
              <p className="text-sm font-medium text-slate-500 line-clamp-2">{s.desc}</p>
            </button>
          ))}
        </div>
      ) : (
        <div className="animate-in slide-in-from-right-8 fade-in">
          <Card className="p-6 mb-8 border-t-4 border-t-amber-500">
            <div className="flex items-center gap-4 mb-6 pb-6 border-b border-slate-100">
              <div className="w-14 h-14 bg-amber-100 rounded-2xl flex items-center justify-center shrink-0">
                <selectedService.icon size={28} className="text-amber-600" />
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-900">{selectedService.label}</h3>
                <p className="text-sm font-medium text-slate-500">{selectedService.desc} • {selectedService.price === 0 ? 'Free Service' : `Total Cost: ${fmtNaira(selectedService.price)}`}</p>
              </div>
            </div>
            
            <form onSubmit={doVerify} className="space-y-4">
              {renderFormFields()}
              
              {!selectedService.isStatusCheck && (
                <div className="flex items-start gap-3 bg-amber-50 p-4 rounded-xl mt-6">
                  <ShieldCheck size={20} className="text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800 leading-relaxed font-medium">
                    <strong>Compliance Notice:</strong> By proceeding, you confirm you have obtained explicit consent from the data subject as required by the NDPA. Queries are strictly logged.
                  </p>
                </div>
              )}
              
              {!ctx.isOnline && (
                <div className="flex items-center gap-1.5 text-sm text-amber-700 bg-amber-50 p-3 rounded-lg border border-amber-200 mt-2">
                  <Activity size={16} /> Live verification is not available offline.
                </div>
              )}

              <div className="pt-4">
                <Btn type="submit" full disabled={busy || !ctx.isOnline} size="lg" icon={busy ? Loader2 : CheckCircle2}>
                  {busy ? 'Processing via API…' : `Submit ${selectedService.label}`}
                </Btn>
              </div>
            </form>
          </Card>

          {result && (
            <div className="animate-in fade-in slide-in-from-bottom-4">
              <SectionTitle>Operation Result</SectionTitle>
              
              {result.isModification ? (
                <Card className="p-8 text-center bg-emerald-50 border-emerald-200">
                  <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4"><Check size={32} /></div>
                  <h3 className="text-2xl font-black text-slate-900 mb-2">Order Submitted Successfully</h3>
                  <p className="text-emerald-700 font-medium mb-6">Your modification order is queued for review (24-48h processing time).</p>
                  
                  <div className="max-w-sm mx-auto bg-white p-5 rounded-xl border border-emerald-200 shadow-sm relative">
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Reference ID</div>
                    <div className="text-lg font-mono font-bold text-slate-900 break-all">{result.reference_id}</div>
                    <button type="button" onClick={() => copyToClipboard(result.reference_id)} className="absolute top-4 right-4 p-2 text-slate-400 hover:text-emerald-600 bg-slate-50 hover:bg-emerald-50 rounded-lg transition-colors">
                      <Copy size={16} />
                    </button>
                  </div>
                  <p className="text-xs text-emerald-600 font-bold mt-4">Save this Reference ID to check the status later!</p>
                </Card>
              ) : result.isStatusCheck ? (
                <Card className="p-6">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 pb-6 border-b border-slate-100">
                    <div>
                      <div className="text-sm font-bold text-slate-500 mb-1">{result.service_name || result.service_type || 'Modification Order'}</div>
                      <div className="text-xl font-black text-slate-900">{result.reference_id}</div>
                    </div>
                    <Badge tone={result.status === 'completed' || result.status === 'approved' ? 'green' : result.status === 'rejected' ? 'red' : 'amber'}>
                      {String(result.status).toUpperCase()}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div>
                      <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Submitted</div>
                      <div className="text-sm font-bold text-slate-900">{fmtDate(result.submitted_at || new Date().toISOString())}</div>
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Updated</div>
                      <div className="text-sm font-bold text-slate-900">{fmtDate(result.updated_at || result.submitted_at || new Date().toISOString())}</div>
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Amount Charged</div>
                      <div className="text-sm font-bold text-slate-900">{fmtNaira(result.amount_charged || 0)}</div>
                    </div>
                    <div className="col-span-2 sm:col-span-4 mt-2">
                      <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Notes</div>
                      <div className="text-sm font-medium text-slate-700 bg-slate-50 p-4 rounded-xl border border-slate-200">
                        {result.notes || result.status_detail || 'No additional notes provided.'}
                      </div>
                    </div>
                  </div>
                </Card>
              ) : (
                <Card className="overflow-hidden bg-white shadow-[0_8px_30px_rgb(0,0,0,0.08)] border-slate-200">
                  <div className="p-1.5 bg-gradient-to-r from-emerald-400 to-emerald-500" />
                  <div className="p-6 sm:p-8 flex flex-col sm:flex-row gap-6 sm:gap-8 items-start">
                    {result.photo ? (
                      <div className="w-28 h-28 sm:w-36 sm:h-36 shrink-0 rounded-2xl overflow-hidden bg-slate-100 shadow-inner border border-slate-200/60">
                        <img src={result.photo.startsWith('data:') ? result.photo : `data:image/jpeg;base64,${result.photo}`} alt="ID Photo" className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="w-28 h-28 sm:w-36 sm:h-36 shrink-0 rounded-2xl bg-slate-50 border border-slate-200 border-dashed flex flex-col items-center justify-center text-xs text-slate-400 text-center shadow-inner">
                        <User size={32} className="mb-2 text-slate-300" />
                        No Photo<br/>Available
                      </div>
                    )}
                    <div className="flex-1 min-w-0 space-y-5">
                      <div>
                        <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-1">Full Name</div>
                        <div className="text-xl sm:text-2xl font-black text-slate-900 leading-tight">{(result.firstname || '') + ' ' + (result.middlename || '') + ' ' + (result.surname || result.lastname || '')}</div>
                      </div>
                      <div className="grid grid-cols-2 gap-5 bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                        <div>
                          <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-1">Date of Birth</div>
                          <div className="text-sm font-bold text-slate-700">{result.birthdate || result.dob || 'N/A'}</div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-1">Gender</div>
                          <div className="text-sm font-bold text-slate-700">{result.gender || 'N/A'}</div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-1">Phone Number</div>
                          <div className="text-sm font-bold text-slate-700">{result.telephoneno || result.phone || 'N/A'}</div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-1">State</div>
                          <div className="text-sm font-bold text-slate-700">{result.residence_state || result.state || result.state_of_residence || 'N/A'}</div>
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-1">Address</div>
                        <div className="text-sm font-medium text-slate-700">{result.residence_address || result.address || 'N/A'}</div>
                      </div>

                      {/* Download Buttons for Photo / Base64 Image */}
                      {result.photo && (
                        <div className="mt-6 border-t border-slate-200/60 pt-6">
                          <div className="mt-3 flex justify-end gap-3">
                            <Btn onClick={() => {
                              const link = document.createElement('a');
                              const imgSrc = result.photo.startsWith('data:') ? result.photo : `data:image/jpeg;base64,${result.photo}`;
                              link.href = imgSrc;
                              link.download = `photo-${result.nin || result.bvn || formData.phone || Date.now()}.jpg`;
                              link.click();
                            }} icon={Download} tone="blue">Download User Photo</Btn>
                          </div>
                        </div>
                      )}

                      {/* Generated Slip Renderer */}
                      {(result.slip || result.slip_image || (formData.slip_type && result.photo)) && (
                        <div className="mt-6 border-t border-slate-200/60 pt-6">
                          <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-3">Generated Slip Image</div>
                          <div className="w-full rounded-2xl overflow-hidden bg-slate-100 shadow-inner border border-slate-200/60 p-2">
                            <img 
                              src={(result.slip || result.slip_image || result.photo).startsWith('data:') 
                                ? (result.slip || result.slip_image || result.photo) 
                                : `data:image/jpeg;base64,${result.slip || result.slip_image || result.photo}`} 
                              alt="Generated Slip" 
                              className="w-full h-auto object-contain rounded-xl" 
                            />
                          </div>
                          <div className="mt-3 flex justify-end">
                            <Btn onClick={() => {
                              const link = document.createElement('a');
                              link.href = (result.slip || result.slip_image || result.photo).startsWith('data:') 
                                ? (result.slip || result.slip_image || result.photo) 
                                : `data:image/jpeg;base64,${result.slip || result.slip_image || result.photo}`;
                              link.download = `${formData.slip_type || 'slip'}-${result.nin || formData.phone || Date.now()}.jpg`;
                              link.click();
                            }} icon={Download} tone="blue">Download Slip</Btn>
                          </div>
                        </div>
                      )}

                    </div>
                  </div>
                  <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-4">
                    <Btn full tone="green" onClick={logToLedger} icon={ClipboardList}>Log this to Ledger</Btn>
                  </div>
                </Card>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function UnifiedAgentLogTable({ activities, user, removeEntry }) {
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState(todayStr());
  const [endDate, setEndDate] = useState(todayStr());

  const mine = activities.filter(a => a.agentPhone === user.phone);
  
  // Filter by date range
  const filteredEntries = mine.filter(a => {
    const d = a.date || '';
    if (startDate && d < startDate) return false;
    if (endDate && d > endDate) return false;
    return true;
  });

  // Flatten PDFs from all filtered entries
  let flattenedFiles = [];
  filteredEntries.forEach(a => {
    if (a.printFiles && a.printFiles.length > 0) {
      a.printFiles.forEach((f, idx) => {
        flattenedFiles.push({
          ...f,
          entryId: a.id,
          entryDate: a.date || a.createdAt,
          entryTypeName: a.typeName,
          isLegacy: false,
          legacyIdx: -1
        });
      });
    } else if (a.printFileUrls && a.printFileUrls.length > 0) {
      a.printFileUrls.forEach((url, idx) => {
        flattenedFiles.push({
          url,
          filename: a.printFileNames?.[idx] || 'document.pdf',
          extractedName: (a.printFileNames?.[idx] || '').replace(/\.pdf$/i, ''),
          nin: '',
          dob: '',
          isOwed: false,
          amountPaid: 0,
          proposedPrice: 0,
          entryId: a.id,
          entryDate: a.date || a.createdAt,
          entryTypeName: a.typeName,
          isLegacy: true,
          legacyIdx: idx
        });
      });
    }
  });

  // Apply search filter (Name or NIN)
  if (search.trim() !== '') {
    const lowerSearch = search.toLowerCase();
    flattenedFiles = flattenedFiles.filter(f => 
      (f.extractedName || f.filename || '').toLowerCase().includes(lowerSearch) || 
      (f.nin || '').includes(lowerSearch)
    );
  }
  
  // Sort by entryDate descending
  flattenedFiles.sort((x, y) => (y.entryDate || '').localeCompare(x.entryDate || ''));

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4 mb-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex-1">
          <label className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1">Search Name / NIN</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text" 
              placeholder="Search documents..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full text-sm pl-9 pr-3 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1">Start Date</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all" />
          </div>
          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1">End Date</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all" />
          </div>
        </div>
      </div>

      <Card className="overflow-hidden border border-slate-200">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-slate-500 uppercase font-bold text-[10px] tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">NIN</th>
                <th className="px-4 py-3">D.O.B</th>
                <th className="px-4 py-3">Payment Status</th>
                <th className="px-4 py-3 text-center">Document</th>
                <th className="px-4 py-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {flattenedFiles.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-4 py-8 text-center text-slate-500 font-medium">
                    No documents found matching the current filters.
                  </td>
                </tr>
              ) : (
                flattenedFiles.map((f, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 group">
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600 font-medium">
                      {fmtDate(f.entryDate.split('T')[0])}
                    </td>
                    <td className="px-4 py-3 font-bold text-slate-900">{f.extractedName || f.filename || '—'}</td>
                    <td className="px-4 py-3 text-slate-600 font-medium">{f.nin || '—'}</td>
                    <td className="px-4 py-3 text-slate-600 font-medium">{f.dob || '—'}</td>
                    <td className="px-4 py-3 text-slate-600 font-medium">
                      {f.isOwed ? (
                        <div className="flex flex-col">
                          <span className="text-rose-600 font-bold">Owing</span>
                          <span className="text-[10px] text-slate-500">Paid: {fmtNaira(Number(f.amountPaid) || 0)}</span>
                          {f.proposedPrice && <span className="text-[10px] text-amber-600">Req: {fmtNaira(Number(f.proposedPrice))}</span>}
                        </div>
                      ) : (
                        <span className="text-emerald-600 font-bold">Fully Paid</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {f.url ? (
                        <a href={`${f.url}?download=`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-2 py-1 bg-amber-50 text-amber-700 hover:bg-amber-100 font-bold rounded transition-colors">
                          <Download size={12} /> Download
                        </a>
                      ) : f.isVerifyResult && f.verifyData && (f.verifyData.photo || f.verifyData.base64Image) ? (
                        <button onClick={() => {
                          const photo = f.verifyData.photo || f.verifyData.base64Image;
                          const imgSrc = photo.startsWith('data:') ? photo : `data:image/jpeg;base64,${photo}`;
                          const link = document.createElement('a');
                          link.href = imgSrc;
                          link.download = `photo-${f.nin || f.filename || Date.now()}.jpg`;
                          link.click();
                        }} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold rounded transition-colors">
                          <Download size={12} /> Photo
                        </button>
                      ) : (
                        <span className="text-[10px] text-slate-400 font-medium">API Data</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                       <button onClick={() => {
                          if (window.confirm("Warning: This deletes the ENTIRE entry batch this document belongs to. Proceed?")) {
                            removeEntry(f.entryId);
                          }
                       }} title="Delete entire batch" className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors focus:outline-none opacity-0 group-hover:opacity-100">
                         <Trash2 size={16} />
                       </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}


function AgentLog({ ctx }) {
  const { user, types, activities, refresh, flash } = ctx;
  const [typeId, setTypeId] = useState(types.find(t => t.active !== false)?.id || '');
  const [count, setCount] = useState(1);
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [printRequested, setPrintRequested] = useState(false);
  const [issuedAtmCard, setIssuedAtmCard] = useState(false);
  const [pdfFiles, setPdfFiles] = useState([]);

  useEffect(() => {
    const t = types.find(x => x.id === typeId);
    if (t) setPrintRequested(!!t.requiresPrinting);
  }, [typeId, types]);

  const activeTypes = types.filter(t => t.active !== false);
  const mine = activities.filter(a => a.agentPhone === user.phone);
  const today = mine.filter(a => a.date === todayStr()).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const todayCount = today.reduce((s, a) => s + Number(a.count || 0), 0);
  const pm = priceMapOf(types);
  const todayValue = today.reduce((s, a) => s + Number(a.count || 0) * (pm[a.typeId] || 0), 0);

  const submit = async () => {
    if (!typeId || count < 1) { flash('Pick a type and a count of at least 1.', 'red'); return; }
    if (printRequested && pdfFiles.length === 0) { flash('Please upload the ID PDFs for printing.', 'amber'); return; }
    
    setBusy(true);
    
    let uploadedUrls = [];
    let finalFileNames = [];
    let finalPrintFiles = [];
    
    if (printRequested && pdfFiles.length > 0 && supabase) {
      for (const f of pdfFiles) {
        const ext = f.original.name.split('.').pop() || 'pdf';
        const cleanName = f.newName || `ID_Document_${Date.now()}`;
        const fName = `${cleanName.endsWith('.pdf') ? cleanName : cleanName + '.' + ext}`;
        const filePath = `${user.phone}/${Date.now()}_${fName}`;
        
        const { data, error } = await supabase.storage.from('print_files').upload(filePath, f.original);
        if (error) {
          flash(`Failed to upload ${fName}: ` + error.message, 'red');
          continue; // keep trying others
        }
        
        const { data: urlData } = supabase.storage.from('print_files').getPublicUrl(filePath);
        uploadedUrls.push(urlData.publicUrl);
        finalFileNames.push(fName);
        finalPrintFiles.push({
          url: urlData.publicUrl,
          filename: fName,
          extractedName: f.extractedName || '',
          nin: f.nin || '',
          dob: f.dob || ''
        });
      }
    }
    
    const t = types.find(x => x.id === typeId);
    const entry = {
      id: uid(), agentPhone: user.phone, agentName: user.name, supervisorPhone: user.supervisorPhone || null,
      typeId, typeName: t ? t.name : typeId, count: Number(count), date, note: note.trim(),
      createdAt: new Date().toISOString(), printStatus: printRequested ? 'pending' : null,
      issuedAtmCard,
      printFileUrls: uploadedUrls,
      printFileNames: finalFileNames,
      printFiles: finalPrintFiles
    };
    await saveItem(`activities:${entry.id}`, entry, true);
    setCount(1); setNote(''); setIssuedAtmCard(false); setPdfFiles([]);
    await refresh();
    setBusy(false);
    flash('Entry saved.', 'green');
  };

  const handlePdfUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setBusy(true);
    
    let processedFiles = [];
    
    for (const file of files) {
      try {
        if (file.type !== 'application/pdf') throw new Error("Only PDF files are supported for extraction");
        const buffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
        let text = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          text += content.items.map(item => item.str).join(' ');
        }
        
        const rawText = text;
        const cleanTextForNin = text.replace(/[^a-zA-Z0-9]/g, '');
        const ninMatch = cleanTextForNin.match(/(\d{11})/);
        let nin = ninMatch ? ninMatch[1] : '';
        
        if (!nin) {
           const fileNinMatch = file.name.replace(/[^0-9]/g, '').match(/(\d{11})/);
           if (fileNinMatch) nin = fileNinMatch[1];
        }
        
        let nameStr = 'Unknown_Name';
        const surMatch = text.match(/Surname(?:\/Nom)?[\s:.]*([A-Za-z\-]+)/i);
        const givenMatch = text.match(/Given(?:\sNames)?(?:\/Pr[eé]noms)?[\s:.]*([A-Za-z\-\s,]+?)(?=\s*(Date|NIN|National|Sex|Height|$))/i);
        const firstMatch = text.match(/First\sName[\s:.]*([A-Za-z\-]+)/i);
        const middleMatch = text.match(/Middle\sName[\s:.]*([A-Za-z\-]+)/i);
        
        let dobStr = '';
        const dobMatch = text.match(/(?:Date\s+of\s+Birth|Date\s+de\s+naissance)[\s:.]*([0-9]{1,2}[\s-]+[A-Za-z]{3,4}[\s-]+[0-9]{4}|[0-9]{2}[\s\/-][0-9]{2}[\s\/-][0-9]{4}|[0-9]{4}[\s\/-][0-9]{2}[\s\/-][0-9]{2})/i);
        if (dobMatch) dobStr = dobMatch[1].trim().replace(/\s+/g, '-');

        if (surMatch && (givenMatch || firstMatch)) {
           let given = '';
           if (givenMatch) given = givenMatch[1].replace(/,/g, '').trim();
           else if (firstMatch) given = `${firstMatch[1].trim()} ${middleMatch ? middleMatch[1].trim() : ''}`.trim();
           nameStr = `${given} ${surMatch[1].trim()}`.trim();
        } else {
           nameStr = file.name.replace(/\.[^/.]+$/, ""); 
           if (nin) nameStr = nameStr.replace(nin, '').replace(/[_.-]+/g, ' ').trim();
        }

        const cleanName = nameStr.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
        const finalNin = nin || '';
        const newName = `${cleanName || 'ID_Slip'}${finalNin ? '_' + finalNin : ''}.pdf`;
        
        const isImageOnly = text.trim().length < 20;
        processedFiles.push({ id: uid(), original: file, newName, nin: finalNin, dob: dobStr, extractedName: nameStr, text, isImageOnly, isOwed: false, amountPaid: '', proposedPrice: '' });
        
      } catch (err) {
        console.error(err);
        processedFiles.push({ id: uid(), original: file, newName: file.name, nin: '', dob: '', extractedName: '', isImageOnly: true, isOwed: false, amountPaid: '', proposedPrice: '' });
      }
    }
    
    setPdfFiles(prev => [...prev, ...processedFiles]);
    if (processedFiles.length > 0) flash(`Processed ${processedFiles.length} file(s)`, 'green');
    setBusy(false);
  };
  
  const updatePdfFile = (id, updates) => {
    setPdfFiles(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
  };
  
  const removePdfFile = (id) => {
    setPdfFiles(prev => prev.filter(f => f.id !== id));
  };

  const removeEntry = async (id) => {
    await deleteItem(`activities:${id}`, true);
    await refresh();
    flash('Entry removed.');
  };

  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatTile label="Today's Tally" value={todayCount} icon={ClipboardList} />
        <StatTile label="Today's Value" value={fmtNaira(todayValue)} icon={CircleDollarSign} />
        <StatTile label="Entries Today" value={today.length} icon={TrendingUp} />
        <StatTile label="Supervisor" value={ctx.users.find(u => u.phone === user.supervisorPhone)?.name?.split(' ')[0] || '—'} icon={Users} />
      </div>

      <Card className="p-6 mb-8">
        <SectionTitle>Manual Tally Logging</SectionTitle>
        <span className="block text-xs font-bold text-slate-700 mb-2">Registration Type</span>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          {activeTypes.map(t => (
            <button key={t.id} onClick={() => setTypeId(t.id)} className={`text-left p-3 rounded-xl border transition-all ${typeId === t.id ? 'border-amber-500 bg-amber-50 shadow-sm ring-1 ring-amber-500' : 'border-slate-200 bg-white/50 hover:bg-white hover:border-slate-300'}`}>
              <div className="text-sm font-bold text-slate-900">{t.name}</div>
              <div className="text-[11px] font-medium text-slate-500 mt-0.5">{fmtNaira(t.price)}/reg</div>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Count">
            <div className="flex items-center gap-3">
              <button onClick={() => setCount(c => Math.max(1, c - 1))} className="p-3 rounded-xl border border-slate-200 bg-white shadow-sm hover:bg-slate-50 text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500/30 transition-all"><Minus size={16} /></button>
              <input type="number" value={count} onChange={e => setCount(Math.max(1, Number(e.target.value) || 1))} className="w-full text-center rounded-xl px-4 py-2.5 text-lg font-bold bg-white/70 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/30 transition-all" />
              <button onClick={() => setCount(c => c + 1)} className="p-3 rounded-xl border border-slate-200 bg-white shadow-sm hover:bg-slate-50 text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500/30 transition-all"><Plus size={16} /></button>
            </div>
          </Field>
          <Field label="Date"><TextInput type="date" value={date} max={todayStr()} onChange={e => setDate(e.target.value)} /></Field>
        </div>
        <Field label="Note (optional)"><TextInput value={note} onChange={e => setNote(e.target.value)} placeholder="Location, batch reference, etc." /></Field>
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors flex-1">
            <input type="checkbox" checked={printRequested} onChange={e => setPrintRequested(e.target.checked)} className="w-4 h-4 text-amber-500 rounded focus:ring-amber-500" />
            <span className="text-sm font-bold text-slate-700">Send for ID Printing</span>
          </label>
          <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors flex-1">
            <input type="checkbox" checked={issuedAtmCard} onChange={e => setIssuedAtmCard(e.target.checked)} className="w-4 h-4 text-amber-500 rounded focus:ring-amber-500" />
            <span className="text-sm font-bold text-slate-700">Issued ATM Card</span>
          </label>
        </div>

        {printRequested && (
          <div className="mb-6 p-4 rounded-xl border border-amber-200 bg-amber-50/50">
            <label className="block text-sm font-bold text-slate-700 mb-2">Upload ID Document(s) (PDF)</label>
            <input type="file" multiple accept="application/pdf,image/*" onChange={handlePdfUpload} className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-amber-100 file:text-amber-700 hover:file:bg-amber-200 transition-colors" />
            
            {pdfFiles.length > 0 && (
              <div className="mt-4 space-y-3">
                {pdfFiles.map((pdf, idx) => (
                  <div key={pdf.id} className="text-sm bg-white p-3 rounded-lg border border-amber-100 shadow-sm flex flex-col gap-2 relative">
                    <button onClick={() => removePdfFile(pdf.id)} className="absolute top-3 right-3 text-slate-400 hover:text-rose-500 transition-colors"><X size={16} /></button>
                    
                    {pdf.isImageOnly ? (
                      <div className="flex items-center gap-2 text-amber-600 font-bold bg-amber-50 p-2 rounded border border-amber-100">
                        <AlertCircle size={16} /> Image-Only PDF (File {idx + 1})
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-emerald-600 font-bold bg-emerald-50 p-2 rounded border border-emerald-100">
                        <CheckCircle2 size={16} /> Scan Complete (File {idx + 1})
                      </div>
                    )}

                    <Field label="Detected Name">
                      <TextInput value={pdf.extractedName || ''} onChange={e => updatePdfFile(pdf.id, { extractedName: e.target.value, newName: `${e.target.value.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_')}_${pdf.nin}.pdf`})} placeholder="Type name manually if missing" />
                    </Field>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <Field label="Detected NIN">
                        <TextInput value={pdf.nin || ''} onChange={e => updatePdfFile(pdf.id, { nin: e.target.value, newName: `${pdf.extractedName.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_')}_${e.target.value}.pdf`})} placeholder="Type 11-digit NIN if missing" />
                      </Field>
                      <Field label="Date of Birth">
                        <TextInput value={pdf.dob || ''} onChange={e => updatePdfFile(pdf.id, { dob: e.target.value })} placeholder="DD-MM-YYYY" />
                      </Field>
                    </div>
                    <div className="text-xs text-slate-500 mt-1 font-medium bg-slate-50 p-2 rounded">
                      File will be saved as: <strong className="text-slate-800 break-all">{pdf.newName}</strong>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <Btn onClick={submit} full disabled={busy} size="lg" icon={busy ? Loader2 : Check}>{busy ? 'Saving…' : 'Save Entry'}</Btn>
      </Card>

      <SectionTitle>Saved Entries</SectionTitle>
      <div className="space-y-3">
        <UnifiedAgentLogTable activities={activities} user={user} removeEntry={removeEntry} />
      </div>
    </div>
  );
}

function AgentStats({ ctx }) {
  const { user, types, activities, flash } = ctx;
  const [range, setRange] = useState('today');
  const mine = activities.filter(a => a.agentPhone === user.phone && isInRange(a.date, range));
  const pm = priceMapOf(types);
  const count = mine.reduce((s, a) => s + Number(a.count || 0), 0);
  const value = mine.reduce((s, a) => s + Number(a.count || 0) * (pm[a.typeId] || 0), 0);
  const bt = breakdown(mine.map(a => ({ ...a })), types, 'all');

  let totalTarget = 0;
  if (user.target && typeof user.target === 'object') {
    totalTarget = Object.values(user.target).reduce((sum, val) => sum + (Number(val) || 0), 0);
  } else if (typeof user.target === 'number') {
    totalTarget = user.target;
  }

  const sendToWhatsApp = () => {
    const d = new Date();
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
    const date = d.getDate();
    const nth = (d) => {
      if (d > 3 && d < 21) return 'th';
      switch (d % 10) {
        case 1:  return "st";
        case 2:  return "nd";
        case 3:  return "rd";
        default: return "th";
      }
    };
    const ds = `${days[d.getDay()]} ${date}${nth(date)} ${months[d.getMonth()]} ${d.getFullYear()}`;
    const title = range === 'today' ? 'DAILY' : range === 'week' ? 'WEEKLY' : 'MONTHLY';
    
    let text = `*${title} REPORT FORMAT ${ds}:*\n\n`;
    const targetPct = totalTarget > 0 ? Math.round((count / totalTarget) * 100) : 0;
    text += ` *Monthly Target:* ${count}/${totalTarget} (${targetPct}%)\n\n`;
    text += `Total Done: ${count}\n`;
    
    bt.forEach(b => {
      text += `${b.name}: ${b.count}\n`;
    });
    
    text += `Place of Work: \n`;
    text += `Total Money to be Sent: ${value}\n\n`;
    text += `Total Money Sent: 0`;

    // Open WhatsApp deep link with the text
    const encodedText = encodeURIComponent(text);
    window.open(`https://api.whatsapp.com/send?text=${encodedText}`, '_blank');
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-black tracking-tight text-slate-900">My Performance</h2>
          <button onClick={sendToWhatsApp} className="flex items-center gap-2 bg-emerald-500 text-white hover:bg-emerald-600 px-4 py-1.5 rounded-lg text-sm font-bold transition-colors">
            <Send size={16} /> Send to WhatsApp
          </button>
        </div>
        <RangeTabs value={range} onChange={setRange} />
      </div>
      <div className="grid grid-cols-2 gap-4 mb-8">
        <StatTile label="Registrations" value={count} icon={ClipboardList} />
        <StatTile label="Value Generated" value={fmtNaira(value)} icon={CircleDollarSign} />
        
        {totalTarget > 0 && (
          <Card className="col-span-2 p-5 flex flex-col justify-center">
            <div className="flex justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Overall Target Progress</span>
              <span className="text-xs font-bold text-slate-900">{count} / {totalTarget}</span>
            </div>
            <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
              <div 
                className={`h-full ${count >= totalTarget ? 'bg-emerald-500' : 'bg-amber-400'}`} 
                style={{ width: `${Math.min(100, Math.round((count / totalTarget) * 100))}%` }} 
              />
            </div>
          </Card>
        )}
      </div>
      <SectionTitle>By Type</SectionTitle>
      {bt.length === 0 ? <Empty text="No activity in this range." /> : (
        <Card className="p-2 space-y-1">
          {bt.map(b => {
            const t = user.target && typeof user.target === 'object' ? (user.target[b.id] || 0) : 0;
            const pct = t > 0 ? Math.min(100, Math.round((b.count / t) * 100)) : 0;
            return (
              <div key={b.name} className="flex flex-col px-4 py-3 rounded-lg hover:bg-slate-50 transition-colors gap-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700">{b.name}</span>
                  <div className="flex items-center gap-2">
                    {t > 0 && <span className="text-xs font-medium text-slate-400">Target: {t}</span>}
                    <span className="font-bold text-slate-900 bg-slate-100 px-3 py-1 rounded-md">{b.count}</span>
                  </div>
                </div>
                {t > 0 && (
                  <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden mt-1">
                    <div 
                      className={`h-full ${pct >= 100 ? 'bg-emerald-500' : 'bg-amber-400'}`} 
                      style={{ width: `${pct}%` }} 
                    />
                  </div>
                )}
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}

/* ----------------------------------- supplies (agent + supervisor) ----------------------------------- */

function SuppliesPanel({ ctx }) {
  const { user, logistics, refresh, flash } = ctx;
  const [item, setItem] = useState('');
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const mine = logistics.filter(l => l.requesterPhone === user.phone).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  const submit = async () => {
    if (!item.trim()) { flash('Describe what you need.', 'red'); return; }
    setBusy(true);
    const entry = {
      id: uid(), requesterPhone: user.phone, requesterName: user.name, requesterRole: user.role,
      item: item.trim(), quantity: Number(qty) || 1, note: note.trim(), status: 'pending', createdAt: new Date().toISOString(),
    };
    await saveItem(`logistics:${entry.id}`, entry, true);
    setItem(''); setQty(1); setNote('');
    await refresh(); setBusy(false);
    flash('Request sent to Store.', 'green');
  };

  return (
    <div className="max-w-3xl">
      <h2 className="text-2xl font-black tracking-tight text-slate-900 mb-6">Supplies & Logistics</h2>
      <Card className="p-6 mb-8">
        <SectionTitle>Request Supplies</SectionTitle>
        <Field label="Item">
          <TextInput list="store-items-list" value={item} onChange={e => setItem(e.target.value)} placeholder="Select item or type custom..." />
          <datalist id="store-items-list">
            {ctx.storeItems?.map(i => <option key={i} value={i} />)}
          </datalist>
        </Field>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Quantity"><TextInput type="number" min={1} value={qty} onChange={e => setQty(e.target.value)} /></Field>
          <Field label="Note (optional)"><TextInput value={note} onChange={e => setNote(e.target.value)} placeholder="Delivery location, urgency…" /></Field>
        </div>
        <Btn onClick={submit} full disabled={busy} size="lg" icon={busy ? Loader2 : Package}>{busy ? 'Sending…' : 'Send Request to Store'}</Btn>
      </Card>

      <SectionTitle>My Requests</SectionTitle>
      {mine.length === 0 ? <Empty text="No requests yet." /> : (
        <div className="space-y-3">
          {mine.map(l => <LogisticsRow key={l.id} l={l} />)}
        </div>
      )}
    </div>
  );
}

function statusBadge(status) {
  if (status === 'dispatched') return <Badge tone="green"><CheckCircle2 size={12} className="mr-0.5" />Dispatched</Badge>;
  if (status === 'rejected') return <Badge tone="red"><XCircle size={12} className="mr-0.5" />Rejected</Badge>;
  return <Badge tone="amber"><Clock size={12} className="mr-0.5" />Pending</Badge>;
}

function LogisticsRow({ l, action }) {
  return (
    <Card className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 group hover:border-slate-300 transition-colors">
      <div className="min-w-0 flex-1">
        <div className="text-base font-bold text-slate-900 truncate mb-1">{l.item} <span className="font-medium text-slate-400 ml-1">× {l.quantity}</span></div>
        <div className="text-xs font-medium text-slate-500 truncate">{l.requesterName} · {ROLE_MAP[l.requesterRole]?.label || l.requesterRole} {l.note ? `· ${l.note}` : ''}</div>
      </div>
      <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 shrink-0">
        {statusBadge(l.status)}
        {action}
      </div>
    </Card>
  );
}

/* ----------------------------------- supervisor: team ----------------------------------- */

function SupervisorTeam({ ctx }) {
  const { user, users, types, activities, refresh, flash } = ctx;
  const [range, setRange] = useState('week');
  const [targetModal, setTargetModal] = useState(null); // holds agent object
  const [targetInput, setTargetInput] = useState({});
  
  const myAgents = users.filter(u => u.role === 'agent' && u.supervisorPhone === user.phone && u.active !== false);
  const unassigned = users.filter(u => u.role === 'agent' && !u.supervisorPhone && u.active !== false);
  const rows = agentRows(myAgents, activities, types, range);
  const teamCount = rows.reduce((s, r) => s + r.count, 0);
  const teamValue = rows.reduce((s, r) => s + r.value, 0);

  const claim = async (phone) => {
    const raw = await safeGet(`users:${phone}`, true);
    if (!raw) return;
    const u = JSON.parse(raw);
    u.supervisorPhone = user.phone;
    await saveItem(`users:${phone}`, u, true);
    await refresh();
    flash(`${u.name} added to your team.`, 'green');
  };

  const openTargetModal = (agentRow) => {
    setTargetInput(agentRow.targetObj || {});
    setTargetModal(agentRow);
  };

  const saveTarget = async () => {
    if (!targetModal) return;
    const raw = await safeGet(`users:${targetModal.phone}`, true);
    if (!raw) return;
    const u = JSON.parse(raw);
    u.target = targetInput;
    await saveItem(`users:${targetModal.phone}`, u, true);
    await refresh();
    flash(`Targets updated for ${u.name}.`, 'green');
    setTargetModal(null);
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
        <h2 className="text-2xl font-black tracking-tight text-slate-900">My Team</h2>
        <RangeTabs value={range} onChange={setRange} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        <StatTile label="Agents" value={myAgents.length} sub={myAgents.length > 10 ? 'Above recommended 10' : undefined} icon={Users} />
        <StatTile label="Registrations" value={teamCount} icon={ClipboardList} />
        <StatTile label="Value" value={fmtNaira(teamValue)} icon={CircleDollarSign} />
      </div>

      <SectionTitle>Team Leaderboard</SectionTitle>
      <LeaderboardTable rows={rows} onSetTarget={openTargetModal} />

      {targetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
              <h3 className="font-bold text-slate-900">Set Targets for {targetModal.name}</h3>
              <button onClick={() => setTargetModal(null)} className="p-2 -mr-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200/50 transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 overflow-y-auto space-y-4">
              <p className="text-xs font-medium text-slate-500 mb-2">Set monthly/weekly quotas for each service:</p>
              {types.filter(t => t.active).map(t => (
                <div key={t.id} className="flex items-center justify-between gap-4">
                  <label className="text-sm font-semibold text-slate-700 w-1/2 truncate" title={t.name}>{t.name}</label>
                  <div className="w-1/2">
                    <TextInput 
                      type="number" 
                      placeholder="0" 
                      value={targetInput[t.id] || ''} 
                      onChange={e => setTargetInput(prev => ({ ...prev, [t.id]: Number(e.target.value) || 0 }))} 
                      className="py-1.5"
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="p-5 border-t border-slate-100 bg-slate-50 shrink-0">
              <Btn onClick={saveTarget} full icon={Target}>Save Targets</Btn>
            </div>
          </div>
        </div>
      )}

      {unassigned.length > 0 && (
        <div className="mt-8">
          <SectionTitle>Unassigned Agents — Add to Team</SectionTitle>
          <div className="grid sm:grid-cols-2 gap-3 mt-4">
            {unassigned.map(a => (
              <Card key={a.phone} className="p-4 flex items-center justify-between group hover:border-slate-300 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar name={a.name} size={36} />
                  <div className="text-sm font-bold text-slate-900 truncate">{a.name}</div>
                </div>
                <Btn size="sm" onClick={() => claim(a.phone)} tone="ghost" icon={UserPlus}>Add</Btn>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LeaderboardTable({ rows, nameLabel = 'Name', valueLabel = 'Registrations', onSetTarget }) {
  return (
    <Card className="overflow-hidden overflow-x-auto no-scrollbar shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-900 border-b border-slate-800">
            <th className="px-4 py-3 text-left text-[11px] uppercase tracking-widest font-bold text-slate-300">#</th>
            <th className="px-4 py-3 text-left text-[11px] uppercase tracking-widest font-bold text-slate-300">{nameLabel}</th>
            <th className="px-4 py-3 text-right text-[11px] uppercase tracking-widest font-bold text-slate-300">Progress</th>
            <th className="px-4 py-3 text-right text-[11px] uppercase tracking-widest font-bold text-slate-300">Value</th>
            {onSetTarget && <th className="px-4 py-3 text-right text-[11px] uppercase tracking-widest font-bold text-slate-300">Target</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const targetStr = r.target > 0 ? ` / ${r.target}` : '';
            const pct = r.target > 0 ? Math.min(100, Math.round((r.count / r.target) * 100)) : 0;
            return (
              <tr key={r.id || i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors group">
                <td className="px-4 py-3 font-medium text-slate-400">{i + 1}</td>
                <td className="px-4 py-3 font-bold text-slate-900">{r.name}</td>
                <td className="px-4 py-3 text-right min-w-[140px]">
                  <div className="flex flex-col items-end gap-1">
                    <span className="font-medium text-slate-600 bg-slate-50/50 px-2 py-0.5 rounded text-xs group-hover:bg-slate-100/50 transition-colors">{r.count}{targetStr}</span>
                    {r.target > 0 && (
                      <div className="w-24 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div className={`h-full ${pct >= 100 ? 'bg-emerald-500' : 'bg-amber-400'}`} style={{ width: `${pct}%` }} />
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-bold text-slate-900">{fmtNaira(r.value)}</td>
                {onSetTarget && (
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => onSetTarget(r)} className="text-[10px] uppercase font-bold tracking-wider text-slate-500 hover:text-amber-600 transition-colors bg-slate-100 hover:bg-amber-100 px-2.5 py-1.5 rounded-lg flex items-center gap-1 ml-auto">
                      <Target size={12} /> {r.target > 0 ? 'Edit' : 'Set'}
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
          {rows.length === 0 && <tr><td colSpan={onSetTarget ? 5 : 4}><Empty text="No entries yet." /></td></tr>}
        </tbody>
      </table>
    </Card>
  );
}

/* ----------------------------------- ict: print queue ----------------------------------- */

function PrintQueue({ ctx }) {
  const { types, activities, refresh, flash } = ctx;
  const [filter, setFilter] = useState('pending');
  const queue = activities.filter(a => a.printStatus === 'pending' || a.printStatus === 'printed').sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const shown = queue.filter(a => filter === 'all' ? true : (a.printStatus || 'pending') === filter);
  const pendingCount = queue.filter(a => (a.printStatus || 'pending') === 'pending').reduce((s, a) => s + Number(a.count || 0), 0);

  const toggle = async (entry) => {
    const next = { ...entry, printStatus: entry.printStatus === 'printed' ? 'pending' : 'printed' };
    await saveItem(`activities:${entry.id}`, next, true);
    await refresh();
    flash(next.printStatus === 'printed' ? 'Marked as printed.' : 'Reverted to pending.', 'green');
  };

  return (
    <div>
      <h2 className="text-2xl font-black tracking-tight text-slate-900 mb-6">ID Print Queue</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        <StatTile label="Pending Cards" value={pendingCount} icon={Printer} />
        <StatTile label="Batches Queued" value={queue.length} icon={ClipboardList} />
      </div>
      <div className="mb-6">
        <RangeTabs value={filter} onChange={setFilter} options={[['pending', 'Pending'], ['printed', 'Printed'], ['all', 'All']]} />
      </div>
      {shown.length === 0 ? <Empty text="Nothing here." /> : (
        <div className="space-y-3">
          {shown.map(a => (
            <Card key={a.id} className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 group hover:border-slate-300 transition-colors">
              <div className="min-w-0">
                <div className="text-base font-bold text-slate-900 mb-1">{a.typeName} <span className="font-medium text-slate-400 ml-1">× {a.count}</span></div>
                <div className="text-xs font-medium text-slate-500">{a.agentName} · {fmtDate(a.date)} {a.note ? `· ${a.note}` : ''}</div>
              </div>
              <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 shrink-0">
                {(a.printStatus || 'pending') === 'printed' ? <Badge tone="green">Printed</Badge> : <Badge tone="amber">Pending</Badge>}
                {a.printFileUrl && !a.printFileUrls && (
                  <a href={a.printFileUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-amber-50 text-amber-600 rounded-lg hover:bg-amber-100 transition-colors border border-amber-200">
                    <FileText size={14} /> ID Doc
                  </a>
                )}
                {a.printFileUrls && a.printFileUrls.map((url, idx) => (
                  <a key={idx} href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-amber-50 text-amber-600 rounded-lg hover:bg-amber-100 transition-colors border border-amber-200">
                    <FileText size={14} /> ID Doc {idx + 1}
                  </a>
                ))}
                <Btn size="sm" tone={(a.printStatus || 'pending') === 'printed' ? 'ghost' : 'green'} onClick={() => toggle(a)} icon={Check}>
                  {(a.printStatus || 'pending') === 'printed' ? 'Undo' : 'Mark Printed'}
                </Btn>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ----------------------------------- store: requests ----------------------------------- */

function StoreRequests({ ctx }) {
  const { logistics, refresh, flash } = ctx;
  const [filter, setFilter] = useState('pending');
  const sorted = [...logistics].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const shown = sorted.filter(l => filter === 'all' ? true : l.status === filter);

  const setStatus = async (l, status) => {
    await saveItem(`logistics:${l.id}`, { ...l, status, resolvedAt: new Date().toISOString() }, true);
    await refresh();
    flash(status === 'dispatched' ? 'Marked as dispatched.' : 'Request rejected — requester notified.', status === 'dispatched' ? 'green' : 'red');
  };

  return (
    <div>
      <h2 className="text-2xl font-black tracking-tight text-slate-900 mb-6">Logistics Requests</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        <StatTile label="Pending" value={logistics.filter(l => l.status === 'pending').length} icon={Clock} />
        <StatTile label="Dispatched" value={logistics.filter(l => l.status === 'dispatched').length} icon={CheckCircle2} />
        <StatTile label="Rejected" value={logistics.filter(l => l.status === 'rejected').length} icon={XCircle} />
      </div>
      <div className="mb-6"><RangeTabs value={filter} onChange={setFilter} options={[['pending', 'Pending'], ['dispatched', 'Dispatched'], ['rejected', 'Rejected'], ['all', 'All']]} /></div>
      {shown.length === 0 ? <Empty text="Nothing here." /> : (
        <div className="space-y-3">
          {shown.map(l => (
            <LogisticsRow key={l.id} l={l} action={l.status === 'pending' ? (
              <div className="flex gap-2">
                <Btn size="sm" tone="green" onClick={() => setStatus(l, 'dispatched')} icon={Check}>Dispatch</Btn>
                <Btn size="sm" tone="red" onClick={() => setStatus(l, 'rejected')} icon={X}>Reject</Btn>
              </div>
            ) : null} />
          ))}
        </div>
      )}
    </div>
  );
}

function AdminRequestsView({ ctx }) {
  const { logistics, storeItems, flash, refresh } = ctx;
  const sorted = [...logistics].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const [newItem, setNewItem] = useState('');
  const [addingItem, setAddingItem] = useState(false);

  const handleAddItem = async () => {
    if (!newItem.trim()) return;
    setAddingItem(true);
    const updated = [...(storeItems || []), newItem.trim()];
    await saveItem('store_items', JSON.stringify(updated), true);
    setNewItem('');
    await refresh();
    setAddingItem(false);
    flash('Item added to Store Inventory.', 'green');
  };

  const handleRemoveItem = async (item) => {
    if (!window.confirm(`Remove "${item}" from inventory?`)) return;
    const updated = storeItems.filter(i => i !== item);
    await saveItem('store_items', JSON.stringify(updated), true);
    await refresh();
    flash('Item removed.', 'amber');
  };

  return (
    <div>
      <h2 className="text-2xl font-black tracking-tight text-slate-900 mb-6">Logistics & Store</h2>
      
      <div className="grid lg:grid-cols-3 gap-8 mb-8">
        <div className="lg:col-span-2">
          <SectionTitle>Logistics Requests (Org-wide)</SectionTitle>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <StatTile label="Pending" value={logistics.filter(l => l.status === 'pending').length} icon={Clock} />
            <StatTile label="Dispatched" value={logistics.filter(l => l.status === 'dispatched').length} icon={CheckCircle2} />
            <StatTile label="Rejected" value={logistics.filter(l => l.status === 'rejected').length} icon={XCircle} />
          </div>
          {sorted.length === 0 ? <Empty text="No requests yet." /> : <div className="space-y-3">{sorted.map(l => <LogisticsRow key={l.id} l={l} />)}</div>}
        </div>
        
        <div>
          <SectionTitle>Store Inventory</SectionTitle>
          <Card className="p-4 flex flex-col gap-4">
            <div className="text-sm font-medium text-slate-500 mb-1">Items available for agents to request:</div>
            
            <div className="flex items-center gap-2">
              <TextInput value={newItem} onChange={e => setNewItem(e.target.value)} placeholder="New item name..." />
              <Btn size="md" onClick={handleAddItem} disabled={addingItem} icon={Plus} />
            </div>

            <div className="space-y-2 mt-2 border-t border-slate-100 pt-4">
              {storeItems?.map(item => (
                <div key={item} className="flex items-center justify-between bg-slate-50 border border-slate-100 p-2.5 rounded-lg">
                  <span className="text-sm font-semibold text-slate-700">{item}</span>
                  <button onClick={() => handleRemoveItem(item)} className="text-slate-400 hover:text-rose-500 transition-colors p-1"><X size={14} /></button>
                </div>
              ))}
              {(!storeItems || storeItems.length === 0) && <div className="text-xs text-slate-400 text-center py-4">No items configured.</div>}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------- admin / super admin: overview ----------------------------------- */

function OrgOverview({ ctx }) {
  const { users, types, activities, logistics } = ctx;
  const [range, setRange] = useState('week');
  const [balance, setBalance] = useState(null);
  const [balLoading, setBalLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setBalLoading(true);
      const key = await safeGet('api_key', true);
      if (key) {
        try {
          const res = await fetch(`${import.meta.env.BASE_URL}checkmyninbvn-api/balance`, { headers: { 'x-api-key': key }});
          const data = await res.json();
          if (data.balance) setBalance(data.balance);
        } catch (e) { /* silent fail on network err */ }
      }
      setBalLoading(false);
    })();
  }, []);

  const inRange = activities.filter(a => isInRange(a.date, range));
  const pm = priceMapOf(types);
  const totalCount = inRange.reduce((s, a) => s + Number(a.count || 0), 0);
  const totalValue = inRange.reduce((s, a) => s + Number(a.count || 0) * (pm[a.typeId] || 0), 0);
  const activeAgents = new Set(inRange.map(a => a.agentPhone)).size;
  const pendingLogistics = logistics.filter(l => l.status === 'pending').length;

  const agents = users.filter(u => u.role === 'agent' && u.active !== false);
  const supervisors = users.filter(u => u.role === 'supervisor' && u.active !== false);
  const topAgents = agentRows(agents, activities, types, range).slice(0, 8);
  const supRows = supervisors.map(s => {
    const team = agents.filter(a => a.supervisorPhone === s.phone);
    const r = agentRows(team, activities, types, range);
    return { id: s.phone, name: s.name, count: r.reduce((x, y) => x + y.count, 0), value: r.reduce((x, y) => x + y.value, 0) };
  }).sort((a, b) => b.count - a.count).slice(0, 8);
  const bt = breakdown(activities, types, range);

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
        <h2 className="text-2xl font-black tracking-tight text-slate-900">Organisation Overview</h2>
        <RangeTabs value={range} onChange={setRange} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatTile label="Registrations" value={totalCount} icon={ClipboardList} />
        <StatTile label="Value Generated" value={fmtNaira(totalValue)} icon={CircleDollarSign} />
        <StatTile label="Active Agents" value={activeAgents} sub={`of ${agents.length} total`} icon={Users} />
        {balance !== null ? (
          <StatTile label="API Wallet" value={fmtNaira(balance)} loading={balLoading} icon={Wallet} />
        ) : (
          <StatTile label="Pending Supplies" value={pendingLogistics} icon={Package} />
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-8 mb-8">
        <div>
          <SectionTitle>Top Agents</SectionTitle>
          <LeaderboardTable rows={topAgents} />
        </div>
        <div>
          <SectionTitle>Top Supervisor Teams</SectionTitle>
          <LeaderboardTable rows={supRows} nameLabel="Supervisor" />
        </div>
      </div>

      <SectionTitle>By Registration Type</SectionTitle>
      {bt.length === 0 ? <Empty text="No activity in this range." /> : (
        <Card className="p-2 space-y-1 md:w-1/2">
          {bt.map(b => (
            <div key={b.name} className="flex items-center justify-between px-4 py-3 rounded-lg hover:bg-slate-50 transition-colors">
              <span className="font-semibold text-slate-700">{b.name}</span>
              <span className="font-bold text-slate-900 bg-slate-100 px-3 py-1 rounded-md">{b.count}</span>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

function SupervisorsBreakdown({ ctx }) {
  const { users, types, activities } = ctx;
  const [range, setRange] = useState('week');
  const [open, setOpen] = useState(null);
  const supervisors = users.filter(u => u.role === 'supervisor' && u.active !== false);
  const agents = users.filter(u => u.role === 'agent');

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
        <h2 className="text-2xl font-black tracking-tight text-slate-900">Supervisors & Teams</h2>
        <RangeTabs value={range} onChange={setRange} />
      </div>
      {supervisors.length === 0 && <Empty text="No supervisors registered yet." />}
      <div className="space-y-4">
        {supervisors.map(s => {
          const team = agents.filter(a => a.supervisorPhone === s.phone);
          const rows = agentRows(team, activities, types, range);
          const count = rows.reduce((x, y) => x + y.count, 0);
          const isOpen = open === s.phone;
          return (
            <Card key={s.phone} className={`p-0 overflow-hidden transition-all ${isOpen ? 'ring-2 ring-amber-500 border-amber-500 shadow-md' : 'hover:border-slate-300'}`}>
              <button onClick={() => setOpen(isOpen ? null : s.phone)} className="w-full flex items-center justify-between p-4 focus:outline-none">
                <div className="flex items-center gap-4">
                  <Avatar name={s.name} size={42} />
                  <div className="text-left">
                    <div className="text-base font-bold text-slate-900">{s.name}</div>
                    <div className="text-xs font-medium text-slate-500 mt-0.5">{team.length} agents · <span className="text-slate-900">{count} registrations</span></div>
                  </div>
                </div>
                <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-400">
                  <ChevronRight size={18} style={{ transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .2s ease-in-out' }} className={isOpen ? 'text-amber-500' : ''} />
                </div>
              </button>
              {isOpen && <div className="px-4 pb-4 animate-in fade-in slide-in-from-top-2"><LeaderboardTable rows={rows} /></div>}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/* ----------------------------------- staff manager ----------------------------------- */

function StaffManager({ ctx }) {
  const { users, refresh, flash, user: me } = ctx;
  const [roleFilter, setRoleFilter] = useState('all');
  const [q, setQ] = useState('');

  const filtered = users.filter(u =>
    (roleFilter === 'all' || u.role === roleFilter) &&
    (q.trim() === '' || u.name.toLowerCase().includes(q.toLowerCase()) || u.phone.includes(q))
  ).sort((a, b) => a.name.localeCompare(b.name));

  const toggleActive = async (u) => {
    const next = { ...u, active: u.active === false ? true : false };
    await saveItem(`users:${u.phone}`, next, true);
    await refresh();
    flash(next.active ? `${u.name} re-activated.` : `${u.name} deactivated.`, next.active ? 'green' : 'red');
  };

  const reassign = async (u, supervisorPhone) => {
    const next = { ...u, supervisorPhone: supervisorPhone || null };
    await saveItem(`users:${u.phone}`, next, true);
    await refresh();
    flash(`${u.name} reassigned.`, 'green');
  };

  const supervisors = users.filter(u => u.role === 'supervisor');

  return (
    <div>
      <h2 className="text-2xl font-black tracking-tight text-slate-900 mb-6">Staff Directory</h2>
      <div className="flex flex-col sm:flex-row gap-4 mb-6 bg-slate-100/50 p-2 rounded-xl">
        <TextInput placeholder="Search name or phone…" value={q} onChange={e => setQ(e.target.value)} className="w-full sm:w-80 bg-white" />
        <Select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} className="w-full sm:w-48 bg-white">
          <option value="all">All Roles</option>
          {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
        </Select>
      </div>
      <div className="space-y-3">
        {filtered.map(u => (
          <Card key={u.phone} className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all ${u.active === false ? 'opacity-60 bg-slate-50' : 'hover:border-slate-300'}`}>
            <div className="flex items-center gap-4 min-w-0">
              <Avatar name={u.name} size={42} />
              <div className="min-w-0">
                <div className="text-base font-bold text-slate-900 truncate mb-1">
                  {u.name} 
                  {u.phone === me.phone && <span className="ml-2 px-2 py-0.5 rounded-full bg-slate-200 text-[10px] uppercase font-bold text-slate-600 tracking-wider align-middle">You</span>}
                </div>
                <div className="text-xs font-medium text-slate-500 truncate flex items-center gap-2">
                  <span>{u.phone}</span>
                  <span className="w-1 h-1 rounded-full bg-slate-300" />
                  <span className="text-slate-700">{ROLE_MAP[u.role]?.label}</span>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              {u.role === 'agent' && (
                <Select value={u.supervisorPhone || ''} onChange={e => reassign(u, e.target.value)} className="text-xs py-2 w-44">
                  <option value="">No supervisor</option>
                  {supervisors.map(s => <option key={s.phone} value={s.phone}>{s.name}</option>)}
                </Select>
              )}
              {u.active === false ? <Badge tone="red">Inactive</Badge> : <Badge tone="green">Active</Badge>}
              {u.phone !== me.phone && <Btn size="sm" tone={u.active === false ? "primary" : "ghost"} onClick={() => toggleActive(u)}>{u.active === false ? 'Reactivate' : 'Deactivate'}</Btn>}
            </div>
          </Card>
        ))}
        {filtered.length === 0 && <Empty text="No staff match your search." />}
      </div>
    </div>
  );
}

/* ----------------------------------- settings & pricing manager ----------------------------------- */

function SettingsManager({ ctx }) {
  const { types, refresh, flash } = ctx;
  const [rows, setRows] = useState(types);
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newPrint, setNewPrint] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [fasterverifyKey, setFasterverifyKey] = useState('');
  const [paystackKey, setPaystackKey] = useState('');
  const [keyLoading, setKeyLoading] = useState(true);

  useEffect(() => { setRows(types); }, [types]);

  useEffect(() => {
    (async () => {
      const k = import.meta.env.VITE_API_KEY || await safeGet('api_key', true);
      if (k) setApiKey(k);
      const fk = import.meta.env.VITE_FASTERVERIFY_KEY || await safeGet('fasterverify_key', true);
      if (fk) setFasterverifyKey(fk);
      const pk = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || await safeGet('paystack_public_key', true);
      if (pk) setPaystackKey(pk);
      setKeyLoading(false);
    })();
  }, []);

  const update = (id, patch) => setRows(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r));

  const savePricing = async () => {
    await saveItem('activity_types', rows, true);
    await refresh();
    flash('Pricing updated.', 'green');
  };

  const addType = async () => {
    if (!newName.trim()) { flash('Name the new registration type.', 'red'); return; }
    const next = [...rows, { id: uid(), name: newName.trim(), price: Number(newPrice) || 0, requiresPrinting: newPrint, active: true }];
    setRows(next);
    await saveItem('activity_types', next, true);
    setNewName(''); setNewPrice(''); setNewPrint(false);
    await refresh();
    flash('New type added.', 'green');
  };

  const saveApiKeys = async () => {
    await saveItem('api_key', apiKey.trim(), true);
    await saveItem('fasterverify_key', fasterverifyKey.trim(), true);
    await saveItem('paystack_public_key', paystackKey.trim(), true);
    flash('API Keys saved securely.', 'green');
  };

  return (
    <div className="max-w-4xl">
      <h2 className="text-2xl font-black tracking-tight text-slate-900 mb-6">Settings & Services</h2>

      {/* Pricing Table */}
      <SectionTitle>Registration Types & Pricing</SectionTitle>
      <Card className="overflow-hidden mb-8 shadow-sm">
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-900 border-b border-slate-800">
                <th className="px-4 py-3 text-left text-[11px] uppercase tracking-widest font-bold text-slate-300">Type</th>
                <th className="px-4 py-3 text-left text-[11px] uppercase tracking-widest font-bold text-slate-300">Value (₦)</th>
                <th className="px-4 py-3 text-center text-[11px] uppercase tracking-widest font-bold text-slate-300">Needs Printing</th>
                <th className="px-4 py-3 text-center text-[11px] uppercase tracking-widest font-bold text-slate-300">Active</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3"><TextInput value={r.name} onChange={e => update(r.id, { name: e.target.value })} className="bg-transparent border-0 ring-0 focus:ring-1 focus:ring-amber-500 shadow-none px-2" /></td>
                  <td className="px-4 py-3"><TextInput type="number" value={r.price} onChange={e => update(r.id, { price: e.target.value })} className="w-28 bg-transparent border-0 ring-0 focus:ring-1 focus:ring-amber-500 shadow-none px-2 text-right" /></td>
                  <td className="px-4 py-3 text-center">
                    <input type="checkbox" checked={!!r.requiresPrinting} onChange={e => update(r.id, { requiresPrinting: e.target.checked })} className="w-4 h-4 text-amber-500 border-slate-300 rounded focus:ring-amber-500" />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <input type="checkbox" checked={r.active !== false} onChange={e => update(r.id, { active: e.target.checked })} className="w-4 h-4 text-amber-500 border-slate-300 rounded focus:ring-amber-500" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end"><Btn onClick={savePricing} icon={Check}>Save Changes</Btn></div>
      </Card>

      {/* Add New Type */}
      <SectionTitle>Add New Type</SectionTitle>
      <Card className="p-6 mb-8">
        <div className="grid sm:grid-cols-3 gap-5 mb-5">
          <Field label="Name"><TextInput value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Kuda Account" /></Field>
          <Field label="Value (₦)"><TextInput type="number" value={newPrice} onChange={e => setNewPrice(e.target.value)} /></Field>
          <label className="flex items-center gap-3 mt-6 p-3 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors">
            <input type="checkbox" checked={newPrint} onChange={e => setNewPrint(e.target.checked)} className="w-4 h-4 text-amber-500 rounded focus:ring-amber-500" />
            <span className="text-sm font-bold text-slate-700">Requires ID printing</span>
          </label>
        </div>
        <Btn onClick={addType} icon={Plus}>Add Type</Btn>
      </Card>
    </div>
  );
}

/* ----------------------------------- wallet & topup ----------------------------------- */

function WalletView({ ctx }) {
  const { user, setUser, flash } = ctx;
  const [amount, setAmount] = useState('');
  const [paystackKey, setPaystackKey] = useState('');
  const [txHistory, setTxHistory] = useState([]);

  useEffect(() => {
    safeGet('paystack_public_key', true).then(k => setPaystackKey(import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || k || ''));
    
    // Load simple local tx history for this user
    (async () => {
      const allTxs = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k.startsWith('ledger_shared_transactions:')) {
          try {
            const parsed = JSON.parse(localStorage.getItem(k));
            if (parsed.userPhone === user.phone) allTxs.push(parsed);
          } catch(e) {}
        }
      }
      allTxs.sort((a, b) => new Date(b.date) - new Date(a.date));
      setTxHistory(allTxs);
    })();
  }, [user.balance]);

  const config = {
    email: user.phone + '@fieldledger.com',
    amount: (Number(amount) || 0) * 100, // Paystack expects kobo
    publicKey: paystackKey,
  };

  const onSuccess = async (reference) => {
    console.log("🚀 PAYSTACK SUCCESS FIRED! Reference data:", reference);
    try {
      if (ctx && ctx.flash) {
        ctx.flash('Verifying payment with secure server...', 'amber');
      }
      
      console.log("⏳ Invoking Edge Function verify-paystack...");
      const { data, error } = await supabase.functions.invoke('verify-paystack', {
        body: { reference: reference.reference, userPhone: user.phone }
      });
      console.log("📥 Edge Function Response:", { data, error });
      
      if (error) {
        throw new Error(error.message || 'Edge function threw an error');
      }
      if (!data || !data.success) {
        throw new Error(data?.error || 'Payment verification failed on server');
      }
      
      // Update local state, database was already updated by Edge Function
      const updatedUser = { ...user, balance: data.newBalance };
      setUser(updatedUser);
      
      if (ctx && ctx.flash) ctx.flash('Wallet topped up securely!', 'green');
      setAmount('');
      
      // Force refresh of transactions and state if needed
      if (ctx && ctx.refresh) ctx.refresh();
      
    } catch (err) {
      console.error("❌ Verification Error:", err);
      if (ctx && ctx.flash) ctx.flash(err.message, 'red');
    }
  };

  const onClose = () => flash('Payment cancelled.', 'amber');
  
  const initializePayment = usePaystackPayment(config);

  const handleTopup = (e) => {
    e.preventDefault();
    if (!paystackKey) { flash('Paystack not configured. Contact Admin.', 'red'); return; }
    if (Number(amount) < 100) { flash('Minimum top-up is N100', 'red'); return; }
    initializePayment({ onSuccess, onClose });
  };

  return (
    <div className="max-w-4xl">
      <h2 className="text-2xl font-black tracking-tight text-slate-900 mb-6">Digital Wallet</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
        <Card className="p-8 text-center bg-gradient-to-br from-amber-500 to-amber-600 border-none shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-20"><Wallet size={120} /></div>
          <div className="relative z-10">
            <h3 className="text-amber-100 font-bold uppercase tracking-wider mb-2">Available Balance</h3>
            <div className="text-5xl font-black text-white mb-6">{fmtNaira(user.balance || 0)}</div>
            <div className="bg-white/20 rounded-xl p-4 text-left backdrop-blur-sm border border-white/20">
              <p className="text-amber-50 text-sm font-medium leading-relaxed">
                Use your wallet balance to access Live API Verification services like NIN matching and demographic searches instantly.
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6 border-t-4 border-t-amber-500">
          <h3 className="text-lg font-bold text-slate-900 mb-2">Top Up Balance</h3>
          <p className="text-sm text-slate-500 mb-6">Deposit funds instantly using your ATM card or bank transfer via Paystack.</p>
          
          {!ctx.isOnline && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 text-amber-800 text-sm font-medium rounded-lg flex items-center gap-2">
              <Activity size={16} /> Online connection required for top ups.
            </div>
          )}

          <form onSubmit={handleTopup} className="space-y-4">
            <Field label="Deposit Amount (₦)">
              <TextInput type="number" min="100" step="100" placeholder="e.g. 1000" value={amount} onChange={e => setAmount(e.target.value)} required className="text-lg font-bold" disabled={!ctx.isOnline} />
            </Field>
            
            <div className="grid grid-cols-3 gap-2 mb-4">
              {[500, 1000, 5000].map(val => (
                <button type="button" key={val} onClick={() => setAmount(val.toString())} disabled={!ctx.isOnline} className="py-2 rounded-lg border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 hover:border-amber-300 hover:text-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                  +₦{val}
                </button>
              ))}
            </div>

            <Btn type="submit" disabled={!ctx.isOnline} className="w-full h-12 text-base shadow-lg" icon={CircleDollarSign}>
              Pay with Paystack
            </Btn>
          </form>
        </Card>
      </div>

      <SectionTitle>Recent Transactions</SectionTitle>
      <Card className="overflow-hidden">
        {txHistory.length === 0 ? (
          <Empty text="No transactions yet. Top up your wallet to get started." />
        ) : (
          <div className="divide-y divide-slate-100">
            {txHistory.map(tx => (
              <div key={tx.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${tx.type === 'deposit' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                    {tx.type === 'deposit' ? <Plus size={20} /> : <Minus size={20} />}
                  </div>
                  <div>
                    <div className="font-bold text-slate-900">{tx.desc}</div>
                    <div className="text-xs font-medium text-slate-400">{new Date(tx.date).toLocaleString()}</div>
                  </div>
                </div>
                <div className={`font-black text-lg ${tx.type === 'deposit' ? 'text-emerald-600' : 'text-slate-900'}`}>
                  {tx.type === 'deposit' ? '+' : '-'}{fmtNaira(tx.amount)}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ----------------------------------- profile ----------------------------------- */

function ProfilePanel({ ctx, onLogout }) {
  const { user, users } = ctx;
  const supervisor = users.find(u => u.phone === user.supervisorPhone);
  return (
    <div className="max-w-md mx-auto sm:mx-0">
      <h2 className="text-2xl font-black tracking-tight text-slate-900 mb-6">Profile</h2>
      <Card className="overflow-hidden border-0 shadow-[0_8px_30px_rgb(0,0,0,0.08)]">
        <div className="bg-slate-900 relative">
          <div className="absolute inset-0 bg-gradient-to-r from-amber-500/20 to-transparent" />
          <div className="p-6 sm:p-8 flex items-center gap-5 relative z-10">
            <Avatar name={user.name} size={64} />
            <div>
              <div className="text-2xl font-black text-white tracking-tight mb-1">{user.name}</div>
              <div className="inline-block px-3 py-1 rounded-full bg-slate-800 text-amber-400 text-[10px] uppercase font-bold tracking-widest">{ROLE_MAP[user.role]?.label}</div>
            </div>
          </div>
        </div>
        <div className="p-6 sm:p-8 space-y-4 text-sm bg-white">
          <div className="flex justify-between items-center py-2 border-b border-slate-100 last:border-0"><span className="font-bold text-slate-400 uppercase text-[10px] tracking-widest">Phone</span><span className="font-bold text-slate-900">{user.phone}</span></div>
          {user.role === 'agent' && <div className="flex justify-between items-center py-2 border-b border-slate-100 last:border-0"><span className="font-bold text-slate-400 uppercase text-[10px] tracking-widest">Supervisor</span><span className="font-medium text-slate-700">{supervisor ? supervisor.name : 'Not assigned'}</span></div>}
          <div className="flex justify-between items-center py-2 border-b border-slate-100 last:border-0"><span className="font-bold text-slate-400 uppercase text-[10px] tracking-widest">Registered</span><span className="font-medium text-slate-700">{(user.createdAt || '').slice(0, 10)}</span></div>
        </div>
      </Card>
      <div className="mt-6">
        <Btn tone="ghost" onClick={onLogout} icon={LogOut} full size="lg" className="border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700">Log Out</Btn>
      </div>
      <p className="text-[11px] mt-8 text-slate-400 leading-relaxed font-medium">
        Data in this app is stored and shared across everyone using this link. It's built for internal day-to-day tracking — for production rollout with sensitive ID data, plan to move to a properly secured backend.
      </p>

    </div>
  );
}