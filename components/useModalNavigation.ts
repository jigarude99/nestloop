"use client";

import { useEffect, useRef } from "react";

type Layer = { id: string; close: () => void };
const stateKey = "nestloopModal";
const layers: Layer[] = [];
const retired = new Set<string>();
let listening = false;
let keyboardOpen = false;
let keyboardDismissedAt = 0;
let focusedField: HTMLElement | null = null;
let fieldDismissed = false;
let fullHeight = 0;

function editable(element: Element | null): element is HTMLElement {
  return element instanceof HTMLElement && element.matches(
    'textarea, [contenteditable="true"], input:not([type="file"]):not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="range"])'
  );
}

function updateViewport() {
  const height = window.visualViewport?.height ?? window.innerHeight;
  fullHeight = Math.max(fullHeight, height);
  const wasOpen = keyboardOpen;
  keyboardOpen = (window.visualViewport?.scale ?? 1) === 1 && fullHeight - height > 120;
  if (wasOpen && !keyboardOpen) {
    keyboardDismissedAt = Date.now();
    fieldDismissed = true;
  }
}

/** Consume keyboard dismissal before any navigation or outside-tap dismissal. */
export function dismissModalKeyboard(): boolean {
  const field = editable(document.activeElement) ? document.activeElement : null;
  if (keyboardOpen || (field && !fieldDismissed)) {
    field?.blur();
    focusedField = null;
    fieldDismissed = true;
    keyboardOpen = false;
    keyboardDismissedAt = Date.now();
    return true;
  }
  return Date.now() - keyboardDismissedAt < 350;
}

function historyState(id: string | null) {
  return { ...window.history.state, [stateKey]: id };
}

function onPopState(event: PopStateEvent) {
  const targetId = event.state?.[stateKey] as string | undefined;
  const top = layers[layers.length - 1];
  if (!top) {
    if (targetId && retired.has(targetId)) window.history.back();
    return;
  }
  if (targetId === top.id) return;
  if (dismissModalKeyboard()) {
    window.history.pushState(historyState(top.id), "");
    keyboardDismissedAt = 0;
    return;
  }

  const targetIndex = layers.findIndex((layer) => layer.id === targetId);
  const removed = layers.splice(targetIndex + 1);
  for (const layer of removed.reverse()) {
    retired.add(layer.id);
    layer.close();
  }
  if (targetId && retired.has(targetId)) window.history.back();
}

function startListening() {
  if (listening) return;
  listening = true;
  fullHeight = Math.max(window.innerHeight, window.visualViewport?.height ?? 0);
  window.addEventListener("popstate", onPopState);
  window.visualViewport?.addEventListener("resize", updateViewport);
  window.addEventListener("orientationchange", () => {
    fullHeight = window.visualViewport?.height ?? window.innerHeight;
    keyboardOpen = false;
  });
  document.addEventListener("focusin", (event) => {
    if (!editable(event.target as Element)) return;
    const field = event.target as HTMLElement;
    if (field !== focusedField) fieldDismissed = false;
    focusedField = field;
  });
  document.addEventListener("focusout", () => {
    if (keyboardOpen) keyboardDismissedAt = Date.now();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !layers.length) return;
    event.preventDefault();
    if (!dismissModalKeyboard()) layers[layers.length - 1].close();
  });
}

export function useModalNavigation(onClose?: () => void) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const canClose = !!onClose;

  useEffect(() => {
    if (!canClose) return;
    startListening();
    const layer: Layer = { id: crypto.randomUUID(), close: () => closeRef.current?.() };
    const currentId = window.history.state?.[stateKey];
    // A reload restores the sheet from app state, so stale runtime IDs must be replaced.
    if (!layers.length && currentId && !retired.has(currentId)) {
      window.history.replaceState(historyState(null), "");
    }
    layers.push(layer);
    if (currentId && retired.has(currentId)) {
      window.history.replaceState(historyState(layer.id), "");
    } else {
      window.history.pushState(historyState(layer.id), "");
    }

    return () => {
      const index = layers.indexOf(layer);
      if (index >= 0) layers.splice(index, 1);
      retired.add(layer.id);
      // Allow a replacement sheet to claim this entry before unwinding a closed sheet.
      window.setTimeout(() => {
        if (window.history.state?.[stateKey] === layer.id) window.history.back();
      }, 0);
    };
  }, [canClose]);
}
