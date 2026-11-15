import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import {
  MONTHS, PRIVACY_URL, SUPPORT_EMAIL, TERMS_URL, UPI_PATTERN, computeBill, daysIn, demoStore, isoDay, missedDates,
  plural, remoteStore, rupees, upiLink, type Household, type Kind, type Marks, type Payment, type Rates, type Store,
} from "@/lib/milk";

const emptyMarks = (): Marks => ({ one: {}, half: {} });
const emptyRates = (): Rates => ({ one: {}, half: {} });

function friendly(err: unknown) {
  const msg = String((err as { message?: string })?.message || err || "");
  if (/fetch|network|Failed to/i.test(msg)) return "Couldn't reach the server. Check your internet connection.";
  return msg || "Something went wrong. Try again.";
}

function Logo() {
  return (
    <svg viewBox="0 0 48 48" width="56" height="56"><path d="M18 4h12v6l5 8v24a2 2 0 0 1-2 2H15a2 2 0 0 1-2-2V18l5-8z" fill="var(--ml-accent)" /><path d="M13 26h22v10H13z" fill="var(--ml-surface)" opacity=".9" /></svg>
  );
}

function Legal() {
  return (
    <>
      <a href={TERMS_URL} target="_blank" rel="noopener noreferrer">terms of service</a> and{" "}
      <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer">privacy policy</a>
    </>
  );
}

export function MilkLedger() {
  const [screen, setScreen] = useState<"loading" | "signin" | "main">("loading");
  const [signinError, setSigninError] = useState("");
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [store, setStore] = useState<Store | null>(null);
  const [demo, setDemo] = useState(false);
  const [household, setHousehold] = useState<Household | null>(null);
  const today = new Date();
  const [y, setY] = useState(today.getFullYear());
  const [m, setM] = useState(today.getMonth());
  const [kind, setKind] = useState<Kind>("one");
  const [marks, setMarks] = useState<Marks>(emptyMarks);
  const [rates, setRates] = useState<Rates>(emptyRates);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [paidChoice, setPaidChoice] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toastText, setToastText] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const loadToken = useRef(0);
  const writeChain = useRef<Promise<unknown>>(Promise.resolve());

  const toast = useCallback((t: string) => {
    setToastText(t);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastText(""), 3500);
  }, []);

  const loadMonth = useCallback(async (s: Store, yy: number, mm: number) => {
    const token = ++loadToken.current;
    try {
      const [rows, pays] = await Promise.all([s.deliveries(yy, mm), s.payments(yy, mm)]);
      if (token !== loadToken.current) return;
      const mk = emptyMarks(), rt = emptyRates();
      for (const r of rows) {
        const d = Number(r.day.slice(8, 10));
        mk[r.kind][d] = r.status;
        if (r.status === "y" && r.rate) rt[r.kind][d] = r.rate;
      }
      setMarks(mk); setRates(rt); setPayments(pays);
    } catch (e) {
      if (token === loadToken.current) toast(friendly(e));
    }
  }, [toast]);

  const enterApp = useCallback(async (mail: string, s: Store) => {
    setEmail(mail); setStore(s); setScreen("loading");
    try {
      setHousehold(await s.household());
    } catch (e) {
      setSigninError(friendly(e)); setScreen("signin"); return;
    }
    setScreen("main");
    const now = new Date();
    await loadMonth(s, now.getFullYear(), now.getMonth());
  }, [loadMonth]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("demo")) {
      setDemo(true);
      enterApp("demo@example.com", demoStore());
      return;
    }
    let currentId: string | null | undefined;
    const { data } = supabase.auth.onAuthStateChange((_e, session) => {
      const user = session?.user ?? null;
      if (currentId !== undefined && (user?.id ?? null) === currentId) return;
      currentId = user?.id ?? null;
      setTimeout(() => {
        if (user) enterApp(user.email || "", remoteStore(user.id));
        else { setStore(null); setScreen("signin"); }
      }, 0);
    });
    return () => data.subscription.unsubscribe();
  }, [enterApp]);

  function write(task: () => Promise<unknown>) {
    const s = store!;
    writeChain.current = writeChain.current.then(task).catch((e) => {
      toast("Couldn't save. " + friendly(e));
      return loadMonth(s, y, m);
    });
  }

  async function signIn() {
    setSigninError(""); setBusy(true);
    try {
      const res = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
      if (res.error) setSigninError("Sign-in failed. " + friendly(res.error));
    } finally { setBusy(false); }
  }

  async function signOut() {
    setSettingsOpen(false);
    if (demo) { window.location.href = "/"; return; }
    await supabase.auth.signOut({ scope: "local" }).catch(() => {});
  }

  if (screen === "loading" || (screen === "main" && !household)) {
    return <div className="screen center"><p className="muted">Loading…</p></div>;
  }

  if (screen === "signin") {
    return (
      <div className="screen signin">
        <div className="signin-inner">
          <div className="logo" aria-hidden="true"><Logo /></div>
          <h1>Milk Ledger</h1>
          <p className="lede">Tap the days your milk arrives. The month's bill adds itself up, and you pay the milkman by UPI.</p>
          <button className="btn google" onClick={signIn} disabled={busy}>
            <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.6 13.2l7.8 6.1C12.3 13.6 17.6 9.5 24 9.5z" /><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" /><path fill="#FBBC05" d="M10.4 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6.1C.9 16.5 0 20.1 0 24s.9 7.5 2.6 10.8l7.8-6.1z" /><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.4 0-11.7-4.1-13.6-9.8l-7.8 6.1C6.6 42.6 14.6 48 24 48z" /></svg>
            Sign in with Google
          </button>
          {signinError && <p className="error" role="alert">{signinError}</p>}
          <p className="fine">By signing in you agree to the <Legal />.</p>
          <p className="fine"><a href="/?demo">Try it with sample data</a></p>
        </div>
      </div>
    );
  }

  const h = household!;
  const s = store!;
  const rateNow = (k: Kind) => (k === "one" ? h.rate_one : h.rate_half);
  const isFuture = (d: number) => new Date(y, m, d) > new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const n = daysIn(y, m);
  const km = marks[kind];
  let yes = 0, no = 0, blank = 0;
  for (let d = 1; d <= n; d++) {
    if (km[d] === "y") yes++; else if (km[d] === "n") no++; else if (!isFuture(d)) blank++;
  }
  const b = computeBill(marks, rates, h, payments);
  const seller = h.seller_name || "your milk seller";
  const atLatest = y > today.getFullYear() || (y === today.getFullYear() && m >= today.getMonth());

  function tapDay(d: number) {
    const prev = marks[kind][d];
    const next = prev === "y" ? "n" : prev === "n" ? undefined : "y";
    const day = isoDay(y, m, d);
    const mk = { ...marks, [kind]: { ...marks[kind] } };
    const rt = { ...rates, [kind]: { ...rates[kind] } };
    if (next) mk[kind][d] = next; else delete mk[kind][d];
    if (next === "y") rt[kind][d] = rateNow(kind); else delete rt[kind][d];
    setMarks(mk); setRates(rt); setConfirmClear(false);
    const rate = next === "y" ? rateNow(kind) : null;
    const k = kind;
    write(() => (next ? s.setDeliveries([{ day, kind: k, status: next, rate }]) : s.clearDelivery(day, k)));
  }

  function goMonth(delta: number) {
    const d = new Date(y, m + delta, 1);
    setY(d.getFullYear()); setM(d.getMonth());
    setMarks(emptyMarks()); setRates(emptyRates()); setPayments([]); setConfirmClear(false);
    loadMonth(s, d.getFullYear(), d.getMonth());
  }

  function fillMonth() {
    const rows: { day: string; kind: Kind; status: "y"; rate: number }[] = [];
    const mk = { ...marks, [kind]: { ...marks[kind] } };
    const rt = { ...rates, [kind]: { ...rates[kind] } };
    for (let d = 1; d <= n; d++) {
      if (mk[kind][d] || isFuture(d)) continue;
      mk[kind][d] = "y"; rt[kind][d] = rateNow(kind);
      rows.push({ day: isoDay(y, m, d), kind, status: "y" as const, rate: rateNow(kind) });
    }
    setMarks(mk); setRates(rt); setConfirmClear(false);
    if (rows.length) write(() => s.setDeliveries(rows));
  }

  function clearMonth() {
    if (!confirmClear) { setConfirmClear(true); return; }
    setConfirmClear(false); setMarks(emptyMarks()); setRates(emptyRates());
    const yy = y, mm = m;
    write(() => s.clearMonth(yy, mm));
  }

  function payUpi() {
    if (!h.upi_id) { setSettingsOpen(true); return; }
    window.location.href = upiLink(h, b.due, y, m);
    setPaidChoice(true);
  }

  async function recordPaid(method: string) {
    setPaidChoice(false);
    if (b.due <= 0) return;
    const yy = y, mm = m, due = b.due;
    try {
      const p = await s.addPayment(yy, mm, due, method);
      setPayments((ps) => [...ps, p]);
      toast(`Saved: ${rupees(due)} paid for ${MONTHS[mm]}.`);
    } catch (e) { toast("Couldn't save the payment. " + friendly(e)); }
  }

  async function removePay(id: string) {
    if (confirmRemove !== id) { setConfirmRemove(id); return; }
    setConfirmRemove(null);
    try {
      await s.removePayment(id);
      setPayments((ps) => ps.filter((p) => p.id !== id));
    } catch (e) { toast("Couldn't remove it. " + friendly(e)); }
  }

  async function shareBill() {
    const month = `${MONTHS[m]} ${y}`;
    const lines = [`Hi${h.seller_name ? " " + h.seller_name : ""}, here is the milk bill for ${month}:`];
    if (b.one.days) lines.push(`1 litre: ${plural(b.one.days, "day")} = ${rupees(b.one.amount)}`);
    if (b.half.days) lines.push(`½ litre: ${plural(b.half.days, "day")} = ${rupees(b.half.amount)}`);
    lines.push(`Total: ${rupees(b.total)}`);
    const missed = missedDates(marks);
    if (missed.length) lines.push(`Not delivered on: ${missed.join(", ")} ${(MONTHS[m] ?? "").slice(0, 3)}`);
    if (b.paid > 0 && b.due > 0) lines.push(`Already paid: ${rupees(b.paid)}. Balance: ${rupees(b.due)}`);
    else if (b.due === 0) lines.push("Paid in full. Thank you!");
    else lines.push("I will pay by UPI. Thank you!");
    const text = lines.join("\n");
    try {
      if (navigator.share) await navigator.share({ text });
      else { await navigator.clipboard.writeText(text); toast("Bill copied."); }
    } catch { /* closed the share sheet */ }
  }

  const blanks = new Date(y, m, 1).getDay();

  return (
    <>
      <div className="screen">
        <main className="app">
          <header className="top">
            <h1>Milk Ledger</h1>
            <button className="icon-btn" aria-label="Settings" onClick={() => setSettingsOpen(true)}>
              <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="currentColor" d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.5 7.5 0 0 0-1.7-1L15 3.3h-4l-.4 2.6a7.5 7.5 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.5 7.5 0 0 0 1.7 1l.4 2.6h4l.4-2.6a7.5 7.5 0 0 0 1.7-1l2.5 1 2-3.5zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" transform="translate(-1 0)" /></svg>
            </button>
          </header>

          {!h.upi_id && (
            <div className="setup">
              <p><b>Add your milk seller</b>Set their UPI ID and your rates so you can pay from the app.</p>
              <button className="btn primary" onClick={() => setSettingsOpen(true)}>Open settings</button>
            </div>
          )}

          <div className="month-nav">
            <button className="nav-btn" aria-label="Previous month" onClick={() => goMonth(-1)}>‹</button>
            <h2>{MONTHS[m]} {y}</h2>
            <button className="nav-btn" aria-label="Next month" disabled={atLatest} onClick={() => goMonth(1)}>›</button>
          </div>

          <div className="tabs" role="tablist" aria-label="Milk quantity">
            {(["one", "half"] as Kind[]).map((k) => (
              <button key={k} className="tab" role="tab" id={`tab-${k}`} aria-selected={kind === k} aria-controls="panel"
                onClick={() => { setKind(k); setConfirmClear(false); }}>
                <strong>{k === "one" ? "1 litre" : "½ litre"}</strong><span>{rupees(rateNow(k))} per day</span>
              </button>
            ))}
          </div>

          <section className="panel" id="panel" role="tabpanel" aria-labelledby={`tab-${kind}`}>
            <p className="hint">Tap a day once for <b>received</b>, again for <b>not received</b>, and a third time to clear it.</p>
            <div className="weekdays" aria-hidden="true">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((w) => <span key={w}>{w}</span>)}
            </div>
            <div className="grid">
              {Array.from({ length: blanks }, (_, i) => <div key={"b" + i} className="blank" />)}
              {Array.from({ length: n }, (_, i) => {
                const d = i + 1, st = km[d];
                const isToday = y === today.getFullYear() && m === today.getMonth() && d === today.getDate();
                return (
                  <button key={d} className={"day" + (st === "y" ? " yes" : st === "n" ? " no" : "") + (isToday ? " today" : "")}
                    disabled={isFuture(d)} onClick={() => tapDay(d)}
                    aria-label={`${MONTHS[m]} ${d}, ${st === "y" ? "received" : st === "n" ? "not received" : "not marked"}`}>
                    <span className="num">{d}</span><span className="mark">{st === "y" ? "✓" : st === "n" ? "✕" : ""}</span>
                  </button>
                );
              })}
            </div>
            <div className="legend">
              <span><i className="sw yes" />Received</span>
              <span><i className="sw no" />Not received</span>
              <span><i className="sw" />Not marked</span>
            </div>
            <dl className="counts">
              <div className="c-yes"><dt>Received</dt><dd>{yes}</dd></div>
              <div className="c-no"><dt>Not received</dt><dd>{no}</dd></div>
              <div><dt>Not marked</dt><dd>{blank}</dd></div>
            </dl>
            <div className="actions">
              <button className="btn" disabled={blank === 0} onClick={fillMonth}>Mark unmarked days as received</button>
              <button className="btn" onClick={clearMonth}>{confirmClear ? "Tap again to clear both tabs" : "Clear this month"}</button>
            </div>
          </section>

          <section className="pay" aria-labelledby="payTitle">
            <div className="pay-head">
              <h3 id="payTitle">Pay for {MONTHS[m]}</h3>
              <span className={"pill" + (b.total === 0 ? "" : b.due === 0 ? " paid" : " due")}>
                {b.total === 0 ? "Nothing to pay" : b.due === 0 ? "Paid in full" : `${rupees(b.due)} due`}
              </span>
            </div>
            <p className="muted">
              {b.total === 0 ? "Mark the days milk came, and the amount to pay shows here."
                : b.paid === 0 ? `Pay ${seller} ${rupees(b.due)} for ${MONTHS[m]}.`
                : b.due === 0 ? `You paid ${rupees(b.paid)} for ${MONTHS[m]}.`
                : `You paid ${rupees(b.paid)} so far. ${rupees(b.due)} is left.`}
            </p>
            {!paidChoice ? (
              <div className="actions">
                {b.due > 0 && <button className="btn primary" onClick={payUpi}>{h.upi_id ? `Pay ${rupees(b.due)} with UPI` : "Add UPI ID to pay"}</button>}
                {b.due > 0 && <button className="btn" onClick={() => setPaidChoice(true)}>Mark as paid</button>}
                {b.total > 0 && <button className="btn" onClick={shareBill}>Share bill</button>}
              </div>
            ) : (
              <div className="actions">
                <span className="muted">How did you pay <b>{rupees(b.due)}</b>?</span>
                <button className="btn" onClick={() => recordPaid("upi")}>By UPI</button>
                <button className="btn" onClick={() => recordPaid("cash")}>In cash</button>
                <button className="btn ghost" onClick={() => setPaidChoice(false)}>Cancel</button>
              </div>
            )}
            <ul className="history">
              {payments.map((p) => (
                <li key={p.id}>
                  <span>{rupees(p.amount)} · {p.method === "cash" ? "Cash" : p.method === "upi" ? "UPI" : "Other"} · {new Date(p.paid_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                  <button className="btn ghost" onClick={() => removePay(p.id)}>{confirmRemove === p.id ? "Tap to remove" : "Remove"}</button>
                </li>
              ))}
            </ul>
          </section>
        </main>

        <footer className="bill" aria-label="Monthly bill">
          <div className="bill-inner">
            <div className="bill-row"><span className="lbl"><b>1 litre</b> · {plural(b.one.days, "day")}</span><span>{rupees(b.one.amount)}</span></div>
            <div className="bill-row"><span className="lbl"><b>½ litre</b> · {plural(b.half.days, "day")}</span><span>{rupees(b.half.amount)}</span></div>
            <div className="bill-row bill-total"><span className="lbl">Total for {MONTHS[m]} · {b.litres.toLocaleString("en-IN")} L</span><span className="amt">{rupees(b.total)}</span></div>
          </div>
        </footer>
      </div>

      {settingsOpen && (
        <Settings household={h} month={MONTHS[m] ?? ""} email={email} store={s}
          onClose={() => setSettingsOpen(false)}
          onSaved={async (next, reprice) => {
            const prev = h;
            setHousehold(next);
            if (reprice) {
              if (next.rate_one !== prev.rate_one) await s.repriceMonth(y, m, "one", next.rate_one);
              if (next.rate_half !== prev.rate_half) await s.repriceMonth(y, m, "half", next.rate_half);
              await loadMonth(s, y, m);
            }
            setSettingsOpen(false);
            toast("Settings saved.");
          }}
          onSignOut={signOut}
          onDeleted={async () => { await signOut(); toast("Your account and all its records were deleted."); }}
          toast={toast}
        />
      )}

      {toastText && <div className="toast" role="status" aria-live="polite">{toastText}</div>}
    </>
  );
}

function Settings(props: {
  household: Household; month: string; email: string; store: Store;
  onClose: () => void; onSaved: (h: Household, reprice: boolean) => Promise<void>;
  onSignOut: () => void; onDeleted: () => Promise<void>; toast: (t: string) => void;
}) {
  const { household: h } = props;
  const [sellerName, setSellerName] = useState(h.seller_name ?? "");
  const [upi, setUpi] = useState(h.upi_id ?? "");
  const [rateOne, setRateOne] = useState(String(h.rate_one));
  const [rateHalf, setRateHalf] = useState(String(h.rate_half));
  const [reprice, setReprice] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    const r1 = Number(rateOne), r2 = Number(rateHalf), u = upi.trim();
    const bad = (r: number) => !Number.isInteger(r) || r < 1 || r > 10000;
    if (u && !UPI_PATTERN.test(u)) { setError("That UPI ID doesn't look right. It should look like name@bank, for example raju@okaxis."); return; }
    if (bad(r1) || bad(r2)) { setError("Enter each rate as a whole number of rupees between 1 and 10,000."); return; }
    setError(""); setSaving(true);
    try {
      const next = await props.store.saveHousehold({ seller_name: sellerName.trim().slice(0, 60) || null, upi_id: u || null, rate_one: r1, rate_half: r2 });
      await props.onSaved(next, reprice);
    } catch (ex) { setError("Couldn't save. " + friendly(ex)); } finally { setSaving(false); }
  }

  async function del() {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    try { await props.store.deleteAccount(); await props.onDeleted(); }
    catch (ex) { props.toast("Couldn't delete the account. " + friendly(ex)); }
  }

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="settingsTitle">
      <div className="sheet-inner">
        <header className="top">
          <h1 id="settingsTitle">Settings</h1>
          <button className="icon-btn" aria-label="Close settings" onClick={props.onClose}>✕</button>
        </header>
        <form id="settingsForm" noValidate onSubmit={save}>
          <h2>Milk seller</h2>
          <label className="field">Name
            <input maxLength={60} autoComplete="off" placeholder="e.g. Raju" value={sellerName} onChange={(e) => setSellerName(e.target.value)} />
          </label>
          <label className="field">UPI ID
            <input inputMode="email" autoCapitalize="none" autoComplete="off" spellCheck={false} placeholder="e.g. raju@okaxis" value={upi} onChange={(e) => setUpi(e.target.value)} />
            <span className="help">Ask the milkman for it, or scan their QR code in your UPI app and copy the ID shown.</span>
          </label>
          <h2>Rates per day</h2>
          <div className="rate-row">
            <label className="field">1 litre (₹)
              <input type="number" inputMode="numeric" min={1} max={10000} step={1} value={rateOne} onChange={(e) => setRateOne(e.target.value)} />
            </label>
            <label className="field">½ litre (₹)
              <input type="number" inputMode="numeric" min={1} max={10000} step={1} value={rateHalf} onChange={(e) => setRateHalf(e.target.value)} />
            </label>
          </div>
          <label className="check">
            <input type="checkbox" checked={reprice} onChange={(e) => setReprice(e.target.checked)} />
            <span>Also update the days already marked in <b>{props.month}</b></span>
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn primary wide" type="submit" disabled={saving}>Save</button>
        </form>
        <h2>Account</h2>
        <p className="muted">Signed in as <b>{props.email}</b></p>
        <div className="actions">
          <button className="btn" onClick={props.onSignOut}>Sign out</button>
          <button className={"btn danger" + (confirmDelete ? " armed" : "")} onClick={del}>{confirmDelete ? "Yes, delete everything" : "Delete my account"}</button>
        </div>
        {confirmDelete && <p className="muted small">This permanently deletes your account and every day and payment you have recorded. Tap again to confirm.</p>}
        <h2>About</h2>
        <p className="muted small">
          <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer">Privacy policy</a> · <a href={TERMS_URL} target="_blank" rel="noopener noreferrer">Terms of service</a><br />
          Help: <span className="select">{SUPPORT_EMAIL}</span>
        </p>
      </div>
    </div>
  );
}
