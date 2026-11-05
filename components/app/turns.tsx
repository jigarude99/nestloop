"use client";

import { Check, ChevronDown, ChevronUp, Pencil, Plus, RotateCw, Trash2, Undo2, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Person } from "../../lib/household";
import type { NewRotationInput, Rotation, RotationIcon } from "../../lib/api";
import { Avatar, ItemActionsSheet, ModalBackdrop, rotationIcon, shortDate, useApp } from "./core";

function TurnRow({
  rotation,
  onComplete,
  onUndo,
  onEdit,
  onDelete
}: {
  rotation: Rotation;
  onComplete: (rotation: Rotation) => Promise<void>;
  onUndo: (rotation: Rotation) => Promise<void>;
  onEdit: (rotation: Rotation) => void;
  onDelete: (rotation: Rotation) => Promise<void>;
}) {
  const { getPerson, currentUserId } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [justDone, setJustDone] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isAdmin = getPerson(currentUserId).role === "admin";
  const Icon = rotationIcon(rotation.icon);
  const currentId = rotation.queue[rotation.currentIndex];
  const currentPerson = getPerson(currentId);
  const nextPerson = getPerson(rotation.queue[(rotation.currentIndex + 1) % rotation.queue.length]);
  const isMyTurn = currentId === currentUserId;
  const canMark = isMyTurn || isAdmin;
  const canUndo = (rotation.history[0]?.personId === currentUserId || isAdmin) && rotation.history.length > 0;

  useEffect(() => {
    if (!justDone) return;
    const timer = window.setTimeout(() => setJustDone(false), 8000);
    return () => window.clearTimeout(timer);
  }, [justDone]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo. Intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className={`turn-row ${isMyTurn ? "mine" : ""}`}>
      <div className="turn-line">
        <button
          className="turn-main"
          onClick={() => setExpanded((value) => !value)}
          type="button"
          aria-expanded={expanded}
        >
          <span className="turn-icon">
            <Icon size={18} strokeWidth={2.4} />
          </span>
          <span className="turn-copy">
            <strong>{rotation.title}</strong>
            <small>{isMyTurn ? "Te toca a ti" : `Le toca a ${currentPerson.shortName}`}</small>
          </span>
          {expanded ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
        </button>
        {canMark ? (
          <button
            className={`turn-done ${isMyTurn ? "primary" : ""}`}
            disabled={busy}
            onClick={() =>
              run(async () => {
                await onComplete(rotation);
                setJustDone(true);
              })
            }
            type="button"
            aria-label={isMyTurn ? `Marcar hecho: ${rotation.title}` : `Marcar hecho por ${currentPerson.shortName}: ${rotation.title}`}
          >
            <Check size={16} strokeWidth={3} />
            Hecho
          </button>
        ) : (
          <Avatar person={currentPerson} size="sm" />
        )}
      </div>

      {justDone ? (
        <div className="turn-flash" role="status">
          <span>Listo. Ahora le toca a {currentPerson.shortName}.</span>
          {canUndo ? (
            <button
              className="undo-link"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await onUndo(rotation);
                  setJustDone(false);
                })
              }
              type="button"
            >
              <Undo2 size={14} />
              Deshacer
            </button>
          ) : null}
        </div>
      ) : null}

      {error ? <div className="auth-alert error">{error}</div> : null}

      {expanded ? (
        <div className="turn-details">
          <p className="turn-cadence">
            {rotation.cadence}
            {rotation.queue.length > 1 ? ` · después sigue ${nextPerson.shortName}` : ""}
          </p>
          <div className="queue-strip" aria-label="Orden del turno">
            {rotation.queue.map((personId, index) => {
              const person = getPerson(personId);
              return (
                <span className={index === rotation.currentIndex ? "active" : ""} key={`${rotation.id}-${personId}`}>
                  <Avatar person={person} size="sm" />
                  {person.shortName}
                </span>
              );
            })}
          </div>
          {rotation.history.length ? (
            <div className="turn-history">
              {rotation.history.slice(0, 3).map((event) => (
                <div key={`${event.personId}-${event.completedAt}`}>
                  <span>Lo hizo {getPerson(event.personId).shortName}</span>
                  <small>{shortDate(event.completedAt.slice(0, 10))}</small>
                </div>
              ))}
            </div>
          ) : (
            <p className="turn-cadence">Todavía no hay turnos completados.</p>
          )}
          <div className="turn-tools">
            {canUndo && !justDone ? (
              <button className="tiny-button" disabled={busy} onClick={() => run(() => onUndo(rotation))} type="button">
                <Undo2 size={15} />
                Deshacer
              </button>
            ) : null}
            <button className="tiny-button" onClick={() => onEdit(rotation)} type="button">
              <Pencil size={15} />
              Editar
            </button>
            <button className="tiny-button" onClick={() => setDeleting(true)} type="button">
              <Trash2 size={15} />
              Eliminar
            </button>
          </div>
        </div>
      ) : null}

      {deleting ? (
        <ItemActionsSheet
          eyebrow="Turno"
          onClose={() => setDeleting(false)}
          onDelete={() => onDelete(rotation)}
          title={rotation.title}
        />
      ) : null}
    </article>
  );
}

export function TasksView({
  rotations,
  onComplete,
  onUndo,
  onCreate,
  onUpdate,
  onDelete
}: {
  rotations: Rotation[];
  onComplete: (rotation: Rotation) => Promise<void>;
  onUndo: (rotation: Rotation) => Promise<void>;
  onCreate: (input: NewRotationInput) => Promise<void>;
  onUpdate: (id: string, input: NewRotationInput) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const { currentUserId } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Rotation | null>(null);
  const isMine = (rotation: Rotation) => rotation.queue[rotation.currentIndex] === currentUserId;
  const ordered = [...rotations].sort((a, b) => Number(isMine(b)) - Number(isMine(a)));

  return (
    <section className="view-stack">
      <header className="view-header">
        <h1>Turnos</h1>
        <button className="primary-action compact" onClick={() => setShowForm(true)} type="button">
          <Plus size={18} />
          Nuevo turno
        </button>
      </header>
      {rotations.length ? (
        <div className="list-card turn-list">
          {ordered.map((rotation) => (
            <TurnRow
              key={rotation.id}
              rotation={rotation}
              onComplete={onComplete}
              onUndo={onUndo}
              onEdit={setEditing}
              onDelete={(r) => onDelete(r.id)}
            />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <RotateCw size={28} />
          <strong>Aún no hay turnos</strong>
          <span>Crea el del agua para empezar.</span>
        </div>
      )}
      {showForm ? <RotationForm onClose={() => setShowForm(false)} onSubmit={onCreate} /> : null}
      {editing ? (
        <RotationForm
          initial={editing}
          onClose={() => setEditing(null)}
          onSubmit={(input) => onUpdate(editing.id, input)}
        />
      ) : null}
    </section>
  );
}

export function RotationForm({
  initial,
  onClose,
  onSubmit
}: {
  initial?: Rotation | null;
  onClose: () => void;
  onSubmit: (input: NewRotationInput) => Promise<void>;
}) {
  const { people } = useApp();
  const isEdit = !!initial;
  const [title, setTitle] = useState(initial?.title ?? "Comprar agua");
  const [cadence, setCadence] = useState(initial?.cadence ?? "Cuando se acaba");
  const [icon, setIcon] = useState<RotationIcon>(initial?.icon ?? "water");
  const [hidden, setHidden] = useState(initial?.hiddenFromNonParticipants ?? false);
  const [order, setOrder] = useState<string[]>(() =>
    initial ? initial.queue.filter((id) => people.some((p) => p.id === id)) : people.map((p) => p.id)
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosen = order
    .map((id) => people.find((p) => p.id === id))
    .filter((p): p is Person => !!p);
  const available = people.filter((p) => !order.includes(p.id));

  function move(index: number, dir: -1 | 1) {
    setOrder((cur) => {
      const j = index + dir;
      if (j < 0 || j >= cur.length) return cur;
      const next = cur.slice();
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  }
  const removeFromOrder = (id: string) => setOrder((cur) => cur.filter((x) => x !== id));
  const addToOrder = (id: string) => setOrder((cur) => (cur.includes(id) ? cur : [...cur, id]));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || chosen.length === 0 || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        title: title.trim(),
        cadence: cadence.trim() || "Por turnos",
        icon,
        hiddenFromNonParticipants: hidden,
        queue: chosen.map((p) => p.id)
      });
      onClose();
    } catch {
      setError("No se pudo guardar el turno. Intenta de nuevo.");
      setSaving(false);
    }
  }

  return (
    <ModalBackdrop onBack={onClose}>
      <form className="modal-sheet schedule-form" onSubmit={submit}>
        <div className="modal-header">
          <div>
            <p className="eyebrow">{isEdit ? "Editar" : "Nuevo turno"}</p>
            <h2>{isEdit ? "Editar turno" : "Crear un turno rotativo"}</h2>
          </div>
          <button className="icon-button" onClick={onClose} type="button" aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>
        <label>
          <span>¿Qué hay que hacer?</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej: Comprar agua" />
        </label>
        <label>
          <span>¿Cada cuándo?</span>
          <input value={cadence} onChange={(e) => setCadence(e.target.value)} placeholder="Ej: Cada semana" />
        </label>
        <label>
          <span>Ícono</span>
          <select value={icon} onChange={(e) => setIcon(e.target.value as RotationIcon)}>
            <option value="water">Agua</option>
            <option value="trash">Basura</option>
            <option value="plants">Plantas / otro</option>
          </select>
        </label>
        <div className="order-block">
          <span className="order-title">Orden del turno</span>
          <div className="order-list">
            {chosen.map((person, index) => (
              <div className="order-row" key={person.id}>
                <span className="order-num">{index + 1}</span>
                <Avatar person={person} size="sm" />
                <span className="order-name">{person.name}</span>
                <div className="order-actions">
                  <button type="button" disabled={index === 0} onClick={() => move(index, -1)} aria-label="Subir">
                    <ChevronUp size={17} />
                  </button>
                  <button
                    type="button"
                    disabled={index === chosen.length - 1}
                    onClick={() => move(index, 1)}
                    aria-label="Bajar"
                  >
                    <ChevronDown size={17} />
                  </button>
                  <button type="button" onClick={() => removeFromOrder(person.id)} aria-label="Quitar">
                    <X size={16} />
                  </button>
                </div>
              </div>
            ))}
            {chosen.length === 0 ? <p className="order-empty">Agrega al menos una persona.</p> : null}
          </div>
          {available.length ? (
            <div className="order-add">
              <span>Agregar:</span>
              {available.map((person) => (
                <button type="button" key={person.id} className="order-add-chip" onClick={() => addToOrder(person.id)}>
                  <Avatar person={person} size="sm" />
                  {person.shortName}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <label className={`privacy-option ${hidden ? "active" : ""}`}>
          <input checked={hidden} onChange={(event) => setHidden(event.target.checked)} type="checkbox" />
          <span>
            <strong>Ocultar a quienes no participan</strong>
            <small>Solo lo verán las personas del turno y el administrador.</small>
          </span>
        </label>
        <p className="form-hint">
          {chosen.length
            ? `Empieza por ${chosen[0]?.name}. Después sigue el orden de la lista.`
            : "Elige el orden de la rotación."}
        </p>
        {error ? <div className="auth-alert error">{error}</div> : null}
        <button className="primary-action full" type="submit" disabled={!title.trim() || !chosen.length || saving}>
          <Plus size={19} />
          {saving ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear turno"}
        </button>
      </form>
    </ModalBackdrop>
  );
}
