"use client";

import {
  BellRing,
  CalendarDays,
  Database,
  Home,
  LucideIcon,
  ReceiptText,
  RotateCw,
  Users
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Household, Person } from "../lib/household";
import { BrandGlyph } from "./BrandGlyph";
import { useAppLocation, type AppView } from "./useAppLocation";
import { AgendaView } from "./app/agenda";
import { AppData, AppDataContext, Avatar, PLACEHOLDER, notificationStorageKey } from "./app/core";
import { BalanceSheet, ExpenseDetail, ExpenseForm, ExpensesView } from "./app/expenses";
import { HomeView } from "./app/home";
import { HelpSheet, HistorySheet, NotificationsSheet, PeopleView, ProfileSheet } from "./app/household";
import { TasksView } from "./app/turns";
import {
  cancelOwnCashPayment as apiCancelOwnCashPayment,
  createExpense as apiCreateExpense,
  createRecurringBill as apiCreateRecurringBill,
  createRotation as apiCreateRotation,
  createSlot as apiCreateSlot,
  completeRotation as apiCompleteRotation,
  deleteExpense as apiDeleteExpense,
  deleteRecurringBill as apiDeleteRecurringBill,
  deleteRotation as apiDeleteRotation,
  deleteSlot as apiDeleteSlot,
  ensurePushSubscription,
  fetchExpenses,
  fetchNotifications,
  fetchRecurringBills,
  fetchRotations,
  fetchSlots,
  firstUnpaidPeriod,
  lastPaidPeriod,
  markRecurringPaid as apiMarkRecurringPaid,
  markSharePaid,
  payExpenseForEveryone as apiPayExpenseForEveryone,
  registerPushNotifications,
  setShareStatus,
  settleWith as apiSettleWith,
  triggerPushDispatch,
  undoRotation as apiUndoRotation,
  undoSettlement as apiUndoSettlement,
  unmarkRecurringPaid as apiUnmarkRecurringPaid,
  updateExpense as apiUpdateExpense,
  updateRecurringBill as apiUpdateRecurringBill,
  updateRotation as apiUpdateRotation,
  updateSlot as apiUpdateSlot,
  type Expense,
  type NewExpenseInput,
  type NewRecurringBillInput,
  type NewRotationInput,
  type NewSlotInput,
  type NotificationDelivery,
  type PaymentMethod,
  type PushRegistrationResult,
  type RecurringBill,
  type Rotation,
  type ScheduleSlot
} from "../lib/api";

type NavItem = { view: AppView; label: string; icon: LucideIcon };

const NAV_ITEMS: NavItem[] = [
  { view: "home", label: "Inicio", icon: Home },
  { view: "expenses", label: "Gastos", icon: ReceiptText },
  { view: "tasks", label: "Turnos", icon: RotateCw },
  { view: "calendar", label: "Agenda", icon: CalendarDays },
  { view: "people", label: "Personas", icon: Users }
];

function AppNav({
  activeView,
  setActiveView
}: {
  activeView: AppView;
  setActiveView: (view: AppView) => void;
}) {
  return (
    <nav className="app-nav" aria-label="Navegación principal">
      <div className="brand-lockup">
        <span className="brand-mark">
          <BrandGlyph size={26} />
        </span>
        <strong>NestLoop</strong>
      </div>
      <div className="nav-items">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activeView === item.view;
          return (
            <button
              className={`nav-button ${active ? "active" : ""}`}
              key={item.view}
              onClick={() => setActiveView(item.view)}
              type="button"
              aria-current={active ? "page" : undefined}
            >
              <span className="nav-icon">
                <Icon size={21} />
              </span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function TopBar({
  currentUser,
  household,
  unreadCount,
  notificationPermission,
  onNotificationsClick,
  onProfileClick
}: {
  currentUser: Person;
  household: Household;
  unreadCount: number;
  notificationPermission: NotificationPermission | PushRegistrationResult;
  onNotificationsClick: () => void;
  onProfileClick: () => void;
}) {
  return (
    <header className="top-bar">
      <div className="top-brand">
        <span className="brand-mark">
          <BrandGlyph size={22} />
        </span>
        <strong>{household.name}</strong>
      </div>
      <div className="top-actions">
        <button
          className="notification-button"
          onClick={onNotificationsClick}
          type="button"
          title={notificationPermission === "granted" ? "Ver notificaciones" : "Activar y ver notificaciones"}
          aria-label={`${unreadCount} notificaciones nuevas`}
        >
          <BellRing size={19} />
          {unreadCount > 0 ? <span>{unreadCount}</span> : null}
        </button>
        <button className="profile-button" onClick={onProfileClick} type="button" aria-label="Mi perfil">
          <Avatar person={currentUser} size="sm" />
        </button>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Componente raíz
// ---------------------------------------------------------------------------
export function NestLoopApp({
  people,
  currentUserId,
  household,
  onSignOut
}: {
  people: Person[];
  currentUserId: string;
  household: Household;
  onSignOut: () => void;
}) {
  const { activeView, setActiveView, expensesTab, setExpensesTab, activeExpenseId, setActiveExpenseId } =
    useAppLocation(household.id, currentUserId);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [recurringBills, setRecurringBills] = useState<RecurringBill[]>([]);
  const [rotations, setRotations] = useState<Rotation[]>([]);
  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [addingExpense, setAddingExpense] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [balancePerson, setBalancePerson] = useState<Person | null>(null);
  const [notifications, setNotifications] = useState<NotificationDelivery[]>([]);
  const [seenNotificationIds, setSeenNotificationIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | PushRegistrationResult
  >("unsupported");

  const hid = household.id;

  const reloadExpenses = useCallback(async () => {
    setExpenses(await fetchExpenses(hid));
  }, [hid]);
  const reloadRecurringBills = useCallback(async () => {
    setRecurringBills(await fetchRecurringBills(hid));
  }, [hid]);
  const reloadRotations = useCallback(async () => {
    setRotations(await fetchRotations(hid));
  }, [hid]);
  const reloadSlots = useCallback(async () => {
    setSlots(await fetchSlots(hid));
  }, [hid]);
  const reloadNotifications = useCallback(async () => {
    setNotifications(await fetchNotifications(hid));
  }, [hid]);

  // Recarga silenciosa de todo (sin spinner): para refresco en vivo.
  const reloadAll = useCallback(async () => {
    try {
      const [e, b, r, s, n] = await Promise.all([
        fetchExpenses(hid),
        fetchRecurringBills(hid),
        fetchRotations(hid),
        fetchSlots(hid),
        fetchNotifications(hid)
      ]);
      setExpenses(e);
      setRecurringBills(b);
      setRotations(r);
      setSlots(s);
      setNotifications(n);
    } catch {
      /* error transitorio de red: lo intenta de nuevo en el próximo ciclo */
    }
  }, [hid]);

  useEffect(() => {
    let on = true;
    setLoading(true);
    setLoadError(false);
    Promise.all([
      fetchExpenses(hid),
      fetchRecurringBills(hid),
      fetchRotations(hid),
      fetchSlots(hid),
      fetchNotifications(hid)
    ])
      .then(([e, b, r, s, n]) => {
        if (!on) return;
        setExpenses(e);
        setRecurringBills(b);
        setRotations(r);
        setSlots(s);
        setNotifications(n);
      })
      .catch(() => {
        if (on) setLoadError(true);
      })
      .finally(() => {
        if (on) setLoading(false);
      });
    return () => {
      on = false;
    };
  }, [hid, loadAttempt]);

  // Actualización en vivo: refresca mientras la app está abierta (cada 12s)
  // y al instante cuando vuelves a la app (cambio de pestaña / volver al frente).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const tick = () => {
      if (document.visibilityState === "visible") void reloadAll();
    };
    const interval = window.setInterval(tick, 12_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void reloadAll();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [reloadAll]);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    setNotificationPermission(Notification.permission);
  }, []);

  // Auto-reparación del push: en Android/Chrome el canal caduca con el tiempo
  // y el teléfono deja de recibir avisos sin que nadie se entere. Al abrir la
  // app (con permiso ya concedido) verificamos el canal y lo renovamos si hace
  // falta, sin molestar al usuario.
  useEffect(() => {
    ensurePushSubscription(hid).catch(() => {
      /* sin conexión o sin permiso: se reintenta en la próxima apertura */
    });
  }, [hid]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(notificationStorageKey(hid, currentUserId));
      setSeenNotificationIds(new Set(raw ? (JSON.parse(raw) as string[]) : []));
    } catch {
      setSeenNotificationIds(new Set());
    }
  }, [currentUserId, hid]);

  const appData = useMemo<AppData>(() => {
    const byId = new Map(people.map((p) => [p.id, p]));
    return {
      people,
      currentUserId,
      getPerson: (id: string) => byId.get(id) ?? { ...PLACEHOLDER, id }
    };
  }, [people, currentUserId]);

  const currentUser = appData.getPerson(currentUserId);
  const activeExpense = expenses.find((expense) => expense.id === activeExpenseId);

  useEffect(() => {
    if (!loading && !loadError && activeExpenseId && !activeExpense) setActiveExpenseId(null);
  }, [activeExpense, activeExpenseId, loading, loadError, setActiveExpenseId]);

  const unreadNotificationIds = useMemo(() => {
    return new Set(
      notifications
        .filter((notification) => notification.status !== "resolved" && !seenNotificationIds.has(notification.id))
        .map((notification) => notification.id)
    );
  }, [notifications, seenNotificationIds]);

  const unreadNotificationCount = unreadNotificationIds.size;

  const rememberNotificationsSeen = useCallback(
    (ids: string[]) => {
      if (!ids.length || typeof window === "undefined") return;
      setSeenNotificationIds((current) => {
        const next = new Set(current);
        ids.forEach((id) => next.add(id));
        window.localStorage.setItem(notificationStorageKey(hid, currentUserId), JSON.stringify([...next].slice(-200)));
        return next;
      });
    },
    [currentUserId, hid]
  );

  function openMonthly() {
    setExpensesTab("monthly");
    setActiveView("expenses");
  }

  async function handleEnableNotifications(): Promise<PushRegistrationResult> {
    try {
      const result = await registerPushNotifications(hid, currentUserId);
      setNotificationPermission(result);
      if (result === "granted") void triggerPushDispatch();
      return result;
    } catch {
      setNotificationPermission("unsupported");
      return "unsupported";
    }
  }

  async function handleNotificationsClick() {
    if (notificationPermission !== "granted" && notificationPermission !== "denied") {
      await handleEnableNotifications();
    }
    await reloadNotifications().catch(() => {});
    setShowNotifications(true);
  }

  function handleMarkNotificationsSeen() {
    rememberNotificationsSeen([...unreadNotificationIds]);
    setShowNotifications(false);
  }

  function handleSelectNotification(notification: NotificationDelivery) {
    rememberNotificationsSeen([notification.id]);
    if (notification.kind === "expense_due" || notification.kind === "payment_confirmation") {
      setExpensesTab("expenses");
      setActiveView("expenses");
    } else if (notification.kind === "recurring_due") {
      setExpensesTab("monthly");
      setActiveView("expenses");
    } else if (notification.kind === "task_turn") {
      setActiveView("tasks");
    } else {
      setActiveView("calendar");
    }
    setShowNotifications(false);
  }

  // Acciones (lanzan error para que el formulario lo muestre)
  async function handleCreateExpense(input: NewExpenseInput) {
    await apiCreateExpense(hid, currentUserId, input);
    await reloadExpenses();
    await reloadNotifications().catch(() => {});
    void triggerPushDispatch();
  }
  async function handleUpdateExpense(id: string, input: NewExpenseInput) {
    await apiUpdateExpense(hid, id, input);
    await reloadExpenses();
    await reloadNotifications().catch(() => {});
    void triggerPushDispatch();
  }
  async function handleDeleteExpense(expense: Expense) {
    await apiDeleteExpense(expense);
    setActiveExpenseId(null);
    await reloadExpenses();
    await reloadNotifications().catch(() => {});
  }
  async function handleMarkPaid(
    expenseId: string,
    personId: string,
    method: PaymentMethod,
    proofFile: File | null
  ) {
    await markSharePaid(hid, expenseId, personId, method, proofFile);
    await reloadExpenses();
    await reloadNotifications().catch(() => {});
    void triggerPushDispatch();
  }
  async function handleCancelCashPayment(expenseId: string) {
    await apiCancelOwnCashPayment(expenseId);
    await reloadExpenses();
    await reloadNotifications().catch(() => {});
  }
  async function handlePayForEveryone(expense: Expense, method: PaymentMethod, proofFile: File | null) {
    await apiPayExpenseForEveryone(hid, expense.id, currentUserId, method, proofFile);
    setActiveExpenseId(null);
    await reloadExpenses();
    await reloadNotifications().catch(() => {});
    void triggerPushDispatch();
  }
  async function handleConfirm(expenseId: string, personId: string) {
    await setShareStatus(expenseId, personId, "confirmed");
    await reloadExpenses();
    await reloadNotifications().catch(() => {});
  }
  async function handleReject(expenseId: string, personId: string) {
    await setShareStatus(expenseId, personId, "rejected");
    await reloadExpenses();
    await reloadNotifications().catch(() => {});
    void triggerPushDispatch();
  }
  async function handleCreateRotation(input: NewRotationInput) {
    await apiCreateRotation(hid, input);
    await reloadRotations();
    await reloadNotifications().catch(() => {});
    void triggerPushDispatch();
  }
  async function handleUpdateRotation(id: string, input: NewRotationInput) {
    await apiUpdateRotation(id, input);
    await reloadRotations();
    await reloadNotifications().catch(() => {});
  }
  async function handleDeleteRotation(id: string) {
    await apiDeleteRotation(id);
    await reloadRotations();
    await reloadNotifications().catch(() => {});
  }
  async function handleCompleteRotation(rotation: Rotation) {
    await apiCompleteRotation(rotation.id);
    await reloadRotations();
    await reloadNotifications().catch(() => {});
    void triggerPushDispatch();
  }
  async function handleUndoRotation(rotation: Rotation) {
    await apiUndoRotation(rotation.id);
    await reloadRotations();
    await reloadNotifications().catch(() => {});
  }
  async function handleCreateSlot(input: NewSlotInput) {
    await apiCreateSlot(hid, currentUserId, input);
    await reloadSlots();
    await reloadNotifications().catch(() => {});
    void triggerPushDispatch();
  }
  async function handleUpdateSlot(id: string, input: NewSlotInput) {
    await apiUpdateSlot(id, input);
    await reloadSlots();
    await reloadNotifications().catch(() => {});
    void triggerPushDispatch();
  }
  async function handleDeleteSlot(id: string) {
    await apiDeleteSlot(id);
    await reloadSlots();
    await reloadNotifications().catch(() => {});
  }

  async function handleSettleWith(otherId: string, method: PaymentMethod, proofFile: File | null) {
    await apiSettleWith(hid, otherId, method, proofFile);
    await reloadExpenses();
    await reloadNotifications().catch(() => {});
  }

  async function handleUndoSettlement(settlementId: string) {
    await apiUndoSettlement(settlementId);
    await reloadExpenses();
    await reloadNotifications().catch(() => {});
  }

  // Pagos mensuales en conjunto (renta, etc.)
  async function handleCreateRecurringBill(input: NewRecurringBillInput) {
    await apiCreateRecurringBill(hid, currentUserId, input);
    await reloadRecurringBills();
    await reloadNotifications().catch(() => {});
    void triggerPushDispatch();
  }
  async function handleUpdateRecurringBill(billId: string, input: NewRecurringBillInput) {
    await apiUpdateRecurringBill(billId, input);
    await reloadRecurringBills();
    await reloadNotifications().catch(() => {});
    void triggerPushDispatch();
  }
  async function handleDeleteRecurringBill(bill: RecurringBill) {
    await apiDeleteRecurringBill(bill.id);
    await reloadRecurringBills();
    await reloadNotifications().catch(() => {});
  }
  async function handleMarkRecurringPaid(
    bill: RecurringBill,
    amount: number,
    method: PaymentMethod,
    proofFile: File | null
  ) {
    await apiMarkRecurringPaid(hid, bill.id, currentUserId, firstUnpaidPeriod(bill, currentUserId), amount, method, proofFile);
    await reloadRecurringBills();
    await reloadNotifications().catch(() => {});
    void triggerPushDispatch();
  }
  async function handleUnmarkRecurringPaid(bill: RecurringBill) {
    const period = lastPaidPeriod(bill, currentUserId);
    if (!period) return;
    await apiUnmarkRecurringPaid(bill.id, currentUserId, period);
    await reloadRecurringBills();
    await reloadNotifications().catch(() => {});
  }

  return (
    <AppDataContext.Provider value={appData}>
      <main className="app-shell">
        <AppNav activeView={activeView} setActiveView={setActiveView} />
        <div className="app-main">
          <TopBar
            currentUser={currentUser}
            household={household}
            notificationPermission={notificationPermission}
            onNotificationsClick={handleNotificationsClick}
            onProfileClick={() => setShowProfile(true)}
            unreadCount={unreadNotificationCount}
          />

          {loading ? (
            <div className="empty-state loading-state">
              <span className="loading-mark small">
                <RotateCw size={22} />
              </span>
              <strong>Cargando tu casa…</strong>
            </div>
          ) : loadError ? (
            <div className="empty-state">
              <Database size={28} />
              <strong>No se pudo cargar</strong>
              <span>Revisa tu conexión e inténtalo otra vez.</span>
              <button className="secondary-action" onClick={() => setLoadAttempt((attempt) => attempt + 1)} type="button">
                <RotateCw size={18} />
                Reintentar
              </button>
            </div>
          ) : (
            <>
              {activeView === "home" ? (
                <HomeView
                  currentUser={currentUser}
                  expenses={expenses}
                  rotations={rotations}
                  recurringBills={recurringBills}
                  slots={slots}
                  onNewExpense={() => setAddingExpense(true)}
                  onOpenExpense={setActiveExpenseId}
                  onOpenExpenses={() => {
                    setExpensesTab("expenses");
                    setActiveView("expenses");
                  }}
                  onOpenMonthly={openMonthly}
                  onOpenTurns={() => setActiveView("tasks")}
                  onOpenAgenda={() => setActiveView("calendar")}
                />
              ) : null}

              {activeView === "expenses" ? (
                <ExpensesView
                  expenses={expenses}
                  recurringBills={recurringBills}
                  tab={expensesTab}
                  setTab={setExpensesTab}
                  onAddExpense={() => setAddingExpense(true)}
                  onOpenBalance={setBalancePerson}
                  onCreateBill={handleCreateRecurringBill}
                  onEditBill={handleUpdateRecurringBill}
                  onDeleteBill={handleDeleteRecurringBill}
                  onMarkBillPaid={handleMarkRecurringPaid}
                  onUnmarkBill={handleUnmarkRecurringPaid}
                  setActiveExpenseId={setActiveExpenseId}
                />
              ) : null}

              {activeView === "tasks" ? (
                <TasksView
                  rotations={rotations}
                  onComplete={handleCompleteRotation}
                  onUndo={handleUndoRotation}
                  onCreate={handleCreateRotation}
                  onUpdate={handleUpdateRotation}
                  onDelete={handleDeleteRotation}
                />
              ) : null}

              {activeView === "calendar" ? (
                <AgendaView
                  bills={recurringBills}
                  currentUser={currentUser}
                  rotations={rotations}
                  slots={slots}
                  onCreate={handleCreateSlot}
                  onUpdate={handleUpdateSlot}
                  onDelete={handleDeleteSlot}
                  onOpenMonthly={openMonthly}
                  onOpenTurns={() => setActiveView("tasks")}
                />
              ) : null}

              {activeView === "people" ? (
                <PeopleView household={household} rotations={rotations} />
              ) : null}
            </>
          )}
        </div>

        {activeExpense ? (
          <ExpenseDetail
            currentUser={currentUser}
            expense={activeExpense}
            onClose={() => setActiveExpenseId(null)}
            onConfirm={handleConfirm}
            onCancelCashPayment={handleCancelCashPayment}
            onMarkPaid={handleMarkPaid}
            onPayForEveryone={handlePayForEveryone}
            onReject={handleReject}
            onDelete={handleDeleteExpense}
            onEdit={(expense) => {
              setActiveExpenseId(null);
              setEditingExpense(expense);
            }}
          />
        ) : null}

        {addingExpense ? (
          <ExpenseForm
            currentUser={currentUser}
            onClose={() => setAddingExpense(false)}
            onSubmit={handleCreateExpense}
          />
        ) : null}

        {editingExpense ? (
          <ExpenseForm
            currentUser={currentUser}
            initial={editingExpense}
            onClose={() => setEditingExpense(null)}
            onSubmit={(input) => handleUpdateExpense(editingExpense.id, input)}
          />
        ) : null}

        {showHelp ? <HelpSheet household={household} onClose={() => setShowHelp(false)} /> : null}
        {showProfile ? (
          <ProfileSheet
            currentUser={currentUser}
            household={household}
            notificationPermission={notificationPermission}
            onEnableNotifications={handleEnableNotifications}
            onHelp={() => {
              setShowProfile(false);
              setShowHelp(true);
            }}
            onHistory={() => {
              setShowProfile(false);
              setShowHistory(true);
            }}
            onSignOut={onSignOut}
            onClose={() => setShowProfile(false)}
          />
        ) : null}
        {showNotifications ? (
          <NotificationsSheet
            notifications={notifications}
            onClose={() => setShowNotifications(false)}
            onMarkSeen={handleMarkNotificationsSeen}
            onSelect={handleSelectNotification}
            unreadIds={unreadNotificationIds}
          />
        ) : null}
        {balancePerson ? (
          <BalanceSheet
            expenses={expenses}
            onClose={() => setBalancePerson(null)}
            onSettle={handleSettleWith}
            person={balancePerson}
          />
        ) : null}
        {showHistory ? (
          <HistorySheet
            householdId={hid}
            onClose={() => setShowHistory(false)}
            onUndoSettlement={handleUndoSettlement}
          />
        ) : null}
      </main>
    </AppDataContext.Provider>
  );
}

