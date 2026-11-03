"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase } from "../lib/supabase";
import { Household, Person, toPerson } from "../lib/household";

type AuthStatus = "loading" | "signed-out" | "no-household" | "ready" | "error";

type Profile = { id: string; full_name: string; color: string | null };

type AuthContextValue = {
  status: AuthStatus;
  session: Session | null;
  profile: Profile | null;
  household: Household | null;
  people: Person[];
  currentUserId: string | null;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ needsEmailConfirm: boolean }>;
  signOut: () => Promise<void>;
  createHousehold: (name: string) => Promise<void>;
  joinHousehold: (code: string) => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = getSupabase();
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [household, setHousehold] = useState<Household | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [error, setError] = useState<string | null>(null);
  const activeUserRef = useRef<string | null>(null);
  const loadedUserRef = useRef<string | null>(null);
  const loadingUserRef = useRef<string | null>(null);

  // Carga el perfil, la casa y los miembros del usuario actual.
  // Si una consulta falla (red móvil inestable), reintenta antes de rendirse,
  // y nunca interpreta un fallo como "sin casa" o "sesión cerrada".
  const loadFor = useCallback(
    async (activeSession: Session | null, attempt = 0): Promise<void> => {
      if (!activeSession) {
        setProfile(null);
        setHousehold(null);
        setPeople([]);
        setStatus("signed-out");
        return;
      }

      const userId = activeSession.user.id;
      if (activeUserRef.current !== userId) return;

      try {
        const { data: profileRow, error: pErr } = await supabase
          .from("profiles")
          .select("id, full_name, color")
          .eq("id", userId)
          .maybeSingle();
        if (pErr) throw pErr;
        if (activeUserRef.current !== userId) return;
        setProfile(profileRow ?? { id: userId, full_name: "", color: null });

        const { data: membership, error: mErr } = await supabase
          .from("household_members")
          .select("role, household:households(id, name, invite_code)")
          .eq("profile_id", userId)
          .limit(1)
          .maybeSingle();
        if (mErr) throw mErr;
        if (activeUserRef.current !== userId) return;

        const householdRow = (membership?.household ?? null) as Household | null;
        if (!householdRow) {
          setHousehold(null);
          setPeople([]);
          loadedUserRef.current = userId;
          loadingUserRef.current = null;
          setStatus("no-household");
          return;
        }
        setHousehold(householdRow);

        const { data: memberRows, error: memErr } = await supabase
          .from("household_members")
          .select("profile_id, role, profile:profiles(full_name, color)")
          .eq("household_id", householdRow.id);
        if (memErr) throw memErr;
        if (activeUserRef.current !== userId) return;

        const list: Person[] = (memberRows ?? []).map((row: any, index: number) =>
          toPerson(
            {
              profile_id: row.profile_id,
              role: row.role,
              full_name: row.profile?.full_name ?? "Sin nombre",
              color: row.profile?.color
            },
            index
          )
        );
        list.sort((a, b) => (a.id === userId ? -1 : b.id === userId ? 1 : 0));
        setPeople(list);
        loadedUserRef.current = userId;
        loadingUserRef.current = null;
        setStatus("ready");
      } catch {
        if (activeUserRef.current !== userId) return;
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
          return loadFor(activeSession, attempt + 1);
        }
        loadingUserRef.current = null;
        setStatus("error");
      }
    },
    [supabase]
  );

  const refresh = useCallback(async () => {
    setStatus("loading");
    const { data } = await supabase.auth.getSession();
    activeUserRef.current = data.session?.user.id ?? null;
    loadingUserRef.current = activeUserRef.current;
    loadedUserRef.current = null;
    setSession(data.session);
    await loadFor(data.session);
  }, [supabase, loadFor]);

  useEffect(() => {
    let active = true;

    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!active) return;
      setSession(newSession);
      const userId = newSession?.user.id ?? null;
      activeUserRef.current = userId;

      if (!userId || event === "SIGNED_OUT") {
        loadedUserRef.current = null;
        loadingUserRef.current = null;
        setProfile(null);
        setHousehold(null);
        setPeople([]);
        setStatus("signed-out");
        return;
      }

      // SIGNED_IN also fires when Safari/Chrome brings an existing session forward.
      // Keeping the same app mounted preserves open sheets, fields and selected files.
      if (loadedUserRef.current === userId || loadingUserRef.current === userId) return;
      loadingUserRef.current = userId;

      // INITIAL_SESSION, SIGNED_IN, etc.: diferir fuera del callback para evitar
      // el deadlock del lock interno de auth en supabase-js v2.
      setStatus("loading");
      setTimeout(() => {
        if (active && activeUserRef.current === userId) void loadFor(newSession);
      }, 0);
    });

    return () => {
      active = false;
      loadingUserRef.current = null;
      sub.subscription.unsubscribe();
    };
  }, [supabase, loadFor]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      setError(null);
      const { error: err } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      });
      if (err) throw new Error(translateAuthError(err.message));
    },
    [supabase]
  );

  const signUp = useCallback(
    async (email: string, password: string, fullName: string) => {
      setError(null);
      const { data, error: err } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { full_name: fullName.trim() } }
      });
      if (err) throw new Error(translateAuthError(err.message));
      return { needsEmailConfirm: !data.session };
    },
    [supabase]
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, [supabase]);

  const createHousehold = useCallback(
    async (name: string) => {
      setError(null);
      const { error: err } = await supabase.rpc("create_household", { p_name: name.trim() });
      if (err) throw new Error(err.message);
      await refresh();
    },
    [supabase, refresh]
  );

  const joinHousehold = useCallback(
    async (code: string) => {
      setError(null);
      const { error: err } = await supabase.rpc("join_household", {
        p_invite_code: code.trim().toUpperCase()
      });
      if (err) throw new Error(translateAuthError(err.message));
      await refresh();
    },
    [supabase, refresh]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      profile,
      household,
      people,
      currentUserId: session?.user.id ?? null,
      error,
      signIn,
      signUp,
      signOut,
      createHousehold,
      joinHousehold,
      refresh
    }),
    [
      status,
      session,
      profile,
      household,
      people,
      error,
      signIn,
      signUp,
      signOut,
      createHousehold,
      joinHousehold,
      refresh
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function translateAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "Correo o contraseña incorrectos.";
  if (m.includes("email not confirmed")) return "Tu correo aún no está confirmado.";
  if (m.includes("user already registered")) return "Ese correo ya tiene una cuenta.";
  if (m.includes("password should be at least")) return "La contraseña es muy corta (mínimo 6).";
  if (m.includes("código de invitación") || m.includes("invalid invite")) return "Código de invitación inválido.";
  if (m.includes("unable to validate email")) return "El correo no es válido.";
  return message;
}
