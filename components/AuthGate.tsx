"use client";

import { useState } from "react";
import { RotateCw, WifiOff } from "lucide-react";
import { hasSupabaseConfig } from "../lib/supabase";
import { AuthProvider, useAuth } from "./AuthProvider";
import { AuthScreen } from "./AuthScreen";
import { BoardScreen } from "./BoardScreen";
import { HouseholdSetup } from "./HouseholdSetup";
import { NestLoopApp } from "./NestLoopApp";

const BOARD_MODE_KEY = "nestloop:mode";

function LoadingScreen() {
  return (
    <div className="auth-screen">
      <div className="loading-mark" aria-label="Cargando">
        <RotateCw size={26} />
      </div>
    </div>
  );
}

function ErrorScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="auth-screen">
      <div className="auth-card" style={{ textAlign: "center" }}>
        <div className="loading-mark" style={{ margin: "0 auto 14px", animation: "none" }}>
          <WifiOff size={26} />
        </div>
        <h1 className="auth-title">No se pudo conectar</h1>
        <p className="auth-sub">Revisa tu internet. Tu sesión sigue activa.</p>
        <button className="primary-action full" onClick={onRetry} type="button">
          <RotateCw size={19} />
          Reintentar
        </button>
      </div>
    </div>
  );
}

function NotConfigured() {
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1 className="auth-title">Falta configurar la nube</h1>
        <p className="auth-sub">
          No se encontraron las variables de Supabase. Revisa el archivo
          <code> .env.local</code> y vuelve a cargar.
        </p>
      </div>
    </div>
  );
}

function Gate({ onBoardMode }: { onBoardMode: () => void }) {
  const { status, people, currentUserId, household, signOut, refresh } = useAuth();

  if (status === "loading") return <LoadingScreen />;
  if (status === "error") return <ErrorScreen onRetry={refresh} />;
  if (status === "signed-out") return <AuthScreen onBoardMode={onBoardMode} />;
  if (status === "no-household") return <HouseholdSetup />;

  // status === "ready"
  return (
    <NestLoopApp
      people={people}
      currentUserId={currentUserId as string}
      household={household!}
      onSignOut={signOut}
    />
  );
}

export function AuthGate() {
  const [board, setBoard] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(BOARD_MODE_KEY) === "board";
    } catch {
      return false;
    }
  });

  function enterBoard() {
    try {
      window.localStorage.setItem(BOARD_MODE_KEY, "board");
    } catch {
      /* ignore */
    }
    setBoard(true);
  }

  function exitBoard() {
    try {
      window.localStorage.removeItem(BOARD_MODE_KEY);
    } catch {
      /* ignore */
    }
    setBoard(false);
  }

  if (!hasSupabaseConfig) return <NotConfigured />;
  // El tablero no necesita cuenta: vive fuera del AuthProvider.
  if (board) return <BoardScreen onExit={exitBoard} />;
  return (
    <AuthProvider>
      <Gate onBoardMode={enterBoard} />
    </AuthProvider>
  );
}
