"use client";

import { CalendarDays, CheckCircle2, ChevronRight, Plus } from "lucide-react";
import { Person } from "../../lib/household";
import { expenseStatus, expenseTotals } from "../../lib/expense-status";
import {
  firstUnpaidPeriod,
  periodMonthName,
  type Expense,
  type RecurringBill,
  type Rotation,
  type ScheduleSlot
} from "../../lib/api";
import { SlotRow, todayIndex } from "./agenda";
import { money, rotationIcon, useApp } from "./core";
import { ExpenseRow } from "./expenses";
import { monthlyIsDue, recurringDueStatus } from "./monthly";

export function HomeView({
  currentUser,
  expenses,
  rotations,
  recurringBills,
  slots,
  onNewExpense,
  onOpenExpense,
  onOpenExpenses,
  onOpenMonthly,
  onOpenTurns,
  onOpenAgenda
}: {
  currentUser: Person;
  expenses: Expense[];
  rotations: Rotation[];
  recurringBills: RecurringBill[];
  slots: ScheduleSlot[];
  onNewExpense: () => void;
  onOpenExpense: (id: string) => void;
  onOpenExpenses: () => void;
  onOpenMonthly: () => void;
  onOpenTurns: () => void;
  onOpenAgenda: () => void;
}) {
  const { getPerson } = useApp();
  const totals = expenseTotals(expenses, currentUser.id);
  const toAct = expenses.filter((expense) => {
    const { bucket } = expenseStatus(expense, currentUser.id);
    return bucket === "pay" || bucket === "confirm";
  });
  const monthlyDue = recurringBills
    .filter((bill) => monthlyIsDue(bill, currentUser.id))
    .map((bill) => {
      const period = firstUnpaidPeriod(bill, currentUser.id);
      return {
        bill,
        period,
        status: recurringDueStatus(period, bill.dueDay),
        amount: bill.shares.find((share) => share.personId === currentUser.id)?.amount ?? 0
      };
    })
    .sort((a, b) => a.status.daysLeft - b.status.daysLeft);
  const myTurns = rotations.filter((rotation) => rotation.queue[rotation.currentIndex] === currentUser.id);
  const todaySlots = slots
    .filter((slot) => slot.day === todayIndex())
    .sort((a, b) => a.start.localeCompare(b.start));
  const pending = monthlyDue.length + toAct.length + myTurns.length;
  const firstName = currentUser.name.split(/\s+/)[0];

  return (
    <section className="view-stack">
      <header className="view-header">
        <div>
          <h1>Hola, {firstName}</h1>
          <p className="view-sub">
            {pending ? `${pending} ${pending === 1 ? "cosa pendiente" : "cosas pendientes"}` : "Todo está al día"}
          </p>
        </div>
        <button className="primary-action compact" onClick={onNewExpense} type="button">
          <Plus size={18} />
          Nuevo gasto
        </button>
      </header>

      <button className="money-card as-button" onClick={onOpenExpenses} type="button">
        <div>
          <span>Te toca pagar</span>
          <strong>{money(totals.toPay)}</strong>
        </div>
        <div>
          <span>Te deben</span>
          <strong className="positive">{money(totals.incoming)}</strong>
        </div>
      </button>

      {pending ? (
        <section className="list-group">
          <div className="group-head">
            <strong>Para ti</strong>
            <span className="group-count">{pending}</span>
          </div>
          <div className="list-card">
            {monthlyDue.map(({ bill, period, status, amount }) => (
              <button className="action-row" key={bill.id} onClick={onOpenMonthly} type="button">
                <span className={`row-icon ${status.tone === "overdue" ? "is-pay" : "is-review"}`}>
                  <CalendarDays size={18} />
                </span>
                <span className="row-copy">
                  <strong>{bill.title}</strong>
                  <small>
                    {status.label} · {periodMonthName(period)}
                  </small>
                </span>
                <span className="row-amount">{money(amount)}</span>
              </button>
            ))}
            {toAct.slice(0, 4).map((expense) => (
              <ExpenseRow expense={expense} key={expense.id} onOpen={onOpenExpense} />
            ))}
            {toAct.length > 4 ? (
              <button className="more-row" onClick={onOpenExpenses} type="button">
                Ver {toAct.length - 4} más
                <ChevronRight size={17} />
              </button>
            ) : null}
            {myTurns.map((rotation) => {
              const Icon = rotationIcon(rotation.icon);
              return (
                <button className="action-row" key={rotation.id} onClick={onOpenTurns} type="button">
                  <span className="row-icon is-turn">
                    <Icon size={18} />
                  </span>
                  <span className="row-copy">
                    <strong>{rotation.title}</strong>
                    <small>Te toca a ti</small>
                  </span>
                  <ChevronRight size={18} />
                </button>
              );
            })}
          </div>
        </section>
      ) : (
        <div className="all-clear">
          <span className="row-icon is-paid">
            <CheckCircle2 size={19} />
          </span>
          <span>
            <strong>Sin pendientes</strong>
            <small>No tienes pagos ni turnos por hacer.</small>
          </span>
        </div>
      )}

      {todaySlots.length ? (
        <section className="list-group">
          <button className="group-head toggle" onClick={onOpenAgenda} type="button">
            <strong>Hoy en la casa</strong>
            <ChevronRight className="group-chevron" size={18} />
          </button>
          <div className="list-card">
            {todaySlots.map((slot) => (
              <SlotRow key={slot.id} slot={slot} />
            ))}
          </div>
        </section>
      ) : null}

      {rotations.length ? (
        <section className="list-group">
          <button className="group-head toggle" onClick={onOpenTurns} type="button">
            <strong>Turnos</strong>
            <ChevronRight className="group-chevron" size={18} />
          </button>
          <div className="turn-chips">
            {rotations.map((rotation) => {
              const person = getPerson(rotation.queue[rotation.currentIndex]);
              return (
                <button key={rotation.id} onClick={onOpenTurns} type="button">
                  <small>{rotation.title}</small>
                  <strong>{person.id === currentUser.id ? "Tú" : person.shortName}</strong>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}
    </section>
  );
}
