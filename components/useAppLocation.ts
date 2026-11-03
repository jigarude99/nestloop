"use client";

import { useCallback, useEffect, useState } from "react";

export type AppView = "home" | "expenses" | "tasks" | "calendar" | "people";
export type ExpensesTab = "expenses" | "balances" | "monthly";
type AppLocation = { view: AppView; expensesTab: ExpensesTab; expenseId: string | null };

const views: AppView[] = ["home", "expenses", "tasks", "calendar", "people"];
const tabs: ExpensesTab[] = ["expenses", "balances", "monthly"];

function readLocation(key: string): AppLocation {
  const location: AppLocation = { view: "home", expensesTab: "expenses", expenseId: null };
  if (typeof window === "undefined") return location;
  try {
    const saved = JSON.parse(window.localStorage.getItem(key) ?? "null");
    if (saved && typeof saved === "object") {
      if (views.includes(saved.view)) location.view = saved.view;
      if (tabs.includes(saved.expensesTab)) location.expensesTab = saved.expensesTab;
      if (typeof saved.expenseId === "string") location.expenseId = saved.expenseId;
    }
  } catch {
    // Storage can be unavailable in private browsing.
  }

  const params = new URLSearchParams(window.location.search);
  const view = params.get("view") as AppView;
  const expenseId = params.get("expense");
  if (views.includes(view) || expenseId) {
    location.view = expenseId ? "expenses" : view;
    location.expensesTab = params.get("monthly") === "1" ? "monthly" : "expenses";
    location.expenseId = expenseId;
  }
  return location;
}

export function useAppLocation(householdId: string, userId: string) {
  const key = `nestloop:location:v1:${householdId}:${userId}`;
  const [location, setLocation] = useState(() => readLocation(key));

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(location));
    } catch {
      // Navigation still works when storage is full or blocked.
    }
  }, [key, location]);

  // A notification link is consumed once; subsequent launches resume the user's location.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("view") && !url.searchParams.has("expense")) return;
    ["view", "expense", "monthly"].forEach((name) => url.searchParams.delete(name));
    window.history.replaceState(window.history.state, "", url);
  }, []);

  const setActiveView = useCallback((view: AppView) => {
    setLocation((current) => ({ ...current, view }));
  }, []);
  const setExpensesTab = useCallback((expensesTab: ExpensesTab) => {
    setLocation((current) => ({ ...current, expensesTab }));
  }, []);
  const setActiveExpenseId = useCallback((expenseId: string | null) => {
    setLocation((current) => ({ ...current, expenseId }));
  }, []);

  return {
    activeView: location.view,
    expensesTab: location.expensesTab,
    activeExpenseId: location.expenseId,
    setActiveView,
    setExpensesTab,
    setActiveExpenseId
  };
}
