export type MemberRole = "admin" | "member";

export type Household = {
  id: string;
  name: string;
  invite_code: string | null;
};

export type Person = {
  id: string;
  name: string;
  shortName: string;
  initials: string;
  role: MemberRole;
  color: string;
  tint: string;
};

/** Paleta de respaldo para asignar colores estables por persona. */
const PALETTE = ["#0f9f7a", "#f26d5b", "#4a90e2", "#f6c64f", "#8f79ff", "#e2725b", "#3aa3a3"];

export function colorForIndex(index: number): string {
  return PALETTE[index % PALETTE.length];
}

/** Versión clara del color (para fondos suaves). */
export function tintFor(color: string): string {
  const hex = color.replace("#", "");
  if (hex.length !== 6) return "#eef2ea";
  return `#${hex}26`; // ~15% alpha
}

export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "??";
  const letters = parts.slice(0, 2).map((p) => p[0]);
  return letters.join("").toUpperCase();
}

export function shortNameFor(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? name;
  return first.length > 10 ? `${first.slice(0, 9)}…` : first;
}

/** Convierte un miembro crudo de Supabase en el modelo Person de la UI. */
export function toPerson(
  raw: { profile_id: string; role: MemberRole; full_name: string; color?: string | null },
  index: number
): Person {
  const name = raw.full_name?.trim() || "Sin nombre";
  const color = raw.color || colorForIndex(index);
  return {
    id: raw.profile_id,
    name,
    shortName: shortNameFor(name),
    initials: initialsFor(name),
    role: raw.role,
    color,
    tint: tintFor(color)
  };
}
