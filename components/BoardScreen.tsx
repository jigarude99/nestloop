"use client";

import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Droplets,
  LogOut,
  type LucideIcon,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Scale,
  Sparkles,
  WifiOff
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BoardRotation, displayTime, fetchBoard, type HouseholdBoard } from "../lib/api";

const STORAGE_KEY = "nestloop:board-code";
const DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const DAYS_SHORT = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function rotationIcon(icon: BoardRotation["icon"]): LucideIcon {
  if (icon === "water") return Droplets;
  if (icon === "trash") return RotateCcw;
  return Sparkles;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return parts.slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

/** Día de hoy en convención de la app (0 = Lunes … 6 = Domingo). */
function todayDow() {
  return (new Date().getDay() + 6) % 7;
}

function Chip({ name, color }: { name: string; color: string }) {
  return (
    <span className="kiosk-chip" style={{ "--c": color } as React.CSSProperties}>
      <span className="kiosk-chip-dot">{initials(name)}</span>
      {name}
    </span>
  );
}

function CodeEntry({
  onSubmit,
  onExit,
  invalid
}: {
  onSubmit: (code: string) => void;
  onExit: () => void;
  invalid: boolean;
}) {
  const [value, setValue] = useState("");
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark">
            <img src="/icon-192.png" alt="" width={28} height={28} className="brand-glyph-img" />
          </span>
          <div>
            <strong>NestLoop · Tablero</strong>
            <span>La casa, de un vistazo.</span>
          </div>
        </div>
        <h1 className="auth-title">Pon el código de la casa</h1>
        <p className="auth-sub">
          Esta pantalla muestra el resumen de toda la casa, sin entrar a la cuenta de nadie.
        </p>
        <form
          className="auth-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (value.trim().length >= 4) onSubmit(value.trim().toUpperCase());
          }}
        >
          <label>
            <span>Código de invitación</span>
            <input
              autoFocus
              placeholder="Ej: A1B2C3"
              value={value}
              onChange={(e) => setValue(e.target.value.toUpperCase())}
              style={{ letterSpacing: "0.18em", textTransform: "uppercase" }}
            />
          </label>
          {invalid ? <div className="auth-alert error">No encontramos esa casa. Revisa el código.</div> : null}
          <button className="primary-action full" disabled={value.trim().length < 4} type="submit">
            <ArrowRight size={19} />
            Mostrar tablero
          </button>
        </form>
        <p className="auth-sub" style={{ margin: "16px 0 0" }}>
          El código es el mismo que usas para invitar a tu familia (lo ves en “Personas” dentro de la app).
        </p>
        <button className="auth-signout" type="button" onClick={onExit}>
          <ArrowLeft size={16} />
          Volver al inicio de sesión
        </button>
      </div>
    </div>
  );
}

export function BoardScreen({ onExit }: { onExit: () => void }) {
  const [code, setCode] = useState<string | null>(null);
  const [board, setBoard] = useState<HouseholdBoard | null>(null);
  const [status, setStatus] = useState<"entry" | "loading" | "ready" | "invalid" | "offline">("entry");
  const [now, setNow] = useState(() => new Date());
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const codeRef = useRef<string | null>(null);

  // Reloj en vivo
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const load = useCallback(async (theCode: string, silent = false) => {
    if (!silent) setStatus("loading");
    try {
      const data = await fetchBoard(theCode);
      if (!data.ok) {
        setStatus("invalid");
        return;
      }
      setBoard(data);
      setUpdatedAt(new Date());
      setStatus("ready");
    } catch {
      // Si ya teníamos datos, los dejamos en pantalla y solo marcamos sin conexión.
      setStatus((prev) => (prev === "ready" ? "ready" : "offline"));
    }
  }, []);

  // Cargar código guardado al iniciar
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      saved = null;
    }
    if (saved) {
      setCode(saved);
      codeRef.current = saved;
      load(saved);
    } else {
      setStatus("entry");
    }
  }, [load]);

  // Auto-refresco cada 60s
  useEffect(() => {
    if (status !== "ready" && status !== "offline") return;
    const t = window.setInterval(() => {
      if (codeRef.current) load(codeRef.current, true);
    }, 60_000);
    return () => window.clearInterval(t);
  }, [status, load]);

  function submitCode(c: string) {
    setCode(c);
    codeRef.current = c;
    fetchBoard(c)
      .then((data) => {
        if (!data.ok) {
          setStatus("invalid");
          return;
        }
        try {
          window.localStorage.setItem(STORAGE_KEY, c);
        } catch {
          /* ignore */
        }
        setBoard(data);
        setUpdatedAt(new Date());
        setStatus("ready");
      })
      .catch(() => setStatus("offline"));
  }

  function changeHouse() {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setBoard(null);
    setCode(null);
    codeRef.current = null;
    setStatus("entry");
  }

  const dow = todayDow();
  const todaySlots = useMemo(
    () => (board?.slots ?? []).filter((s) => s.day === dow),
    [board, dow]
  );

  if (status === "entry" || status === "invalid") {
    return <CodeEntry onSubmit={submitCode} onExit={onExit} invalid={status === "invalid"} />;
  }

  if (!board) {
    return (
      <div className="kiosk kiosk-center">
        <span className="loading-mark">
          <RotateCw size={26} />
        </span>
      </div>
    );
  }

  const clock = now.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
  const dateStr = now.toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="kiosk">
      <header className="kiosk-top">
        <div>
          <p className="kiosk-eyebrow">Tablero de la casa</p>
          <h1>{board.household}</h1>
        </div>
        <div className="kiosk-clock">
          <strong>{clock}</strong>
          <span>{dateStr}</span>
        </div>
      </header>

      <div className="kiosk-grid">
        {board.rotations && board.rotations.length ? (
          <section className="kiosk-card">
            <div className="kiosk-card-head">
              <RotateCw size={20} />
              <h2>Le toca ahora</h2>
            </div>
            <div className="kiosk-turns">
              {board.rotations.map((r, i) => {
                const Icon = rotationIcon(r.icon);
                return (
                  <div className="kiosk-turn" key={`${r.title}-${i}`}>
                    <span className="kiosk-turn-icon" style={{ "--c": r.currentColor ?? "#0f9f7a" } as React.CSSProperties}>
                      <Icon size={22} />
                    </span>
                    <div>
                      <small>{r.title}</small>
                      <strong style={{ color: r.currentColor ?? undefined }}>{r.current ?? "—"}</strong>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        <section className="kiosk-card">
          <div className="kiosk-card-head">
            <CalendarDays size={20} />
            <h2>Horarios de hoy</h2>
          </div>
          {todaySlots.length ? (
            <div className="kiosk-today">
              {todaySlots.map((s, i) => (
                <div className="kiosk-slot" key={i} style={{ "--c": s.color } as React.CSSProperties}>
                  <span className="kiosk-slot-dot">{initials(s.name)}</span>
                  <div>
                    <strong>{s.name}</strong>
                    <small>{s.label} · {displayTime(s.start)}–{displayTime(s.end)}</small>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="kiosk-empty">Nadie tiene horario hoy.</p>
          )}

          <div className="kiosk-week">
            {DAYS_SHORT.map((d, idx) => {
              const count = (board.slots ?? []).filter((s) => s.day === idx).length;
              return (
                <div className={`kiosk-week-day ${idx === dow ? "today" : ""} ${count ? "has" : ""}`} key={d}>
                  <small>{d}</small>
                  <span>{count || "·"}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="kiosk-card kiosk-card-wide">
          <div className="kiosk-card-head">
            <Scale size={20} />
            <h2>Quién le debe a quién</h2>
          </div>
          {board.debts && board.debts.length ? (
            <div className="kiosk-debts">
              {board.debts.map((d, i) => (
                <div className="kiosk-debt" key={i}>
                  <Chip name={d.from} color={d.fromColor} />
                  <span className="kiosk-debt-mid">
                    <ArrowRight size={18} />
                    <strong>${d.amount.toFixed(2)}</strong>
                  </span>
                  <Chip name={d.to} color={d.toColor} />
                </div>
              ))}
            </div>
          ) : (
            <p className="kiosk-clear">🎉 Todos están a mano. Nadie debe nada.</p>
          )}
        </section>
      </div>

      <footer className="kiosk-foot">
        <span>
          {status === "offline" ? (
            <>
              <WifiOff size={14} /> Sin conexión · mostrando lo último
            </>
          ) : (
            <>
              <RefreshCw size={14} /> Se actualiza solo
              {updatedAt ? ` · ${updatedAt.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}` : ""}
            </>
          )}
        </span>
        <button className="kiosk-change" onClick={changeHouse} type="button">
          <LogOut size={14} />
          Cambiar casa
        </button>
      </footer>
    </div>
  );
}
