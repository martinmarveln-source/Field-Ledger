import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ClipboardList, Users, Printer, ShieldCheck, Boxes, LogOut, Plus, Minus,
  Check, X, Package, TrendingUp, User, ChevronRight, AlertCircle,
  CircleDollarSign, Crown, Home, UserPlus, Trash2, Loader2, RefreshCw,
  ArrowRight, Eye, EyeOff, CheckCircle2, XCircle, Clock, Settings,
  Search, FileText, KeyRound, Wallet
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

async function safeGet(key, shared) {
  try {
    let r;
    if (window.storage) {
      r = await window.storage.get(key, shared);
    } else {
      r = localStorage.getItem(key);
    }
    // Handle both raw strings and wrapped objects from the storage API safely
    if (r && typeof r === 'object' && 'value' in r) return r.value;
    return r;
  } catch (e) { return null; }
}

async function listAll(prefix, shared) {
  try {
    const out = [];
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
      const v = await safeGet(k, shared);
      if (v) {
        try { out.push(JSON.parse(v)); } catch (e) {}
      }
    }
    return out;
  } catch (e) { return []; }
}

async function saveItem(key, obj, shared) {
  try {
    const val = typeof obj === 'string' ? obj : JSON.stringify(obj);
    if (window.storage) {
      await window.storage.set(key, val, shared);
    } else {
      localStorage.setItem(key, val);
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
    return true;
  } catch (e) { return false; }
}

/* --------------------------------- primitives -------------------------------- */

const COLORS = {
  ink: '#182B3A', inkSoft: '#54677A', paper: '#EFE9DA', surface: '#FBF9F2',
  amber: '#E8A23A', amberDark: '#B87F1E', green: '#2F6B4F', greenSoft: '#E4EEE8',
  red: '#A93226', redSoft: '#F3E1DE', line: '#D9D2BC',
};

function GlobalStyle() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');
      .fl-root { font-family: 'IBM Plex Sans', sans-serif; color: ${COLORS.ink}; }
      .fl-display { font-family: 'Barlow Condensed', sans-serif; letter-spacing: 0.02em; }
      .fl-mono { font-family: 'IBM Plex Mono', monospace; }
      .fl-stub { background-image: radial-gradient(circle at 3px 6px, ${COLORS.paper} 2.5px, transparent 3px); background-size: 8px 14px; background-repeat: repeat-y; }
      .fl-scroll::-webkit-scrollbar { height: 6px; width: 6px; }
      .fl-scroll::-webkit-scrollbar-thumb { background: ${COLORS.line}; border-radius: 4px; }
      input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
      .fl-focus:focus { outline: 2px solid ${COLORS.amber}; outline-offset: 1px; }
    `}</style>
  );
}

function Btn({ children, onClick, tone = 'primary', size = 'md', full, disabled, type = 'button', icon: Icon }) {
  const styles = {
    primary: { background: COLORS.amber, color: COLORS.ink, border: `1px solid ${COLORS.amberDark}` },
    dark: { background: COLORS.ink, color: COLORS.paper, border: `1px solid ${COLORS.ink}` },
    ghost: { background: 'transparent', color: COLORS.ink, border: `1px solid ${COLORS.line}` },
    green: { background: COLORS.green, color: '#fff', border: `1px solid ${COLORS.green}` },
    red: { background: COLORS.red, color: '#fff', border: `1px solid ${COLORS.red}` },
  };
  const pad = size === 'sm' ? '6px 10px' : '10px 16px';
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`fl-focus inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-opacity ${full ? 'w-full' : ''} ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90'}`}
      style={{ ...styles[tone], padding: pad, fontSize: size === 'sm' ? 13 : 14 }}
    >
      {Icon && <Icon size={size === 'sm' ? 14 : 16} />}
      {children}
    </button>
  );
}

function Card({ children, className = '', style = {} }) {
  return (
    <div className={`rounded-lg ${className}`} style={{ background: COLORS.surface, border: `1px solid ${COLORS.line}`, ...style }}>
      {children}
    </div>
  );
}

function Badge({ children, tone = 'default' }) {
  const map = {
    default: { background: COLORS.paper, color: COLORS.inkSoft },
    green: { background: COLORS.greenSoft, color: COLORS.green },
    red: { background: COLORS.redSoft, color: COLORS.red },
    amber: { background: '#FBEBD1', color: COLORS.amberDark },
  };
  return (
    <span className="fl-mono inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium uppercase tracking-wide" style={map[tone]}>
      {children}
    </span>
  );
}

function Avatar({ name, size = 40 }) {
  return (
    <div
      className="fl-display flex items-center justify-center rounded-full shrink-0"
      style={{ width: size, height: size, background: COLORS.ink, color: COLORS.amber, fontSize: size * 0.4, fontWeight: 800 }}
    >
      {initials(name)}
    </div>
  );
}

function StatTile({ label, value, sub, icon: Icon, loading = false }) {
  return (
    <Card className="flex overflow-hidden">
      <div className="fl-stub w-2 shrink-0" style={{ background: COLORS.ink }} />
      <div className="p-3 flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1" style={{ color: COLORS.inkSoft }}>
          {Icon && <Icon size={13} />}
          <span className="text-[11px] uppercase tracking-wide font-medium truncate">{label}</span>
        </div>
        <div className="fl-display text-2xl font-bold leading-none truncate">
          {loading ? <Loader2 size={20} className="animate-spin" /> : value}
        </div>
        {sub && <div className="text-xs mt-1 truncate" style={{ color: COLORS.inkSoft }}>{sub}</div>}
      </div>
    </Card>
  );
}

function SectionTitle({ children, action }) {
  return (
    <div className="flex items-center justify-between mb-2 mt-5 first:mt-0">
      <h3 className="fl-display text-lg font-bold tracking-wide uppercase" style={{ color: COLORS.ink }}>{children}</h3>
      {action}
    </div>
  );
}

function Empty({ text }) {
  return <div className="text-center py-8 text-sm" style={{ color: COLORS.inkSoft }}>{text}</div>;
}

function RangeTabs({ value, onChange, options }) {
  const opts = options || [['today', 'Today'], ['week', '7 Days'], ['month', 'This Month'], ['all', 'All Time']];
  return (
    <div className="inline-flex rounded-md overflow-hidden border" style={{ borderColor: COLORS.line }}>
      {opts.map(([id, label]) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className="fl-focus px-3 py-1.5 text-xs font-semibold"
          style={{ background: value === id ? COLORS.ink : COLORS.surface, color: value === id ? COLORS.paper : COLORS.inkSoft }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block mb-3">
      <span className="block text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: COLORS.inkSoft }}>{label}</span>
      {children}
    </label>
  );
}

const inputStyle = { border: `1px solid ${COLORS.line}`, background: '#fff', color: COLORS.ink };
function TextInput(props) {
  return <input {...props} className={`fl-focus w-full rounded-md px-3 py-2 text-sm ${props.className || ''}`} style={{ ...inputStyle, ...(props.style || {}) }} />;
}
function Select(props) {
  return <select {...props} className={`fl-focus w-full rounded-md px-3 py-2 text-sm ${props.className || ''}`} style={{ ...inputStyle, ...(props.style || {}) }} />;
}

/* --------------------------------- aggregation --------------------------------- */

function priceMapOf(types) { return Object.fromEntries(types.map(t => [t.id, Number(t.price) || 0])); }

function agentRows(agents, activities, types, range) {
  const pm = priceMapOf(types);
  return agents.map(a => {
    const own = activities.filter(x => x.agentPhone === a.phone && isInRange(x.date, range));
    const count = own.reduce((s, x) => s + Number(x.count || 0), 0);
    const value = own.reduce((s, x) => s + Number(x.count || 0) * (pm[x.typeId] || 0), 0);
    return { id: a.phone, name: a.name, phone: a.phone, count, value };
  }).sort((a, b) => b.count - a.count);
}

function breakdown(activities, types, range) {
  const map = {};
  types.forEach(t => { map[t.id] = { name: t.name, count: 0 }; });
  activities.filter(x => isInRange(x.date, range)).forEach(x => {
    if (!map[x.typeId]) map[x.typeId] = { name: x.typeName || x.typeId, count: 0 };
    map[x.typeId].count += Number(x.count || 0);
  });
  return Object.values(map).filter(m => m.count > 0).sort((a, b) => b.count - a.count);
}

/* ----------------------------------- app root ---------------------------------- */

export default function App() {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [types, setTypes] = useState(DEFAULT_TYPES);
  const [activities, setActivities] = useState([]);
  const [logistics, setLogistics] = useState([]);
  const [toast, setToast] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const flash = useCallback((msg, tone = 'default') => {
    setToast({ msg, tone });
    setTimeout(() => setToast(null), 3200);
  }, []);

  const loadAll = useCallback(async () => {
    setRefreshing(true);
    const [u, a, l, t] = await Promise.all([
      listAll('users:', true),
      listAll('activities:', true),
      listAll('logistics:', true),
      safeGet('activity_types', true),
    ]);
    setUsers(u);
    setActivities(a);
    setLogistics(l);
    if (t) { try { setTypes(JSON.parse(t)); } catch (e) {} }
    else { await saveItem('activity_types', DEFAULT_TYPES, true); setTypes(DEFAULT_TYPES); }
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
    let u; try { u = JSON.parse(raw); } catch (e) { return { ok: false, error: 'Account data corrupted.' }; }
    if (u.pin !== pin) return { ok: false, error: 'Incorrect PIN.' };
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
    const newUser = {
      phone: data.phone, name: data.name, pin: data.pin, role: data.role,
      supervisorPhone: data.role === 'agent' ? (data.supervisorPhone || null) : undefined,
      active: true, createdAt: new Date().toISOString(),
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
      <div className="fl-root flex items-center justify-center min-h-[500px]" style={{ background: COLORS.paper }}>
        <GlobalStyle />
        <Loader2 className="animate-spin" size={28} style={{ color: COLORS.ink }} />
      </div>
    );
  }

  return (
    <div className="fl-root min-h-[600px]" style={{ background: COLORS.paper }}>
      <GlobalStyle />
      {toast && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-md shadow-lg text-sm font-medium"
          style={{ background: toast.tone === 'red' ? COLORS.red : toast.tone === 'green' ? COLORS.green : COLORS.ink, color: '#fff' }}>
          {toast.msg}
        </div>
      )}
      {!user ? (
        <AuthScreen onLogin={login} onSignup={signup} users={users} />
      ) : (
        <Dashboard
          user={user} setUser={setUser} users={users} types={types} activities={activities}
          logistics={logistics} onLogout={logout} refresh={loadAll} refreshing={refreshing} flash={flash}
        />
      )}
    </div>
  );
}

/* ---------------------------------- auth screen --------------------------------- */

function AuthScreen({ onLogin, onSignup, users }) {
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
    <div className="min-h-[600px] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-6 justify-center">
          <div className="fl-display px-3 py-1 rounded" style={{ background: COLORS.ink, color: COLORS.amber, fontWeight: 800, fontSize: 22 }}>FL</div>
          <div>
            <div className="fl-display text-xl font-bold tracking-wide" style={{ color: COLORS.ink }}>FIELD LEDGER</div>
            <div className="text-xs" style={{ color: COLORS.inkSoft }}>Registration &amp; agent performance tracker</div>
          </div>
        </div>

        <Card className="overflow-hidden">
          <div className="flex overflow-hidden fl-stub" style={{ background: COLORS.ink }}>
            <div className="w-2 shrink-0" />
            <div className="flex flex-1">
              <button onClick={() => { setMode('login'); setErr(''); }} className="fl-focus flex-1 py-3 text-sm font-semibold"
                style={{ color: mode === 'login' ? COLORS.amber : COLORS.paper, opacity: mode === 'login' ? 1 : 0.6 }}>LOG IN</button>
              <button onClick={() => { setMode('signup'); setErr(''); }} className="fl-focus flex-1 py-3 text-sm font-semibold"
                style={{ color: mode === 'signup' ? COLORS.amber : COLORS.paper, opacity: mode === 'signup' ? 1 : 0.6 }}>REGISTER</button>
            </div>
          </div>

          <div className="p-5">
            {mode === 'login' ? (
              <form onSubmit={doLogin}>
                <Field label="Phone Number">
                  <TextInput value={phone} onChange={e => setPhone(e.target.value)} placeholder="080..." inputMode="tel" />
                </Field>
                <Field label="PIN">
                  <div className="relative">
                    <TextInput type={showPin ? 'text' : 'password'} value={pin} onChange={e => setPin(e.target.value)} placeholder="••••" inputMode="numeric" />
                    <button type="button" onClick={() => setShowPin(s => !s)} className="absolute right-2 top-1/2 -translate-y-1/2" style={{ color: COLORS.inkSoft }}>
                      {showPin ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </Field>
                {err && <div className="flex items-center gap-1.5 text-sm mb-3" style={{ color: COLORS.red }}><AlertCircle size={14} />{err}</div>}
                <Btn type="submit" full disabled={busy} icon={busy ? Loader2 : ArrowRight}>{busy ? 'Checking…' : 'Log In'}</Btn>
              </form>
            ) : (
              <form onSubmit={doSignup}>
                <Field label="Full Name"><TextInput value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Chidi Okafor" /></Field>
                <Field label="Phone Number"><TextInput value={phone} onChange={e => setPhone(e.target.value)} placeholder="080..." inputMode="tel" /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="PIN (4–6 digits)"><TextInput type="password" value={pin} onChange={e => setPin(e.target.value)} inputMode="numeric" /></Field>
                  <Field label="Confirm PIN"><TextInput type="password" value={confirmPin} onChange={e => setConfirmPin(e.target.value)} inputMode="numeric" /></Field>
                </div>

                <span className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: COLORS.inkSoft }}>Your Role</span>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {ROLES.map(r => (
                    <button type="button" key={r.id} onClick={() => setRole(r.id)}
                      className="fl-focus text-left p-2.5 rounded-md border"
                      style={{ borderColor: role === r.id ? COLORS.amberDark : COLORS.line, background: role === r.id ? '#FBEBD1' : '#fff' }}>
                      <r.icon size={15} style={{ color: COLORS.ink }} />
                      <div className="text-xs font-semibold mt-1">{r.label}</div>
                      <div className="text-[10px]" style={{ color: COLORS.inkSoft }}>{r.desc}</div>
                    </button>
                  ))}
                </div>

                {role === 'agent' && (
                  <Field label="Your Supervisor (optional — can be assigned later)">
                    <Select value={supervisorPhone} onChange={e => setSupervisorPhone(e.target.value)}>
                      <option value="">Not assigned yet</option>
                      {supervisors.map(s => <option key={s.phone} value={s.phone}>{s.name}</option>)}
                    </Select>
                  </Field>
                )}

                {ROLE_MAP[role].needsCode && (
                  <Field label="Agency Access Code">
                    <TextInput value={code} onChange={e => setCode(e.target.value)} placeholder="Get this from your Super Admin" />
                  </Field>
                )}

                {err && <div className="flex items-center gap-1.5 text-sm mb-3" style={{ color: COLORS.red }}><AlertCircle size={14} />{err}</div>}
                <Btn type="submit" full disabled={busy} icon={busy ? Loader2 : ArrowRight}>{busy ? 'Creating account…' : 'Create Account'}</Btn>
              </form>
            )}
          </div>
        </Card>
        <p className="text-center text-[11px] mt-4" style={{ color: COLORS.inkSoft }}>
          Internal tool — data is shared across everyone using this app link.
        </p>
      </div>
    </div>
  );
}

/* ----------------------------------- dashboard shell ----------------------------------- */

const NAV = {
  agent: [['log', 'Log Work', ClipboardList], ['verify', 'Live Verify', Search], ['stats', 'My Stats', TrendingUp], ['supplies', 'Supplies', Package], ['profile', 'Profile', User]],
  supervisor: [['team', 'My Team', Users], ['supplies', 'Supplies', Package], ['profile', 'Profile', User]],
  ict: [['queue', 'Print Queue', Printer], ['profile', 'Profile', User]],
  store: [['requests', 'Requests', Boxes], ['profile', 'Profile', User]],
  admin: [['overview', 'Overview', Home], ['verify', 'Live Verify', Search], ['teams', 'Supervisors', Users], ['staff', 'Staff', UserPlus], ['requests', 'Logistics', Boxes], ['profile', 'Profile', User]],
  super_admin: [['overview', 'Overview', Home], ['verify', 'Live Verify', Search], ['settings', 'Settings & Services', Settings], ['teams', 'Supervisors', Users], ['staff', 'Staff', UserPlus], ['requests', 'Logistics', Boxes], ['profile', 'Profile', User]],
};

function Dashboard({ user, setUser, users, types, activities, logistics, onLogout, refresh, refreshing, flash }) {
  const nav = NAV[user.role];
  const [view, setView] = useState(nav[0][0]);
  const roleDef = ROLE_MAP[user.role];

  const ctx = { user, setUser, users, types, activities, logistics, refresh, flash };

  return (
    <div className="flex min-h-[600px]">
      {/* desktop sidebar */}
      <div className="hidden md:flex flex-col w-56 shrink-0 fl-stub" style={{ background: COLORS.ink }}>
        <div className="w-full pl-2">
          <div className="p-4 flex items-center gap-2">
            <div className="fl-display px-2 py-0.5 rounded" style={{ background: COLORS.amber, color: COLORS.ink, fontWeight: 800 }}>FL</div>
            <div className="fl-display font-bold tracking-wide" style={{ color: COLORS.paper }}>FIELD LEDGER</div>
          </div>
          <nav className="mt-2 px-2">
            {nav.map(([id, label, Icon]) => (
              <button key={id} onClick={() => setView(id)}
                className="fl-focus w-full flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm font-medium mb-1"
                style={{ background: view === id ? 'rgba(232,162,58,0.15)' : 'transparent', color: view === id ? COLORS.amber : COLORS.paper }}>
                <Icon size={16} />{label}
              </button>
            ))}
          </nav>
          <div className="mt-auto p-3">
            <button onClick={onLogout} className="fl-focus w-full flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm font-medium" style={{ color: COLORS.paper, opacity: 0.7 }}>
              <LogOut size={16} />Log Out
            </button>
          </div>
        </div>
      </div>

      {/* main */}
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-center justify-between px-4 md:px-6 py-3 border-b" style={{ borderColor: COLORS.line }}>
          <div>
            <div className="text-xs" style={{ color: COLORS.inkSoft }}>{roleDef.label}</div>
            <div className="fl-display text-lg font-bold leading-tight">Hi, {user.name.split(' ')[0]}</div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={refresh} className="fl-focus p-2 rounded-md border" style={{ borderColor: COLORS.line }} title="Refresh">
              <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} style={{ color: COLORS.inkSoft }} />
            </button>
            <Avatar name={user.name} size={34} />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto fl-scroll p-4 md:p-6 pb-24 md:pb-6">
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
          {view === 'profile' && <ProfilePanel ctx={ctx} onLogout={onLogout} />}
        </div>
      </div>

      {/* mobile bottom nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 flex border-t z-40" style={{ background: COLORS.ink, borderColor: COLORS.line }}>
        {nav.map(([id, label, Icon]) => (
          <button key={id} onClick={() => setView(id)} className="fl-focus flex-1 flex flex-col items-center gap-0.5 py-2.5"
            style={{ color: view === id ? COLORS.amber : COLORS.paper, opacity: view === id ? 1 : 0.65 }}>
            <Icon size={18} /><span className="text-[10px] font-medium">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ----------------------------------- LIVE VERIFICATION ----------------------------------- */

function LiveVerification({ ctx }) {
  const { types, user, refresh, flash } = ctx;
  const [method, setMethod] = useState('nin-verification');
  const [inputValue, setInputValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const METHODS = [
    { id: 'nin-verification', label: 'NIN by Number', placeholder: 'Enter 11-digit NIN' },
    { id: 'nin-phone', label: 'NIN by Phone', placeholder: 'Enter linked phone number' },
    { id: 'bvn-verification', label: 'BVN by Number', placeholder: 'Enter 11-digit BVN' },
    { id: 'bvn-phone', label: 'BVN by Phone', placeholder: 'Enter linked phone number' }
  ];

  const activeMethod = METHODS.find(m => m.id === method);

  const doVerify = async (e) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    
    setBusy(true); setResult(null);
    const key = await safeGet('api_key', true);
    if (!key) {
      flash('API Key not configured. Ask Super Admin to set it up.', 'red');
      setBusy(false); return;
    }

    let payload = {};
    if (method === 'nin-verification') payload = { nin: inputValue.trim() };
    else if (method === 'nin-phone') payload = { phone: inputValue.trim() };
    else if (method === 'bvn-verification') payload = { bvn: inputValue.trim() };
    else if (method === 'bvn-phone') payload = { phone: inputValue.trim() };

    try {
      const res = await fetch(`https://checkmyninbvn.com.ng/api/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key },
        body: JSON.stringify({ ...payload, consent: true }) // compliance enforce
      });
      const data = await res.json();
      if (data.status === 'success' || data.data) {
        setResult(data.data || data);
        flash('Verification successful', 'green');
      } else {
        flash(data.message || 'Verification failed or not found', 'red');
      }
    } catch (err) {
      flash('Network error connecting to verification API.', 'red');
    }
    setBusy(false);
  };

  const logToLedger = async () => {
    let typeId = null;
    if (method.includes('nin')) typeId = types.find(t => t.id === 'nin')?.id;
    if (method.includes('bvn')) typeId = types.find(t => t.id === 'bvn')?.id;

    if (!typeId) {
      flash('Service type not active in ledger.', 'red'); return;
    }

    const t = types.find(x => x.id === typeId);
    const entry = {
      id: uid(), agentPhone: user.phone, agentName: user.name, supervisorPhone: user.supervisorPhone || null,
      typeId, typeName: t ? t.name : typeId, count: 1, date: todayStr(), note: `Verified via Live API (${inputValue})`,
      createdAt: new Date().toISOString(), printStatus: t && t.requiresPrinting ? 'pending' : null,
    };
    await saveItem(`activities:${entry.id}`, entry, true);
    await refresh();
    flash('Automatically logged to your ledger!', 'green');
  };

  return (
    <div className="max-w-2xl">
      <h2 className="fl-display text-xl font-bold mb-3">Live API Verification</h2>
      
      <Card className="p-4 mb-5">
        <form onSubmit={doVerify}>
          <div className="grid sm:grid-cols-2 gap-3 mb-4">
            <Field label="Search Method">
              <Select value={method} onChange={e => { setMethod(e.target.value); setResult(null); }}>
                {METHODS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </Select>
            </Field>
            <Field label="Target Number">
              <TextInput value={inputValue} onChange={e => setInputValue(e.target.value)} placeholder={activeMethod.placeholder} />
            </Field>
          </div>
          <p className="text-xs mb-4" style={{ color: COLORS.inkSoft }}>
            <strong>Compliance Notice:</strong> By clicking Verify, you confirm you have obtained explicit consent from the data subject as required by the NDPA.
          </p>
          <Btn type="submit" full disabled={busy} icon={busy ? Loader2 : Search}>{busy ? 'Contacting API…' : 'Run Live Verification'}</Btn>
        </form>
      </Card>

      {result && (
        <div>
          <SectionTitle>Verification Result</SectionTitle>
          <Card className="overflow-hidden bg-white">
            <div className="p-1" style={{ background: COLORS.ink }} />
            <div className="p-4 sm:p-6 flex flex-col sm:flex-row gap-5 items-start">
              {result.photo ? (
                <div className="w-24 h-24 sm:w-32 sm:h-32 shrink-0 rounded-md overflow-hidden bg-gray-100 border border-gray-200">
                  <img src={`data:image/jpeg;base64,${result.photo}`} alt="ID Photo" className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="w-24 h-24 sm:w-32 sm:h-32 shrink-0 rounded-md bg-gray-100 border border-gray-200 flex items-center justify-center text-xs text-gray-400 text-center">
                  No Photo<br/>Available
                </div>
              )}
              <div className="flex-1 min-w-0 space-y-3">
                <div>
                  <div className="text-xs uppercase tracking-widest text-gray-500 font-semibold mb-0.5">Full Name</div>
                  <div className="text-lg font-bold">{(result.firstname || '') + ' ' + (result.middlename || '') + ' ' + (result.surname || '')}</div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-0.5">Date of Birth</div>
                    <div className="text-sm font-medium">{result.birthdate || result.dob || 'N/A'}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-0.5">Gender</div>
                    <div className="text-sm font-medium">{result.gender || 'N/A'}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-0.5">Phone Number</div>
                    <div className="text-sm font-medium">{result.telephoneno || result.phone || 'N/A'}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-0.5">State</div>
                    <div className="text-sm font-medium">{result.residence_state || result.state || 'N/A'}</div>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-0.5">Address</div>
                  <div className="text-sm font-medium truncate">{result.residence_address || result.address || 'N/A'}</div>
                </div>
              </div>
            </div>
            <div className="p-3 border-t bg-gray-50" style={{ borderColor: COLORS.line }}>
              <Btn full tone="green" onClick={logToLedger} icon={ClipboardList}>Log this Verification to Ledger</Btn>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

/* ----------------------------------- agent: log work ----------------------------------- */

function AgentLog({ ctx }) {
  const { user, types, activities, refresh, flash } = ctx;
  const [typeId, setTypeId] = useState(types.find(t => t.active !== false)?.id || '');
  const [count, setCount] = useState(1);
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const activeTypes = types.filter(t => t.active !== false);
  const mine = activities.filter(a => a.agentPhone === user.phone);
  const today = mine.filter(a => a.date === todayStr()).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const todayCount = today.reduce((s, a) => s + Number(a.count || 0), 0);
  const pm = priceMapOf(types);
  const todayValue = today.reduce((s, a) => s + Number(a.count || 0) * (pm[a.typeId] || 0), 0);

  const submit = async () => {
    if (!typeId || count < 1) { flash('Pick a type and a count of at least 1.', 'red'); return; }
    setBusy(true);
    const t = types.find(x => x.id === typeId);
    const entry = {
      id: uid(), agentPhone: user.phone, agentName: user.name, supervisorPhone: user.supervisorPhone || null,
      typeId, typeName: t ? t.name : typeId, count: Number(count), date, note: note.trim(),
      createdAt: new Date().toISOString(), printStatus: t && t.requiresPrinting ? 'pending' : null,
    };
    await saveItem(`activities:${entry.id}`, entry, true);
    setCount(1); setNote('');
    await refresh();
    setBusy(false);
    flash('Entry saved.', 'green');
  };

  const removeEntry = async (id) => {
    await deleteItem(`activities:${id}`, true);
    await refresh();
    flash('Entry removed.');
  };

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <StatTile label="Today's Tally" value={todayCount} icon={ClipboardList} />
        <StatTile label="Today's Value" value={fmtNaira(todayValue)} icon={CircleDollarSign} />
        <StatTile label="Entries Today" value={today.length} icon={TrendingUp} />
        <StatTile label="Supervisor" value={ctx.users.find(u => u.phone === user.supervisorPhone)?.name?.split(' ')[0] || '—'} icon={Users} />
      </div>

      <Card className="p-4 mb-6">
        <SectionTitle>Manual Tally Logging</SectionTitle>
        <span className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: COLORS.inkSoft }}>Type</span>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
          {activeTypes.map(t => (
            <button key={t.id} onClick={() => setTypeId(t.id)} className="fl-focus text-left p-2.5 rounded-md border"
              style={{ borderColor: typeId === t.id ? COLORS.amberDark : COLORS.line, background: typeId === t.id ? '#FBEBD1' : '#fff' }}>
              <div className="text-xs font-semibold">{t.name}</div>
              <div className="text-[10px] fl-mono" style={{ color: COLORS.inkSoft }}>{fmtNaira(t.price)}/reg</div>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Count">
            <div className="flex items-center gap-2">
              <button onClick={() => setCount(c => Math.max(1, c - 1))} className="fl-focus p-2 rounded-md border" style={{ borderColor: COLORS.line }}><Minus size={14} /></button>
              <input type="number" value={count} onChange={e => setCount(Math.max(1, Number(e.target.value) || 1))} className="fl-focus text-center rounded-md px-2 py-2 text-sm w-full" style={inputStyle} />
              <button onClick={() => setCount(c => c + 1)} className="fl-focus p-2 rounded-md border" style={{ borderColor: COLORS.line }}><Plus size={14} /></button>
            </div>
          </Field>
          <Field label="Date"><TextInput type="date" value={date} max={todayStr()} onChange={e => setDate(e.target.value)} /></Field>
        </div>
        <Field label="Note (optional)"><TextInput value={note} onChange={e => setNote(e.target.value)} placeholder="Location, batch reference, etc." /></Field>
        <Btn onClick={submit} full disabled={busy} icon={busy ? Loader2 : Check}>{busy ? 'Saving…' : 'Save Entry'}</Btn>
      </Card>

      <SectionTitle>Today's Entries</SectionTitle>
      {today.length === 0 && <Empty text="No entries logged yet today." />}
      <div className="space-y-2">
        {today.map(a => (
          <Card key={a.id} className="p-3 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">{a.typeName} <span className="fl-mono font-normal" style={{ color: COLORS.inkSoft }}>× {a.count}</span></div>
              <div className="text-xs fl-mono truncate" style={{ color: COLORS.inkSoft }}>{fmtTime(a.createdAt)} {a.note ? `· ${a.note}` : ''}</div>
            </div>
            <button onClick={() => removeEntry(a.id)} className="fl-focus p-1.5" style={{ color: COLORS.red }}><Trash2 size={15} /></button>
          </Card>
        ))}
      </div>
    </div>
  );
}

function AgentStats({ ctx }) {
  const { user, types, activities } = ctx;
  const [range, setRange] = useState('week');
  const mine = activities.filter(a => a.agentPhone === user.phone && isInRange(a.date, range));
  const pm = priceMapOf(types);
  const count = mine.reduce((s, a) => s + Number(a.count || 0), 0);
  const value = mine.reduce((s, a) => s + Number(a.count || 0) * (pm[a.typeId] || 0), 0);
  const bt = breakdown(mine.map(a => ({ ...a })), types, 'all');

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="fl-display text-xl font-bold">My Performance</h2>
        <RangeTabs value={range} onChange={setRange} />
      </div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <StatTile label="Registrations" value={count} icon={ClipboardList} />
        <StatTile label="Value Generated" value={fmtNaira(value)} icon={CircleDollarSign} />
      </div>
      <SectionTitle>By Type</SectionTitle>
      {bt.length === 0 ? <Empty text="No activity in this range." /> : (
        <Card className="p-3 space-y-2">
          {bt.map(b => (
            <div key={b.name} className="flex items-center justify-between text-sm">
              <span>{b.name}</span>
              <span className="fl-mono font-semibold">{b.count}</span>
            </div>
          ))}
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
    <div>
      <h2 className="fl-display text-xl font-bold mb-3">Supplies &amp; Logistics</h2>
      <Card className="p-4 mb-4">
        <SectionTitle>Request Supplies</SectionTitle>
        <Field label="Item"><TextInput value={item} onChange={e => setItem(e.target.value)} placeholder="e.g. NIN capture forms, SIM starter packs" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantity"><TextInput type="number" min={1} value={qty} onChange={e => setQty(e.target.value)} /></Field>
          <Field label="Note (optional)"><TextInput value={note} onChange={e => setNote(e.target.value)} placeholder="Delivery location, urgency…" /></Field>
        </div>
        <Btn onClick={submit} full disabled={busy} icon={busy ? Loader2 : Package}>{busy ? 'Sending…' : 'Send Request to Store'}</Btn>
      </Card>

      <SectionTitle>My Requests</SectionTitle>
      {mine.length === 0 ? <Empty text="No requests yet." /> : (
        <div className="space-y-2">
          {mine.map(l => <LogisticsRow key={l.id} l={l} />)}
        </div>
      )}
    </div>
  );
}

function statusBadge(status) {
  if (status === 'dispatched') return <Badge tone="green"><CheckCircle2 size={11} />Dispatched</Badge>;
  if (status === 'rejected') return <Badge tone="red"><XCircle size={11} />Rejected</Badge>;
  return <Badge tone="amber"><Clock size={11} />Pending</Badge>;
}

function LogisticsRow({ l, action }) {
  return (
    <Card className="p-3 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-sm font-semibold truncate">{l.item} <span className="fl-mono font-normal" style={{ color: COLORS.inkSoft }}>× {l.quantity}</span></div>
        <div className="text-xs truncate" style={{ color: COLORS.inkSoft }}>{l.requesterName} · {ROLE_MAP[l.requesterRole]?.label || l.requesterRole} {l.note ? `· ${l.note}` : ''}</div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
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

  return (
    <div>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="fl-display text-xl font-bold">My Team</h2>
        <RangeTabs value={range} onChange={setRange} />
      </div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <StatTile label="Agents" value={myAgents.length} sub={myAgents.length > 10 ? 'Above recommended 10' : undefined} icon={Users} />
        <StatTile label="Registrations" value={teamCount} icon={ClipboardList} />
        <StatTile label="Value" value={fmtNaira(teamValue)} icon={CircleDollarSign} />
      </div>

      <SectionTitle>Team Leaderboard</SectionTitle>
      <LeaderboardTable rows={rows} />

      {unassigned.length > 0 && (
        <>
          <SectionTitle>Unassigned Agents — Add to Team</SectionTitle>
          <div className="space-y-2">
            {unassigned.map(a => (
              <Card key={a.phone} className="p-3 flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <Avatar name={a.name} size={30} />
                  <div className="text-sm font-medium truncate">{a.name}</div>
                </div>
                <Btn size="sm" onClick={() => claim(a.phone)} icon={UserPlus}>Add</Btn>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function LeaderboardTable({ rows, nameLabel = 'Name', valueLabel = 'Registrations' }) {
  return (
    <Card className="overflow-hidden overflow-x-auto fl-scroll">
      <table className="w-full text-sm">
        <thead>
          <tr style={{ background: COLORS.ink }}>
            <th className="px-3 py-2 text-left fl-display text-xs tracking-wide" style={{ color: COLORS.paper }}>#</th>
            <th className="px-3 py-2 text-left fl-display text-xs tracking-wide" style={{ color: COLORS.paper }}>{nameLabel}</th>
            <th className="px-3 py-2 text-right fl-display text-xs tracking-wide" style={{ color: COLORS.paper }}>{valueLabel}</th>
            <th className="px-3 py-2 text-right fl-display text-xs tracking-wide" style={{ color: COLORS.paper }}>Value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id || i} className="border-t" style={{ borderColor: COLORS.line }}>
              <td className="px-3 py-2 fl-mono" style={{ color: COLORS.inkSoft }}>{i + 1}</td>
              <td className="px-3 py-2 font-medium">{r.name}</td>
              <td className="px-3 py-2 text-right fl-mono">{r.count}</td>
              <td className="px-3 py-2 text-right fl-mono">{fmtNaira(r.value)}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={4}><Empty text="No entries yet." /></td></tr>}
        </tbody>
      </table>
    </Card>
  );
}

/* ----------------------------------- ict: print queue ----------------------------------- */

function PrintQueue({ ctx }) {
  const { types, activities, refresh, flash } = ctx;
  const [filter, setFilter] = useState('pending');
  const printableTypeIds = new Set(types.filter(t => t.requiresPrinting).map(t => t.id));
  const queue = activities.filter(a => printableTypeIds.has(a.typeId)).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
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
      <h2 className="fl-display text-xl font-bold mb-3">ID Print Queue</h2>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <StatTile label="Pending Cards" value={pendingCount} icon={Printer} />
        <StatTile label="Batches Queued" value={queue.length} icon={ClipboardList} />
      </div>
      <div className="mb-3">
        <RangeTabs value={filter} onChange={setFilter} options={[['pending', 'Pending'], ['printed', 'Printed'], ['all', 'All']]} />
      </div>
      {shown.length === 0 ? <Empty text="Nothing here." /> : (
        <div className="space-y-2">
          {shown.map(a => (
            <Card key={a.id} className="p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold">{a.typeName} <span className="fl-mono font-normal" style={{ color: COLORS.inkSoft }}>× {a.count}</span></div>
                <div className="text-xs fl-mono" style={{ color: COLORS.inkSoft }}>{a.agentName} · {fmtDate(a.date)} {a.note ? `· ${a.note}` : ''}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {(a.printStatus || 'pending') === 'printed' ? <Badge tone="green">Printed</Badge> : <Badge tone="amber">Pending</Badge>}
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
      <h2 className="fl-display text-xl font-bold mb-3">Logistics Requests</h2>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <StatTile label="Pending" value={logistics.filter(l => l.status === 'pending').length} icon={Clock} />
        <StatTile label="Dispatched" value={logistics.filter(l => l.status === 'dispatched').length} icon={CheckCircle2} />
        <StatTile label="Rejected" value={logistics.filter(l => l.status === 'rejected').length} icon={XCircle} />
      </div>
      <div className="mb-3"><RangeTabs value={filter} onChange={setFilter} options={[['pending', 'Pending'], ['dispatched', 'Dispatched'], ['rejected', 'Rejected'], ['all', 'All']]} /></div>
      {shown.length === 0 ? <Empty text="Nothing here." /> : (
        <div className="space-y-2">
          {shown.map(l => (
            <LogisticsRow key={l.id} l={l} action={l.status === 'pending' ? (
              <div className="flex gap-1.5">
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
  const { logistics } = ctx;
  const sorted = [...logistics].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return (
    <div>
      <h2 className="fl-display text-xl font-bold mb-3">Logistics Requests (Org-wide)</h2>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <StatTile label="Pending" value={logistics.filter(l => l.status === 'pending').length} icon={Clock} />
        <StatTile label="Dispatched" value={logistics.filter(l => l.status === 'dispatched').length} icon={CheckCircle2} />
        <StatTile label="Rejected" value={logistics.filter(l => l.status === 'rejected').length} icon={XCircle} />
      </div>
      {sorted.length === 0 ? <Empty text="No requests yet." /> : <div className="space-y-2">{sorted.map(l => <LogisticsRow key={l.id} l={l} />)}</div>}
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
          const res = await fetch(`https://checkmyninbvn.com.ng/api/balance`, { headers: { 'x-api-key': key }});
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
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="fl-display text-xl font-bold">Organisation Overview</h2>
        <RangeTabs value={range} onChange={setRange} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <StatTile label="Registrations" value={totalCount} icon={ClipboardList} />
        <StatTile label="Value Generated" value={fmtNaira(totalValue)} icon={CircleDollarSign} />
        <StatTile label="Active Agents" value={activeAgents} sub={`of ${agents.length} total`} icon={Users} />
        {balance !== null ? (
          <StatTile label="API Wallet" value={fmtNaira(balance)} loading={balLoading} icon={Wallet} />
        ) : (
          <StatTile label="Pending Supplies" value={pendingLogistics} icon={Package} />
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
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
        <Card className="p-3 space-y-2">
          {bt.map(b => (
            <div key={b.name} className="flex items-center justify-between text-sm">
              <span>{b.name}</span>
              <span className="fl-mono font-semibold">{b.count}</span>
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
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="fl-display text-xl font-bold">Supervisors &amp; Teams</h2>
        <RangeTabs value={range} onChange={setRange} />
      </div>
      {supervisors.length === 0 && <Empty text="No supervisors registered yet." />}
      <div className="space-y-3">
        {supervisors.map(s => {
          const team = agents.filter(a => a.supervisorPhone === s.phone);
          const rows = agentRows(team, activities, types, range);
          const count = rows.reduce((x, y) => x + y.count, 0);
          const isOpen = open === s.phone;
          return (
            <Card key={s.phone} className="p-0 overflow-hidden">
              <button onClick={() => setOpen(isOpen ? null : s.phone)} className="fl-focus w-full flex items-center justify-between p-3">
                <div className="flex items-center gap-2.5">
                  <Avatar name={s.name} size={34} />
                  <div className="text-left">
                    <div className="text-sm font-semibold">{s.name}</div>
                    <div className="text-xs" style={{ color: COLORS.inkSoft }}>{team.length} agents · {count} registrations</div>
                  </div>
                </div>
                <ChevronRight size={16} style={{ transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} />
              </button>
              {isOpen && <div className="px-3 pb-3"><LeaderboardTable rows={rows} /></div>}
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
      <h2 className="fl-display text-xl font-bold mb-3">Staff Directory</h2>
      <div className="flex flex-wrap gap-2 mb-3">
        <TextInput placeholder="Search name or phone…" value={q} onChange={e => setQ(e.target.value)} className="max-w-xs" />
        <Select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} className="max-w-[180px]">
          <option value="all">All Roles</option>
          {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
        </Select>
      </div>
      <div className="space-y-2">
        {filtered.map(u => (
          <Card key={u.phone} className="p-3 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2.5 min-w-0">
              <Avatar name={u.name} size={34} />
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">{u.name} {u.phone === me.phone && <span className="text-xs" style={{ color: COLORS.inkSoft }}>(you)</span>}</div>
                <div className="text-xs fl-mono truncate" style={{ color: COLORS.inkSoft }}>{u.phone} · {ROLE_MAP[u.role]?.label}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {u.role === 'agent' && (
                <Select value={u.supervisorPhone || ''} onChange={e => reassign(u, e.target.value)} className="text-xs py-1.5 w-40">
                  <option value="">No supervisor</option>
                  {supervisors.map(s => <option key={s.phone} value={s.phone}>{s.name}</option>)}
                </Select>
              )}
              {u.active === false ? <Badge tone="red">Inactive</Badge> : <Badge tone="green">Active</Badge>}
              {u.phone !== me.phone && <Btn size="sm" tone="ghost" onClick={() => toggleActive(u)}>{u.active === false ? 'Reactivate' : 'Deactivate'}</Btn>}
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
  const [keyLoading, setKeyLoading] = useState(true);

  useEffect(() => { setRows(types); }, [types]);

  useEffect(() => {
    (async () => {
      const k = await safeGet('api_key', true);
      if (k) setApiKey(k);
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

  const saveApiKey = async () => {
    if (!apiKey.trim()) { flash('API key cannot be empty.', 'red'); return; }
    await saveItem('api_key', apiKey.trim(), true);
    flash('API Key saved securely.', 'green');
  };

  return (
    <div>
      <h2 className="fl-display text-xl font-bold mb-3">Settings &amp; Services</h2>

      {/* API Key Panel */}
      <Card className="p-4 mb-6 border-l-4" style={{ borderLeftColor: COLORS.amberDark }}>
        <SectionTitle>Verification API Integration</SectionTitle>
        <p className="text-sm mb-4" style={{ color: COLORS.inkSoft }}>Configure your <strong>checkmyninbvn.com.ng</strong> API key to enable Live Verification for all agents.</p>
        {!keyLoading && (
          <div className="flex gap-3">
            <TextInput type="password" placeholder="Paste x-api-key here..." value={apiKey} onChange={e => setApiKey(e.target.value)} className="flex-1" />
            <Btn onClick={saveApiKey} icon={KeyRound}>Save Key</Btn>
          </div>
        )}
      </Card>

      {/* Pricing Table */}
      <SectionTitle>Registration Types &amp; Pricing</SectionTitle>
      <Card className="overflow-hidden mb-4">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: COLORS.ink }}>
              <th className="px-3 py-2 text-left fl-display text-xs" style={{ color: COLORS.paper }}>Type</th>
              <th className="px-3 py-2 text-left fl-display text-xs" style={{ color: COLORS.paper }}>Value (₦)</th>
              <th className="px-3 py-2 text-center fl-display text-xs" style={{ color: COLORS.paper }}>Needs Printing</th>
              <th className="px-3 py-2 text-center fl-display text-xs" style={{ color: COLORS.paper }}>Active</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-t" style={{ borderColor: COLORS.line }}>
                <td className="px-3 py-2"><TextInput value={r.name} onChange={e => update(r.id, { name: e.target.value })} /></td>
                <td className="px-3 py-2"><TextInput type="number" value={r.price} onChange={e => update(r.id, { price: e.target.value })} className="w-28" /></td>
                <td className="px-3 py-2 text-center"><input type="checkbox" checked={!!r.requiresPrinting} onChange={e => update(r.id, { requiresPrinting: e.target.checked })} /></td>
                <td className="px-3 py-2 text-center"><input type="checkbox" checked={r.active !== false} onChange={e => update(r.id, { active: e.target.checked })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="p-3 border-t" style={{ borderColor: COLORS.line }}><Btn onClick={savePricing} icon={Check}>Save Changes</Btn></div>
      </Card>

      {/* Add New Type */}
      <SectionTitle>Add New Type</SectionTitle>
      <Card className="p-4 mb-6">
        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="Name"><TextInput value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Kuda Account" /></Field>
          <Field label="Value (₦)"><TextInput type="number" value={newPrice} onChange={e => setNewPrice(e.target.value)} /></Field>
          <label className="flex items-center gap-2 mt-6"><input type="checkbox" checked={newPrint} onChange={e => setNewPrint(e.target.checked)} /><span className="text-sm">Requires ID printing</span></label>
        </div>
        <Btn onClick={addType} icon={Plus}>Add Type</Btn>
      </Card>
    </div>
  );
}

/* ----------------------------------- profile ----------------------------------- */

function ProfilePanel({ ctx, onLogout }) {
  const { user, users } = ctx;
  const supervisor = users.find(u => u.phone === user.supervisorPhone);
  return (
    <div className="max-w-md">
      <h2 className="fl-display text-xl font-bold mb-3">Profile</h2>
      <Card className="overflow-hidden">
        <div className="flex fl-stub" style={{ background: COLORS.ink }}>
          <div className="w-2 shrink-0" />
          <div className="p-4 flex items-center gap-3 flex-1">
            <Avatar name={user.name} size={48} />
            <div>
              <div className="fl-display text-lg font-bold" style={{ color: COLORS.paper }}>{user.name}</div>
              <div className="text-xs" style={{ color: COLORS.amber }}>{ROLE_MAP[user.role]?.label}</div>
            </div>
          </div>
        </div>
        <div className="p-4 space-y-2 text-sm">
          <div className="flex justify-between"><span style={{ color: COLORS.inkSoft }}>Phone</span><span className="fl-mono">{user.phone}</span></div>
          {user.role === 'agent' && <div className="flex justify-between"><span style={{ color: COLORS.inkSoft }}>Supervisor</span><span>{supervisor ? supervisor.name : 'Not assigned'}</span></div>}
          <div className="flex justify-between"><span style={{ color: COLORS.inkSoft }}>Registered</span><span className="fl-mono">{(user.createdAt || '').slice(0, 10)}</span></div>
        </div>
      </Card>
      <div className="mt-4"><Btn tone="ghost" onClick={onLogout} icon={LogOut} full>Log Out</Btn></div>
      <p className="text-[11px] mt-4" style={{ color: COLORS.inkSoft }}>
        Data in this app is stored and shared across everyone using this link. It's built for internal day-to-day tracking — for production rollout with sensitive ID data, plan to move to a properly secured backend.
      </p>
    </div>
  );
}