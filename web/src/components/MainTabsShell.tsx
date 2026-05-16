"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Tab = "today" | "habits";

const tabs: Array<{ id: Tab; label: string; href: string }> = [
  { id: "today", label: "Today", href: "/" },
  { id: "habits", label: "Habits", href: "/habits" },
];

const swipeOrder: Tab[] = ["today", "habits"];
const SWIPE_THRESHOLD = 56;
const EDGE_RESISTANCE = 0.28;

function tabFromPath(pathname: string): Tab {
  return pathname === "/habits" ? "habits" : "today";
}

function blockedSwipeTarget(target: EventTarget | null): boolean {
  return target instanceof Element
    ? Boolean(target.closest("a, input, textarea, select, label, [data-swipe-ignore]"))
    : false;
}

function clampDrag(activeTab: Tab, deltaX: number): number {
  const index = swipeOrder.indexOf(activeTab);
  const atFirst = index === 0;
  const atLast = index === swipeOrder.length - 1;
  if ((atFirst && deltaX > 0) || (atLast && deltaX < 0)) {
    return deltaX * EDGE_RESISTANCE;
  }
  return deltaX;
}

export function MainTabsShell({
  initialTab,
  today,
  habits,
}: {
  initialTab: Tab;
  today: React.ReactNode;
  habits: React.ReactNode;
}) {
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const trackingRef = useRef(false);
  const swipingRef = useRef(false);
  const inputModeRef = useRef<"pointer" | "touch" | null>(null);
  const lastSwipeAtRef = useRef(0);
  const scrollPositionsRef = useRef<Record<Tab, number>>({
    today: 0,
    habits: 0,
  });
  const activeTabRef = useRef<Tab>(initialTab);
  const [activeTab, setActiveTab] = useState(initialTab);
  const [dragX, setDragX] = useState(0);
  const [swiping, setSwiping] = useState(false);

  const restoreScroll = useCallback((tab: Tab) => {
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: scrollPositionsRef.current[tab] ?? 0, left: 0 });
    });
  }, []);

  const switchTab = useCallback((
    tab: Tab,
    options: { pushHistory: boolean } = { pushHistory: true }
  ) => {
    const current = activeTabRef.current;
    if (tab === current) return;

    scrollPositionsRef.current[current] = window.scrollY;
    activeTabRef.current = tab;
    setActiveTab(tab);
    setDragX(0);

    const href = tabs.find((t) => t.id === tab)!.href;
    if (options.pushHistory && window.location.pathname !== href) {
      window.history.pushState(null, "", href);
    }

    restoreScroll(tab);
  }, [restoreScroll]);

  useEffect(() => {
    const onPopState = () => {
      const nextTab = tabFromPath(window.location.pathname);
      switchTab(nextTab, { pushHistory: false });
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [switchTab]);

  function beginGesture(
    x: number,
    y: number,
    target: EventTarget | null,
    mode: "pointer" | "touch"
  ) {
    if (blockedSwipeTarget(target)) return;
    inputModeRef.current = mode;
    startRef.current = { x, y };
    trackingRef.current = true;
    swipingRef.current = false;
    setSwiping(false);
  }

  function cancelGesture() {
    startRef.current = null;
    trackingRef.current = false;
    swipingRef.current = false;
    inputModeRef.current = null;
    setSwiping(false);
    setDragX(0);
  }

  function moveGesture(x: number, y: number) {
    if (!trackingRef.current || !startRef.current) return;
    const deltaX = x - startRef.current.x;
    const deltaY = y - startRef.current.y;
    if (!swipingRef.current && Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 10) {
      cancelGesture();
      return;
    }
    if (Math.abs(deltaX) > 10) {
      swipingRef.current = true;
      setSwiping(true);
      setDragX(clampDrag(activeTabRef.current, deltaX));
    }
  }

  function finishSwipe(deltaX: number) {
    const index = swipeOrder.indexOf(activeTabRef.current);
    if (deltaX < -SWIPE_THRESHOLD && index < swipeOrder.length - 1) {
      switchTab(swipeOrder[index + 1]);
      return;
    }
    if (deltaX > SWIPE_THRESHOLD && index > 0) {
      switchTab(swipeOrder[index - 1]);
      return;
    }
    setDragX(0);
  }

  function endGesture(x: number) {
    if (!trackingRef.current || !startRef.current) return;
    const deltaX = x - startRef.current.x;
    const wasSwiping = swipingRef.current;
    startRef.current = null;
    trackingRef.current = false;
    swipingRef.current = false;
    inputModeRef.current = null;
    setSwiping(false);
    if (wasSwiping && Math.abs(deltaX) > 18) {
      lastSwipeAtRef.current = Date.now();
    }
    finishSwipe(deltaX);
  }

  const activeIndex = swipeOrder.indexOf(activeTab);
  const isRestingOnToday = activeTab === "today" && dragX === 0 && !swiping;
  const trackTransform = isRestingOnToday
    ? undefined
    : `translate3d(calc(${-activeIndex * 100}% + ${dragX}px), 0, 0)`;
  const paneClass = (tab: Tab) =>
    [
      "w-full min-w-full shrink-0 basis-full",
      swiping || activeTab === tab
        ? "min-h-screen"
        : "h-0 min-h-0 overflow-hidden pointer-events-none",
    ].join(" ");

  return (
    <div
      className="min-h-screen overflow-x-clip bg-zinc-50 touch-pan-y"
      onClickCapture={(event) => {
        if (Date.now() - lastSwipeAtRef.current < 450) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onPointerDown={(event) => {
        if (event.pointerType === "mouse" || inputModeRef.current === "touch") return;
        event.currentTarget.setPointerCapture(event.pointerId);
        beginGesture(event.clientX, event.clientY, event.target, "pointer");
      }}
      onPointerMove={(event) => {
        if (inputModeRef.current !== "pointer") return;
        moveGesture(event.clientX, event.clientY);
      }}
      onPointerUp={(event) => {
        if (inputModeRef.current !== "pointer") return;
        endGesture(event.clientX);
      }}
      onPointerCancel={cancelGesture}
      onTouchStart={(event) => {
        if (inputModeRef.current) return;
        const touch = event.touches[0];
        if (!touch) return;
        beginGesture(touch.clientX, touch.clientY, event.target, "touch");
      }}
      onTouchMove={(event) => {
        if (inputModeRef.current !== "touch") return;
        const touch = event.touches[0];
        if (!touch) return;
        moveGesture(touch.clientX, touch.clientY);
      }}
      onTouchEnd={(event) => {
        if (inputModeRef.current !== "touch") return;
        const touch = event.changedTouches[0];
        if (!touch) return;
        endGesture(touch.clientX);
      }}
      onTouchCancel={cancelGesture}
    >
      <div
        className={[
          "flex min-h-screen w-full",
          trackTransform ? "will-change-transform" : "",
          swiping ? "" : "transition-transform duration-200 ease-out",
        ].join(" ")}
        style={trackTransform ? { transform: trackTransform } : undefined}
      >
        <section className={paneClass("today")} aria-hidden={activeTab !== "today"}>
          {today}
        </section>
        <section className={paneClass("habits")} aria-hidden={activeTab !== "habits"}>
          {habits}
        </section>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-20 border-t border-zinc-200 bg-white/95 p-2 backdrop-blur flex gap-2 justify-center">
        {tabs.map((tab) => {
          const active = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => switchTab(tab.id)}
              data-swipe-ignore
              className={[
                "min-h-[44px] rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-zinc-900 text-white"
                  : "text-zinc-600 hover:bg-zinc-100 active:bg-zinc-200",
              ].join(" ")}
              aria-current={active ? "page" : undefined}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
