"use client";

import { FormEvent, useState } from "react";
import { KeyRound, LogOut, Plus } from "lucide-react";
import { useAuth } from "./AuthProvider";
import { BrandGlyph } from "./BrandGlyph";

type Mode = "create" | "join";

export function HouseholdSetup() {
  const { createHousehold, joinHousehold, signOut, profile } = useAuth();
  const [mode, setMode] = useState<Mode>("create");
  const [houseName, setHouseName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const firstName = profile?.full_name?.trim().split(/\s+/)[0];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === "create") {
        if (houseName.trim().length < 2) throw new Error("Ponle un nombre a tu casa.");
        await createHousehold(houseName);
      } else {
        if (code.trim().length < 4) throw new Error("Escribe el código completo.");
        await joinHousehold(code);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo. Intenta de nuevo.");
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark">
            <BrandGlyph size={28} />
          </span>
          <div>
            <strong>{firstName ? `Hola, ${firstName}` : "Tu casa"}</strong>
            <span>Vamos a preparar tu casa.</span>
          </div>
        </div>

        <div className="setup-toggle">
          <button
            className={mode === "create" ? "active" : ""}
            type="button"
            onClick={() => { setMode("create"); setError(null); }}
          >
            Crear una casa
          </button>
          <button
            className={mode === "join" ? "active" : ""}
            type="button"
            onClick={() => { setMode("join"); setError(null); }}
          >
            Unirme con código
          </button>
        </div>

        <p className="auth-sub">
          {mode === "create"
            ? "Crea la casa una vez. Después invitas a tu familia con un código."
            : "Si alguien de tu casa ya la creó, pídele el código y pégalo aquí."}
        </p>

        <form className="auth-form" onSubmit={submit}>
          {mode === "create" ? (
            <label>
              <span>Nombre de la casa</span>
              <input
                placeholder="Ej: Casa de los García"
                value={houseName}
                onChange={(e) => setHouseName(e.target.value)}
              />
            </label>
          ) : (
            <label>
              <span>Código de invitación</span>
              <input
                placeholder="Ej: A1B2C3"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                style={{ letterSpacing: "0.18em", textTransform: "uppercase" }}
              />
            </label>
          )}

          {error ? <div className="auth-alert error">{error}</div> : null}

          <button className="primary-action full" disabled={busy} type="submit">
            {mode === "create" ? <Plus size={19} /> : <KeyRound size={19} />}
            {busy ? "Un momento…" : mode === "create" ? "Crear mi casa" : "Unirme"}
          </button>
        </form>

        <button className="auth-signout" type="button" onClick={() => signOut()}>
          <LogOut size={16} />
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
