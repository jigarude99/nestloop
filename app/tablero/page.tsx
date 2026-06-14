import type { Metadata } from "next";
import { BoardScreen } from "../../components/BoardScreen";

export const metadata: Metadata = {
  title: "Tablero · NestLoop",
  description: "Resumen de la casa: turnos, horarios y saldos."
};

export default function TableroPage() {
  return <BoardScreen />;
}
