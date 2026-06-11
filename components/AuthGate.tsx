"use client";

import { RotateCw } from "lucide-react";
import { hasSupabaseConfig } from "../lib/supabase";
import { AuthProvider, useAuth } from "./AuthProvider";
import { AuthScreen } from "./AuthScreen";
import { HouseholdSetup } from "./HouseholdSetup";
import { NestLoopApp } from "./NestLoopApp";

function LoadingScreen() {
  return (
    <div className="auth-screen">
      <div className="loading-mark" aria-label="Cargando">
        <RotateCw size={26} />
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

function Gate() {
  const { status, people, currentUserId, household, signOut } = useAuth();

  if (status === "loading") return <LoadingScreen />;
  if (status === "signed-out") return <AuthScreen />;
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
  if (!hasSupabaseConfig) return <NotConfigured />;
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
