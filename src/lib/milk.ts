import { supabase } from "@/integrations/supabase/client";

export type Kind = "one" | "half";
export type Status = "y" | "n";
export type Household = { seller_name: string | null; upi_id: string | null; rate_one: number; rate_half: number };
export type Payment = { id: string; amount: number; method: string; paid_at: string };
export type DeliveryRow = { day: string; kind: Kind; status: Status; rate: number | null };
export type Marks = Record<Kind, Record<number, Status>>;
export type Rates = Record<Kind, Record<number, number>>;

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const LITRES: Record<Kind, number> = { one: 1, half: 0.5 };
export const PRIVACY_URL = "https://gkolath.github.io/milk-ledger/privacy.html";
export const TERMS_URL = "https://gkolath.github.io/milk-ledger/terms.html";
export const SUPPORT_EMAIL = "hello@truship.org";
export const UPI_PATTERN = /^[A-Za-z0-9._-]{2,256}@[A-Za-z][A-Za-z0-9.-]{1,63}$/;

const pad = (n: number) => String(n).padStart(2, "0");
export const isoDay = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
export const monthStart = (y: number, m: number) => isoDay(y, m, 1);
export const daysIn = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
export const monthEnd = (y: number, m: number) => isoDay(y, m, daysIn(y, m));
export const rupees = (n: number) => "₹" + n.toLocaleString("en-IN");
export const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export function computeBill(marks: Marks, rates: Rates, household: Household, payments: { amount: number }[]) {
  const rateNow = (k: Kind) => (k === "one" ? household.rate_one : household.rate_half);
  const out = { one: { days: 0, amount: 0 }, half: { days: 0, amount: 0 }, total: 0, litres: 0, paid: 0, due: 0 };
  for (const kind of ["one", "half"] as Kind[]) {
    for (const [d, s] of Object.entries(marks[kind])) {
      if (s !== "y") continue;
      out[kind].days++;
      out[kind].amount += rates[kind][Number(d)] ?? rateNow(kind);
    }
  }
  out.total = out.one.amount + out.half.amount;
  out.litres = out.one.days * LITRES.one + out.half.days * LITRES.half;
  out.paid = payments.reduce((s, p) => s + p.amount, 0);
  out.due = Math.max(0, out.total - out.paid);
  return out;
}

// A date is "not delivered" only when no milk came at all that day.
export function missedDates(marks: Marks) {
  const days = new Set([...Object.keys(marks.one), ...Object.keys(marks.half)].map(Number));
  return [...days]
    .filter((d) => marks.one[d] !== "y" && marks.half[d] !== "y")
    .filter((d) => marks.one[d] === "n" || marks.half[d] === "n")
    .sort((a, b) => a - b);
}

export function upiLink(h: Household, amount: number, y: number, m: number) {
  const params = new URLSearchParams({
    pa: h.upi_id ?? "",
    pn: h.seller_name || "Milk seller",
    am: amount.toFixed(2),
    cu: "INR",
    tn: `Milk ${MONTHS[m]} ${y}`,
  });
  return "upi://pay?" + params.toString().replace(/\+/g, "%20");
}

export interface Store {
  household(): Promise<Household>;
  saveHousehold(patch: Partial<Household>): Promise<Household>;
  deliveries(y: number, m: number): Promise<DeliveryRow[]>;
  setDeliveries(rows: DeliveryRow[]): Promise<void>;
  clearDelivery(day: string, kind: Kind): Promise<void>;
  clearMonth(y: number, m: number): Promise<void>;
  repriceMonth(y: number, m: number, kind: Kind, rate: number): Promise<void>;
  payments(y: number, m: number): Promise<Payment[]>;
  addPayment(y: number, m: number, amount: number, method: string): Promise<Payment>;
  removePayment(id: string): Promise<void>;
  deleteAccount(): Promise<void>;
}

function check<T>({ data, error }: { data: T | null; error: unknown }): T {
  if (error) throw error;
  return data as T;
}

// Row-level security limits every query to the signed-in household.
export function remoteStore(userId: string): Store {
  return {
    async household() {
      const row = check(await supabase.from("households").select("*").maybeSingle());
      if (row) return row;
      return check(await supabase.from("households").insert({ user_id: userId }).select().single());
    },
    async saveHousehold(patch) {
      return check(
        await supabase.from("households").update({ ...patch, updated_at: new Date().toISOString() }).eq("user_id", userId).select().single(),
      );
    },
    async deliveries(y, m) {
      return check(
        await supabase.from("deliveries").select("day, kind, status, rate").gte("day", monthStart(y, m)).lte("day", monthEnd(y, m)),
      ) as DeliveryRow[];
    },
    async setDeliveries(rows) {
      const now = new Date().toISOString();
      check(await supabase.from("deliveries").upsert(rows.map((r) => ({ ...r, user_id: userId, updated_at: now })), { onConflict: "user_id,day,kind" }));
    },
    async clearDelivery(day, kind) {
      check(await supabase.from("deliveries").delete().eq("day", day).eq("kind", kind));
    },
    async clearMonth(y, m) {
      check(await supabase.from("deliveries").delete().gte("day", monthStart(y, m)).lte("day", monthEnd(y, m)));
    },
    async repriceMonth(y, m, kind, rate) {
      check(await supabase.from("deliveries").update({ rate }).eq("kind", kind).eq("status", "y").gte("day", monthStart(y, m)).lte("day", monthEnd(y, m)));
    },
    async payments(y, m) {
      return check(await supabase.from("payments").select("id, amount, method, paid_at").eq("month", monthStart(y, m)).order("paid_at"));
    },
    async addPayment(y, m, amount, method) {
      return check(await supabase.from("payments").insert({ user_id: userId, month: monthStart(y, m), amount, method }).select("id, amount, method, paid_at").single());
    },
    async removePayment(id) {
      check(await supabase.from("payments").delete().eq("id", id));
    },
    async deleteAccount() {
      check(await supabase.rpc("delete_my_account"));
    },
  };
}

// In-memory stand-in for trying the screens with sample data (?demo).
export function demoStore(): Store {
  let household: Household = { seller_name: "Raju", upi_id: "raju.milk@okaxis", rate_one: 70, rate_half: 35 };
  const rows = new Map<string, DeliveryRow>();
  const payments: (Payment & { month: string })[] = [];
  const key = (day: string, kind: string) => `${day}|${kind}`;
  const inMonth = (day: string, y: number, m: number) => day >= monthStart(y, m) && day <= monthEnd(y, m);
  const today = new Date();
  for (let d = 1; d < today.getDate(); d++) {
    const day = isoDay(today.getFullYear(), today.getMonth(), d);
    rows.set(key(day, "one"), { day, kind: "one", status: d % 9 === 0 ? "n" : "y", rate: 70 });
  }
  return {
    async household() { return { ...household }; },
    async saveHousehold(patch) { household = { ...household, ...patch }; return { ...household }; },
    async deliveries(y, m) { return [...rows.values()].filter((r) => inMonth(r.day, y, m)).map((r) => ({ ...r })); },
    async setDeliveries(list) { list.forEach((r) => rows.set(key(r.day, r.kind), { ...r })); },
    async clearDelivery(day, kind) { rows.delete(key(day, kind)); },
    async clearMonth(y, m) { [...rows.keys()].forEach((k) => inMonth(k.split("|")[0] ?? "", y, m) && rows.delete(k)); },
    async repriceMonth(y, m, kind, rate) { rows.forEach((r) => { if (r.kind === kind && r.status === "y" && inMonth(r.day, y, m)) r.rate = rate; }); },
    async payments(y, m) { return payments.filter((p) => p.month === monthStart(y, m)).map((p) => ({ ...p })); },
    async addPayment(y, m, amount, method) {
      const p = { id: crypto.randomUUID(), month: monthStart(y, m), amount, method, paid_at: new Date().toISOString() };
      payments.push(p);
      return { ...p };
    },
    async removePayment(id) { const i = payments.findIndex((p) => p.id === id); if (i >= 0) payments.splice(i, 1); },
    async deleteAccount() {},
  };
}
