"use client";

import { FormEvent, useState } from "react";
import { LogIn, Mail, UserPlus } from "lucide-react";
import { useAuth } from "./AuthProvider";
import { BrandGlyph } from "./BrandGlyph";

type Mode = "signin" | "signup";

export function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const canSubmit =
    email.trim().length > 3 &&
    password.length >= 6 &&
    (mode === "signin" || fullName.trim().length > 1);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || busy) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === "signin") {
        await signIn(email, password);
      } else {
        const { needsEmailConfirm } = await signUp(email, password, fullName);
        if (needsEmailConfirm) {
          setInfo("Cuenta creada. Revisa tu correo para confirmarla y luego inicia sesión.");
          setMode("signin");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Algo salió mal. Intenta de nuevo.");
    } finally {
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
            <strong>NestLoop</strong>
            <span>La casa, organizada y en paz.</span>
          </div>
        </div>

        <h1 className="auth-title">
          {mode === "signin" ? "Entrar a tu casa" : "Crear tu cuenta"}
        </h1>
        <p className="auth-sub">
          {mode === "signin"
            ? "Pon tu correo y contraseña para continuar."
            : "Con tu nombre, correo y una contraseña basta."}
        </p>

        <form className="auth-form" onSubmit={submit}>
          {mode === "signup" ? (
            <label>
              <span>Tu nombre</span>
              <input
                autoComplete="name"
                placeholder="Ej: María"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </label>
          ) : null}

          <label>
            <span>Correo</span>
            <input
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="tucorreo@ejemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          <label>
            <span>Contraseña</span>
            <input
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              placeholder="Mínimo 6 caracteres"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          {error ? <div className="auth-alert error">{error}</div> : null}
          {info ? <div className="auth-alert info">{info}</div> : null}

          <button className="primary-action full" disabled={!canSubmit || busy} type="submit">
            {mode === "signin" ? <LogIn size={19} /> : <UserPlus size={19} />}
            {busy ? "Un momento…" : mode === "signin" ? "Entrar" : "Crear cuenta"}
          </button>
        </form>

        <div className="auth-switch">
          {mode === "signin" ? (
            <>
              <Mail size={16} />
              <span>¿Primera vez?</span>
              <button type="button" onClick={() => { setMode("signup"); setError(null); setInfo(null); }}>
                Crear una cuenta
              </button>
            </>
          ) : (
            <>
              <LogIn size={16} />
              <span>¿Ya tienes cuenta?</span>
              <button type="button" onClick={() => { setMode("signin"); setError(null); setInfo(null); }}>
                Entrar
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
