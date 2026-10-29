import { services } from "../services.ts";
import { store } from "../state/store.ts";
import { dataChanged } from "../tasks/task-store.ts";
import { OfflineQueue } from "./offline-queue.ts";
import { InspectionSync } from "./sync.ts";

let queue: OfflineQueue | null = null;
let sync: InspectionSync | null = null;

export const isOnline = () => navigator.onLine && !store.get().simFrakoblet;

/** Starter frakoblet kø: teller, automatisk synkronisering ved tilkobling og hvert 30. sekund. */
export function startSync(): void {
  if (sync) return;
  queue = new OfflineQueue();
  sync = new InspectionSync({
    queue,
    submit: (i, b) => services().data.submitInspection(i, b),
    isOnline,
    onChange: (koAntall) => store.set({ koAntall }),
    onSent: (el) => {
      store.notify(`Inspeksjon av ${el.inspeksjon.obj_navn} er sendt`, "suksess");
      dataChanged();
    },
  });
  const update = () => {
    store.set({ online: isOnline() });
    if (isOnline()) void sync!.flush();
  };
  window.addEventListener("online", update);
  window.addEventListener("offline", update);
  store.select((s) => s.simFrakoblet, update);
  setInterval(() => {
    if (isOnline() && store.get().koAntall > 0) void sync!.flush();
  }, 30_000);
  void sync.notify();
  update();
}

export function inspectionSync(): InspectionSync {
  if (!sync) startSync();
  return sync!;
}

export function offlineQueue(): OfflineQueue {
  if (!queue) startSync();
  return queue!;
}
