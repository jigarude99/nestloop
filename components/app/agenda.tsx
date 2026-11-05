"use client";

import { CalendarDays, Check, ChevronRight, Plus, X } from "lucide-react";
import { CSSProperties, FormEvent, useState } from "react";
import { Person } from "../../lib/household";
import {
  billDisplayPeriod,
  displayTime,
  periodDueDate,
  type NewSlotInput,
  type RecurringBill,
  type Rotation,
  type ScheduleSlot
} from "../../lib/api";
import { Avatar, DAYS, DAYS_FULL, ItemActionsSheet, ModalBackdrop, money, rotationIcon, useApp } from "./core";

const USES = ["Lavadora", "Secadora", "Cocina", "Carro"];
const TIME_PRESETS = [
  { label: "Mañana", start: "08:00", end: "10:00" },
  { label: "Tarde", start: "14:00", end: "16:00" },
  { label: "Noche", start: "19:00", end: "21:00" }
];

/** Fechas de esta semana, de lunes a domingo. */
function currentWeek() {
  const today = new Date();
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + index));
}

type DuePayment = { bill: RecurringBill; amount: number | null; paid: boolean };

/** Pagos mensuales cuyo periodo activo vence en esa fecha. */
function paymentsOn(date: Date, bills: RecurringBill[], meId: string): DuePayment[] {
  return bills.flatMap((bill) => {
    const period = billDisplayPeriod(bill);
    const due = periodDueDate(period, bill.dueDay);
    const sameDay =
      due.getUTCFullYear() === date.getFullYear() &&
      due.getUTCMonth() === date.getMonth() &&
      due.getUTCDate() === date.getDate();
    if (!sameDay) return [];
    const share = bill.shares.find((item) => item.personId === meId);
    return [
      {
        bill,
        amount: share?.amount ?? null,
        paid: bill.payments.some((payment) => payment.period === period && payment.personId === meId)
      }
    ];
  });
}

export function todayIndex() {
  return (new Date().getDay() + 6) % 7;
}

export function SlotRow({ slot, onOpen }: { slot: ScheduleSlot; onOpen?: () => void }) {
  const { getPerson, currentUserId } = useApp();
  const person = getPerson(slot.personId);
  const content = (
    <>
      <span className="slot-time">
        <strong>{displayTime(slot.start)}</strong>
        <small>{displayTime(slot.end)}</small>
      </span>
      <span className="slot-bar" aria-hidden="true" />
      <span className="slot-copy">
        <strong>{slot.label}</strong>
        <small>{person.id === currentUserId ? "Tú" : person.shortName}</small>
      </span>
      <Avatar person={person} size="sm" />
    </>
  );
  const style = { "--slot-color": person.color } as CSSProperties;
  return onOpen ? (
    <button className="slot-row" onClick={onOpen} style={style} type="button">
      {content}
    </button>
  ) : (
    <div className="slot-row" style={style}>
      {content}
    </div>
  );
}

function ScheduleForm({
  currentUser,
  defaultDay,
  initial,
  slots,
  onClose,
  onSubmit
}: {
  currentUser: Person;
  defaultDay: number;
  initial?: ScheduleSlot | null;
  slots: ScheduleSlot[];
  onClose: () => void;
  onSubmit: (input: NewSlotInput) => Promise<void>;
}) {
  const { people, getPerson } = useApp();
  const isEdit = !!initial;
  const [personId, setPersonId] = useState(initial?.personId ?? currentUser.id);
  const [days, setDays] = useState<number[]>([initial?.day ?? defaultDay]);
  const [start, setStart] = useState(initial?.start ?? "19:00");
  const [end, setEnd] = useState(initial?.end ?? "21:00");
  const [label, setLabel] = useState(initial?.label ?? "Lavadora");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const validTime = start < end;
  const name = label.trim();
  const clashes = slots.filter(
    (slot) =>
      slot.id !== initial?.id &&
      days.includes(slot.day) &&
      slot.label.trim().toLowerCase() === name.toLowerCase() &&
      slot.start < end &&
      start < slot.end
  );

  function toggleDay(day: number) {
    setDays((current) => {
      if (isEdit) return [day];
      if (!current.includes(day)) return [...current, day].sort();
      return current.length > 1 ? current.filter((item) => item !== day) : current;
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !validTime || !name) return;
    setSaving(true);
    setError(null);
    try {
      for (const day of days) await onSubmit({ personId, day, start, end, label: name });
      onClose();
    } catch {
      setError("No se pudo guardar. Intenta de nuevo.");
      setSaving(false);
    }
  }

  return (
    <ModalBackdrop onBack={onClose}>
      <form className="modal-sheet schedule-form" onSubmit={submit}>
        <div className="modal-header">
          <div>
            <h2>{isEdit ? "Editar reserva" : "Reservar"}</h2>
          </div>
          <button className="icon-button" onClick={onClose} type="button" aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>

        <label>
          <span>¿Qué vas a usar?</span>
          <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Ej: Lavadora" />
        </label>
        <div className="chip-row">
          {USES.map((use) => (
            <button
              className={`chip ${use === name ? "active" : ""}`}
              key={use}
              onClick={() => setLabel(use)}
              type="button"
            >
              {use}
            </button>
          ))}
        </div>

        <div className="field-block">
          <span className="field-label">{isEdit ? "Día" : "Todas las semanas, los días"}</span>
          <div className="day-picker">
            {DAYS.map((day, index) => (
              <button
                aria-label={DAYS_FULL[index]}
                aria-pressed={days.includes(index)}
                className={days.includes(index) ? "active" : ""}
                key={day}
                onClick={() => toggleDay(index)}
                type="button"
              >
                {day}
              </button>
            ))}
          </div>
        </div>

        <div className="field-block">
          <span className="field-label">Horario</span>
          <div className="chip-row">
            {TIME_PRESETS.map((preset) => (
              <button
                className={`chip ${preset.start === start && preset.end === end ? "active" : ""}`}
                key={preset.label}
                onClick={() => {
                  setStart(preset.start);
                  setEnd(preset.end);
                }}
                type="button"
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className="form-grid two tight">
            <label>
              <span>Desde</span>
              <input type="time" value={start} onChange={(event) => setStart(event.target.value)} />
            </label>
            <label>
              <span>Hasta</span>
              <input type="time" value={end} onChange={(event) => setEnd(event.target.value)} />
            </label>
          </div>
        </div>

        <label>
          <span>¿Para quién?</span>
          <select value={personId} onChange={(event) => setPersonId(event.target.value)}>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </label>

        {!validTime ? <div className="difference-note">La hora final debe ser después de la inicial.</div> : null}
        {clashes.length ? (
          <div className="difference-note warn">
            {clashes[0].personId === currentUser.id ? "Ya tienes" : `${getPerson(clashes[0].personId).shortName} ya tiene`}{" "}
            {clashes[0].label.toLowerCase()} el {DAYS_FULL[clashes[0].day].toLowerCase()} de{" "}
            {displayTime(clashes[0].start)} a {displayTime(clashes[0].end)}
          </div>
        ) : null}
        {error ? <div className="auth-alert error">{error}</div> : null}

        <button className="primary-action full" type="submit" disabled={saving || !validTime || !name}>
          <Check size={19} />
          {saving ? "Guardando…" : isEdit ? "Guardar cambios" : days.length > 1 ? `Reservar ${days.length} días` : "Reservar"}
        </button>
      </form>
    </ModalBackdrop>
  );
}

export function AgendaView({
  currentUser,
  slots,
  rotations,
  bills,
  onCreate,
  onUpdate,
  onDelete,
  onOpenMonthly,
  onOpenTurns
}: {
  currentUser: Person;
  slots: ScheduleSlot[];
  rotations: Rotation[];
  bills: RecurringBill[];
  onCreate: (input: NewSlotInput) => Promise<void>;
  onUpdate: (id: string, input: NewSlotInput) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onOpenMonthly: () => void;
  onOpenTurns: () => void;
}) {
  const { getPerson } = useApp();
  const today = todayIndex();
  const week = currentWeek();
  const [selectedDay, setSelectedDay] = useState(today);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ScheduleSlot | null>(null);
  const [actionsSlot, setActionsSlot] = useState<ScheduleSlot | null>(null);
  const canManage = (slot: ScheduleSlot) => currentUser.role === "admin" || slot.createdBy === currentUser.id;

  const daySlots = slots
    .filter((slot) => slot.day === selectedDay)
    .sort((a, b) => a.start.localeCompare(b.start));
  const dayPayments = paymentsOn(week[selectedDay], bills, currentUser.id);
  const turns = selectedDay === today ? rotations : [];
  const dateLabel = new Intl.DateTimeFormat("es", { day: "numeric", month: "long" }).format(week[selectedDay]);
  const isEmpty = !daySlots.length && !dayPayments.length && !turns.length;

  return (
    <section className="view-stack">
      <header className="view-header">
        <h1>Agenda</h1>
        <button className="primary-action compact" onClick={() => setShowForm(true)} type="button">
          <Plus size={18} />
          Reservar
        </button>
      </header>

      <div className="week-strip" role="tablist" aria-label="Días de esta semana">
        {week.map((date, index) => {
          const hasSlots = slots.some((slot) => slot.day === index);
          const hasPayments = paymentsOn(date, bills, currentUser.id).length > 0;
          const selected = selectedDay === index;
          return (
            <button
              aria-label={`${DAYS_FULL[index]} ${date.getDate()}`}
              aria-selected={selected}
              className={`week-day ${selected ? "selected" : ""} ${today === index ? "today" : ""}`}
              key={DAYS[index]}
              onClick={() => setSelectedDay(index)}
              role="tab"
              type="button"
            >
              <small>{DAYS[index]}</small>
              <strong>{date.getDate()}</strong>
              <span className="week-dots" aria-hidden="true">
                {hasPayments ? <i className="pay" /> : null}
                {hasSlots ? <i /> : null}
              </span>
            </button>
          );
        })}
      </div>

      <div className="group-head plain">
        <strong>{selectedDay === today ? "Hoy" : DAYS_FULL[selectedDay]}</strong>
        <span className="group-total">{dateLabel}</span>
      </div>

      {dayPayments.length ? (
        <div className="list-card">
          {dayPayments.map(({ bill, amount, paid }) => (
            <button className="action-row" key={bill.id} onClick={onOpenMonthly} type="button">
              <span className={`row-icon ${paid ? "is-paid" : "is-pay"}`}>
                <CalendarDays size={18} />
              </span>
              <span className="row-copy">
                <strong>Vence {bill.title}</strong>
                <small>{paid ? "Ya pagaste tu parte" : amount !== null ? `Tu parte: ${money(amount)}` : "No participas"}</small>
              </span>
              <ChevronRight size={18} />
            </button>
          ))}
        </div>
      ) : null}

      {daySlots.length ? (
        <div className="list-card">
          {daySlots.map((slot) => (
            <SlotRow key={slot.id} onOpen={canManage(slot) ? () => setActionsSlot(slot) : undefined} slot={slot} />
          ))}
        </div>
      ) : null}

      {turns.length ? (
        <div className="list-card">
          {turns.map((rotation) => {
            const Icon = rotationIcon(rotation.icon);
            const person = getPerson(rotation.queue[rotation.currentIndex]);
            return (
              <button className="action-row" key={rotation.id} onClick={onOpenTurns} type="button">
                <span className="row-icon is-turn">
                  <Icon size={18} />
                </span>
                <span className="row-copy">
                  <strong>{rotation.title}</strong>
                  <small>{person.id === currentUser.id ? "Te toca a ti" : `Le toca a ${person.shortName}`}</small>
                </span>
                <ChevronRight size={18} />
              </button>
            );
          })}
        </div>
      ) : null}

      {isEmpty ? (
        <button className="open-day" onClick={() => setShowForm(true)} type="button">
          <Plus size={20} />
          <span>
            <strong>Día libre</strong>
            <small>Toca para reservar la lavadora, la cocina o lo que necesites.</small>
          </span>
        </button>
      ) : null}

      <p className="section-note">Las reservas se repiten cada semana. Los pagos y turnos aparecen solos.</p>

      {showForm ? (
        <ScheduleForm
          currentUser={currentUser}
          defaultDay={selectedDay}
          onClose={() => setShowForm(false)}
          onSubmit={onCreate}
          slots={slots}
        />
      ) : null}
      {editing ? (
        <ScheduleForm
          currentUser={currentUser}
          defaultDay={selectedDay}
          initial={editing}
          onClose={() => setEditing(null)}
          onSubmit={(input) => onUpdate(editing.id, input)}
          slots={slots}
        />
      ) : null}
      {actionsSlot ? (
        <ItemActionsSheet
          eyebrow="Reserva"
          title={`${actionsSlot.label} · ${DAYS_FULL[actionsSlot.day]}`}
          onClose={() => setActionsSlot(null)}
          onEdit={() => {
            setEditing(actionsSlot);
            setActionsSlot(null);
          }}
          onDelete={async () => {
            await onDelete(actionsSlot.id);
            setActionsSlot(null);
          }}
        />
      ) : null}
    </section>
  );
}
