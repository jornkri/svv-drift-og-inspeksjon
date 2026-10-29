import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Fotovedlegg } from "../data/DataService.ts";
import type { Inspeksjon } from "../data/schema.ts";
import type { InspeksjonUtkast } from "./prefill.ts";

/** En inspeksjon som venter på å bli sendt (enheten var frakoblet eller innsending feilet). */
export interface KoElement {
  id: string;
  inspeksjon: Inspeksjon;
  bilder: Fotovedlegg[];
  opprettet: string;
  /** Monotont økende, slik at elementer lagt inn i samme millisekund beholder rekkefølgen */
  rekkefolge: number;
  forsok: number;
  sisteFeil: string | null;
}

interface Schema extends DBSchema {
  ko: { key: string; value: KoElement; indexes: { opprettet: string } };
  utkast: { key: string; value: InspeksjonUtkast };
}

export const DB_NAME = "svv-drift-og-inspeksjon";

let sist = 0;
function nesteRekkefolge(): number {
  sist = Math.max(sist + 1, Date.now() * 1000);
  return sist;
}

/** Kø og utkast i IndexedDB. Blob-er (bilder) lagres direkte. */
export class OfflineQueue {
  private db: Promise<IDBPDatabase<Schema>>;

  constructor(name = DB_NAME) {
    this.db = openDB<Schema>(name, 1, {
      upgrade(db) {
        const ko = db.createObjectStore("ko", { keyPath: "id" });
        ko.createIndex("opprettet", "opprettet");
        db.createObjectStore("utkast", { keyPath: "id" });
      },
    });
  }

  async enqueue(inspeksjon: Inspeksjon, bilder: Fotovedlegg[], id: string = crypto.randomUUID()): Promise<KoElement> {
    const el: KoElement = { id, inspeksjon, bilder, opprettet: new Date().toISOString(), rekkefolge: nesteRekkefolge(), forsok: 0, sisteFeil: null };
    await (await this.db).put("ko", el);
    return el;
  }

  /** Eldste først. */
  async list(): Promise<KoElement[]> {
    const all = await (await this.db).getAll("ko");
    return all.sort((a, b) => (a.rekkefolge ?? 0) - (b.rekkefolge ?? 0));
  }

  async count(): Promise<number> {
    return (await this.db).count("ko");
  }

  async remove(id: string): Promise<void> {
    await (await this.db).delete("ko", id);
  }

  async markFailed(id: string, feil: string): Promise<void> {
    const db = await this.db;
    const el = await db.get("ko", id);
    if (el) await db.put("ko", { ...el, forsok: el.forsok + 1, sisteFeil: feil });
  }

  async saveDraft(u: InspeksjonUtkast): Promise<void> {
    await (await this.db).put("utkast", { ...u, endret: new Date().toISOString() });
  }

  async getDraft(id: string): Promise<InspeksjonUtkast | undefined> {
    return (await this.db).get("utkast", id);
  }

  async listDrafts(): Promise<InspeksjonUtkast[]> {
    return (await this.db).getAll("utkast");
  }

  async deleteDraft(id: string): Promise<void> {
    await (await this.db).delete("utkast", id);
  }

  async close(): Promise<void> {
    (await this.db).close();
  }
}
