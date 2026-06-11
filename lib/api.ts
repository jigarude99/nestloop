"use client";

import { getSupabase } from "./supabase";

// ---------------------------------------------------------------------------
// Tipos de la UI (los mismos que usa NestLoopApp)
// ---------------------------------------------------------------------------
export type PaymentStatus = "pending" | "sent" | "confirmed" | "rejected";
export type PaymentMethod = "transfer" | "cash" | "other";
export type RotationIcon = "water" | "trash" | "plants";

export type ExpenseShare = {
  personId: string;
  amount: number;
  status: PaymentStatus;
  paymentMethod?: PaymentMethod;
  proofName?: string;
  proofPath?: string;
  sentAt?: string;
  confirmedAt?: string;
};

export type Expense = {
  id: string;
  title: string;
  merchant: string;
  category: string;
  amount: number;
  paidBy: string;
  createdBy: string;
  purchasedAt: string;
  createdAt: string;
  note: string;
  receiptName?: string;
  receiptPath?: string;
  shares: ExpenseShare[];
};

export type RotationEvent = { personId: string; completedAt: string; note: string };

export type Rotation = {
  id: string;
  title: string;
  cadence: string;
  icon: RotationIcon;
  queue: string[];
  currentIndex: number;
  history: RotationEvent[];
};

export type ScheduleSlot = {
  id: string;
  day: number;
  personId: string;
  createdBy: string;
  start: string;
  end: string;
  label: string;
};

export type NewExpenseInput = {
  title: string;
  merchant: string;
  category: string;
  amount: number;
  paidBy: string;
  purchasedAt: string;
  note: string;
  receiptFile: File | null;
  participants: { personId: string; amount: number }[];
};

export type NewRotationInput = {
  title: string;
  cadence: string;
  icon: RotationIcon;
  queue: string[];
};

export type NewSlotInput = {
  personId: string;
  day: number;
  start: string;
  end: string;
  label: string;
};

const RECEIPTS = "receipts";
const PROOFS = "payment-proofs";

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
function toCents(value: number) {
  return Math.round(value * 100);
}
function fromCents(value: number) {
  return value / 100;
}
function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-60);
}
function basename(path?: string | null) {
  if (!path) return undefined;
  const parts = path.split("/");
  return parts[parts.length - 1];
}
/** Formatea "HH:MM" o "HH:MM:SS" a "6:00 p. m." para mostrar. */
export function displayTime(value?: string | null) {
  if (!value) return "";
  const [h, m] = value.split(":");
  const hour = Number(h);
  const ampm = hour >= 12 ? "p. m." : "a. m.";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${m} ${ampm}`;
}

// ---------------------------------------------------------------------------
// GASTOS
// ---------------------------------------------------------------------------
export async function fetchExpenses(householdId: string): Promise<Expense[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("expenses")
    .select(
      "id,title,merchant,category,amount_cents,paid_by,created_by,purchased_at,note,receipt_path,created_at," +
        "shares:expense_shares(profile_id,amount_cents,status,payment_method,proof_path,sent_at,confirmed_at)"
    )
    .eq("household_id", householdId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    id: row.id,
    title: row.title,
    merchant: row.merchant ?? "",
    category: row.category,
    amount: fromCents(row.amount_cents),
    paidBy: row.paid_by,
    createdBy: row.created_by,
    purchasedAt: row.purchased_at,
    createdAt: row.created_at,
    note: row.note ?? "",
    receiptName: basename(row.receipt_path),
    receiptPath: row.receipt_path ?? undefined,
    shares: (row.shares ?? []).map((s: any) => ({
      personId: s.profile_id,
      amount: fromCents(s.amount_cents),
      status: s.status as PaymentStatus,
      paymentMethod: s.payment_method ?? undefined,
      proofName: basename(s.proof_path),
      proofPath: s.proof_path ?? undefined,
      sentAt: s.sent_at ?? undefined,
      confirmedAt: s.confirmed_at ?? undefined
    }))
  }));
}

export async function createExpense(
  householdId: string,
  currentUserId: string,
  input: NewExpenseInput
): Promise<void> {
  const supabase = getSupabase();
  const expenseId = newId();

  let receiptPath: string | null = null;
  if (input.receiptFile) {
    const path = `${householdId}/${expenseId}/${Date.now()}-${safeName(input.receiptFile.name)}`;
    const { error: upErr } = await supabase.storage
      .from(RECEIPTS)
      .upload(path, input.receiptFile, { upsert: false });
    if (upErr) throw upErr;
    receiptPath = path;
  }

  const { error: expErr } = await supabase.from("expenses").insert({
    id: expenseId,
    household_id: householdId,
    title: input.title,
    merchant: input.merchant || null,
    category: input.category,
    amount_cents: toCents(input.amount),
    paid_by: input.paidBy,
    purchased_at: input.purchasedAt,
    note: input.note || null,
    receipt_path: receiptPath,
    created_by: currentUserId
  });
  if (expErr) throw expErr;

  const now = new Date().toISOString();
  const shares = input.participants.map((p) => ({
    expense_id: expenseId,
    profile_id: p.personId,
    amount_cents: toCents(p.amount),
    status: p.personId === input.paidBy ? "confirmed" : "pending",
    confirmed_at: p.personId === input.paidBy ? now : null
  }));
  const { error: shErr } = await supabase.from("expense_shares").insert(shares);
  if (shErr) throw shErr;
}

export async function markSharePaid(
  householdId: string,
  expenseId: string,
  personId: string,
  method: PaymentMethod,
  proofFile: File | null
): Promise<void> {
  const supabase = getSupabase();
  const now = new Date().toISOString();

  let proofPath: string | null = null;
  if (method !== "cash" && proofFile) {
    const path = `${householdId}/${expenseId}/${personId}-${Date.now()}-${safeName(proofFile.name)}`;
    const { error: upErr } = await supabase.storage
      .from(PROOFS)
      .upload(path, proofFile, { upsert: false });
    if (upErr) throw upErr;
    proofPath = path;
  }

  const { error } = await supabase
    .from("expense_shares")
    .update({
      status: method === "cash" ? "sent" : "confirmed",
      payment_method: method,
      proof_path: proofPath,
      sent_at: now,
      confirmed_at: method === "cash" ? null : now
    })
    .eq("expense_id", expenseId)
    .eq("profile_id", personId);
  if (error) throw error;
}

export async function setShareStatus(
  expenseId: string,
  personId: string,
  status: "confirmed" | "rejected"
): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("expense_shares")
    .update({
      status,
      confirmed_at: status === "confirmed" ? new Date().toISOString() : null
    })
    .eq("expense_id", expenseId)
    .eq("profile_id", personId);
  if (error) throw error;
}

export async function updateExpense(
  householdId: string,
  expenseId: string,
  input: NewExpenseInput
): Promise<void> {
  const supabase = getSupabase();

  const patch: Record<string, unknown> = {
    title: input.title,
    merchant: input.merchant || null,
    category: input.category,
    amount_cents: toCents(input.amount),
    paid_by: input.paidBy,
    purchased_at: input.purchasedAt,
    note: input.note || null
  };

  if (input.receiptFile) {
    const path = `${householdId}/${expenseId}/${Date.now()}-${safeName(input.receiptFile.name)}`;
    const { error: upErr } = await supabase.storage
      .from(RECEIPTS)
      .upload(path, input.receiptFile, { upsert: false });
    if (upErr) throw upErr;
    patch.receipt_path = path;
  }

  const { error: expErr } = await supabase.from("expenses").update(patch).eq("id", expenseId);
  if (expErr) throw expErr;

  // Reconciliar divisiones: borrar y volver a crear (los pagos se reinician)
  const { error: delErr } = await supabase.from("expense_shares").delete().eq("expense_id", expenseId);
  if (delErr) throw delErr;

  const now = new Date().toISOString();
  const shares = input.participants.map((p) => ({
    expense_id: expenseId,
    profile_id: p.personId,
    amount_cents: toCents(p.amount),
    status: p.personId === input.paidBy ? "confirmed" : "pending",
    confirmed_at: p.personId === input.paidBy ? now : null
  }));
  const { error: shErr } = await supabase.from("expense_shares").insert(shares);
  if (shErr) throw shErr;
}

export async function deleteExpense(expense: Expense): Promise<void> {
  const supabase = getSupabase();

  // Borrar archivos asociados (mejor esfuerzo)
  if (expense.receiptPath) {
    await supabase.storage.from(RECEIPTS).remove([expense.receiptPath]).catch(() => {});
  }
  const proofPaths = expense.shares.map((s) => s.proofPath).filter(Boolean) as string[];
  if (proofPaths.length) {
    await supabase.storage.from(PROOFS).remove(proofPaths).catch(() => {});
  }

  // shares caen por ON DELETE CASCADE
  const { error } = await supabase.from("expenses").delete().eq("id", expense.id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// TURNOS ROTATIVOS
// ---------------------------------------------------------------------------
export async function fetchRotations(householdId: string): Promise<Rotation[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("task_rotations")
    .select(
      "id,title,cadence,icon,current_index,created_at," +
        "members:task_rotation_members(profile_id,position)," +
        "history:task_events(profile_id,completed_at,note)"
    )
    .eq("household_id", householdId)
    .order("created_at", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    id: row.id,
    title: row.title,
    cadence: row.cadence,
    icon: (row.icon ?? "water") as RotationIcon,
    currentIndex: row.current_index ?? 0,
    queue: (row.members ?? [])
      .slice()
      .sort((a: any, b: any) => a.position - b.position)
      .map((m: any) => m.profile_id),
    history: (row.history ?? [])
      .slice()
      .sort((a: any, b: any) => (a.completed_at < b.completed_at ? 1 : -1))
      .map((h: any) => ({
        personId: h.profile_id,
        completedAt: h.completed_at,
        note: h.note ?? ""
      }))
  }));
}

export async function createRotation(
  householdId: string,
  input: NewRotationInput
): Promise<void> {
  const supabase = getSupabase();
  const rotationId = newId();

  const { error: rotErr } = await supabase.from("task_rotations").insert({
    id: rotationId,
    household_id: householdId,
    title: input.title,
    cadence: input.cadence,
    icon: input.icon,
    current_index: 0
  });
  if (rotErr) throw rotErr;

  const members = input.queue.map((personId, index) => ({
    rotation_id: rotationId,
    profile_id: personId,
    position: index
  }));
  const { error: memErr } = await supabase.from("task_rotation_members").insert(members);
  if (memErr) throw memErr;
}

/** Marca el turno actual como hecho (el servidor valida que sea tu turno). */
export async function completeRotation(rotationId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc("complete_rotation", { p_rotation_id: rotationId });
  if (error) throw new Error(rotationErrorMessage(error.message));
}

/** Deshace el último turno marcado (solo quien lo marcó). */
export async function undoRotation(rotationId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc("undo_rotation", { p_rotation_id: rotationId });
  if (error) throw new Error(rotationErrorMessage(error.message));
}

function rotationErrorMessage(message: string): string {
  if (message.includes("Solo a quien le toca")) return "Solo a quien le toca puede marcar el turno.";
  if (message.includes("Solo quien marcó")) return "Solo quien marcó el turno puede deshacerlo.";
  if (message.includes("No hay nada")) return "No hay nada que deshacer.";
  return "No se pudo completar la acción. Intenta de nuevo.";
}

export async function updateRotation(rotationId: string, input: NewRotationInput): Promise<void> {
  const supabase = getSupabase();
  const { error: upErr } = await supabase
    .from("task_rotations")
    .update({ title: input.title, cadence: input.cadence, icon: input.icon, current_index: 0 })
    .eq("id", rotationId);
  if (upErr) throw upErr;

  // Reemplazar la lista de miembros con posiciones nuevas (0..n-1)
  const { error: delErr } = await supabase
    .from("task_rotation_members")
    .delete()
    .eq("rotation_id", rotationId);
  if (delErr) throw delErr;

  const members = input.queue.map((personId, index) => ({
    rotation_id: rotationId,
    profile_id: personId,
    position: index
  }));
  const { error: insErr } = await supabase.from("task_rotation_members").insert(members);
  if (insErr) throw insErr;
}

export async function deleteRotation(rotationId: string): Promise<void> {
  const supabase = getSupabase();
  // members y events caen por ON DELETE CASCADE
  const { error } = await supabase.from("task_rotations").delete().eq("id", rotationId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// HORARIO DE LAVADORA
// ---------------------------------------------------------------------------
export async function fetchSlots(householdId: string): Promise<ScheduleSlot[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("schedule_slots")
    .select("id,profile_id,created_by,day_of_week,starts_at,ends_at,label")
    .eq("household_id", householdId)
    .order("starts_at", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    id: row.id,
    day: row.day_of_week,
    personId: row.profile_id,
    createdBy: row.created_by,
    start: (row.starts_at ?? "").slice(0, 5),
    end: (row.ends_at ?? "").slice(0, 5),
    label: row.label ?? "Lavadora"
  }));
}

export async function createSlot(householdId: string, currentUserId: string, input: NewSlotInput): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from("schedule_slots").insert({
    id: newId(),
    household_id: householdId,
    profile_id: input.personId,
    created_by: currentUserId,
    day_of_week: input.day,
    starts_at: input.start,
    ends_at: input.end,
    label: input.label?.trim() || "Lavadora"
  });
  if (error) throw error;
}

export async function updateSlot(slotId: string, input: NewSlotInput): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("schedule_slots")
    .update({
      profile_id: input.personId,
      day_of_week: input.day,
      starts_at: input.start,
      ends_at: input.end,
      label: input.label?.trim() || "Lavadora"
    })
    .eq("id", slotId)
    .select("id")
    .single();
  if (error) throw error;
}

export async function deleteSlot(slotId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from("schedule_slots").delete().eq("id", slotId).select("id").single();
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// ARCHIVOS (URLs firmadas para mostrar fotos de buckets privados)
// ---------------------------------------------------------------------------
export async function signedUrl(
  bucket: "receipts" | "payment-proofs",
  path: string
): Promise<string | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
  if (error) return null;
  return data?.signedUrl ?? null;
}
