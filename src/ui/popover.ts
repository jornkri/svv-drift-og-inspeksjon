import type { Popover } from "../state/store.ts";
import { store } from "../state/store.ts";

/**
 * Felles oppførsel for nedtrekksbokser i kartet: Escape og klikk utenfor lukker,
 * og fokus flyttes inn ved åpning og tilbake til knappen ved lukking.
 */
export function installPopoverBehavior(): () => void {
  let lastTrigger: HTMLElement | null = null;

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && store.get().popover) {
      store.set({ popover: null });
      lastTrigger?.focus();
    }
  };
  const onClick = (e: MouseEvent) => {
    const t = e.target as HTMLElement;
    if (!store.get().popover) return;
    if (t.closest(".popwrap")) return;
    store.set({ popover: null });
  };
  document.addEventListener("keydown", onKey);
  document.addEventListener("click", onClick, true);
  const unsub = store.select(
    (s) => s.popover,
    (p) => {
      if (p) {
        lastTrigger = document.activeElement as HTMLElement | null;
        requestAnimationFrame(() => {
          const panel = document.querySelector<HTMLElement>(`[data-popover="${p}"]`);
          panel?.querySelector<HTMLElement>("input, button, select, a[href]")?.focus();
        });
      }
    },
  );
  return () => {
    document.removeEventListener("keydown", onKey);
    document.removeEventListener("click", onClick, true);
    unsub();
  };
}

export function togglePopover(p: Exclude<Popover, null>): void {
  store.set((s) => ({ popover: s.popover === p ? null : p }));
}
