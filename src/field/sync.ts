import type { Fotovedlegg, InnsendingResultat } from "../data/DataService.ts";
import type { Inspeksjon } from "../data/schema.ts";
import type { KoElement, OfflineQueue } from "./offline-queue.ts";

export interface SyncOptions {
  queue: Pick<OfflineQueue, "enqueue" | "list" | "remove" | "markFailed" | "count">;
  submit: (i: Inspeksjon, bilder: Fotovedlegg[]) => Promise<InnsendingResultat>;
  isOnline: () => boolean;
  onChange?: (koAntall: number) => void;
  onSent?: (el: KoElement) => void;
}

export type InnsendingStatus = { status: "sendt"; resultat: InnsendingResultat } | { status: "i-ko"; grunn: string };

/**
 * Sender inspeksjoner, eller legger dem i kø når enheten er frakoblet eller innsendingen feiler.
 * Køen tømmes automatisk når enheten kommer på nett igjen.
 */
export class InspectionSync {
  private flushing: Promise<{ sendt: number; feilet: number }> | null = null;

  constructor(private readonly o: SyncOptions) {}

  async submitOrQueue(i: Inspeksjon, bilder: Fotovedlegg[]): Promise<InnsendingStatus> {
    if (this.o.isOnline()) {
      try {
        const resultat = await this.o.submit(i, bilder);
        return { status: "sendt", resultat };
      } catch (e) {
        await this.o.queue.enqueue(i, bilder);
        await this.notify();
        return { status: "i-ko", grunn: `Innsending feilet (${e instanceof Error ? e.message : String(e)})` };
      }
    }
    await this.o.queue.enqueue(i, bilder);
    await this.notify();
    return { status: "i-ko", grunn: "Enheten er frakoblet" };
  }

  /** Sender alt i køen (eldste først). Stopper ved første feil for å bevare rekkefølgen. */
  flush(): Promise<{ sendt: number; feilet: number }> {
    if (this.flushing) return this.flushing;
    const run = async () => {
      let sendt = 0;
      let feilet = 0;
      if (!this.o.isOnline()) return { sendt, feilet };
      for (const el of await this.o.queue.list()) {
        try {
          await this.o.submit(el.inspeksjon, el.bilder);
          await this.o.queue.remove(el.id);
          sendt++;
          this.o.onSent?.(el);
        } catch (e) {
          await this.o.queue.markFailed(el.id, e instanceof Error ? e.message : String(e));
          feilet++;
          break;
        }
      }
      return { sendt, feilet };
    };
    // Nullstilles først når løftet er ferdig (ikke synkront inne i run)
    const p = run().finally(async () => {
      this.flushing = null;
      await this.notify();
    });
    this.flushing = p;
    return p;
  }

  async notify(): Promise<void> {
    this.o.onChange?.(await this.o.queue.count());
  }
}
