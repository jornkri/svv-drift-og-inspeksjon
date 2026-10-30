import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Fotovedlegg } from "../../src/data/DataService.ts";
import type { Inspeksjon } from "../../src/data/schema.ts";
import { OfflineQueue } from "../../src/field/offline-queue.ts";
import { InspectionSync } from "../../src/field/sync.ts";

let n = 0;
const queues: OfflineQueue[] = [];
const newQueue = () => {
  const q = new OfflineQueue(`test-${++n}`);
  queues.push(q);
  return q;
};
afterEach(async () => {
  await Promise.all(queues.splice(0).map((q) => q.close()));
});

const insp = (id: string) => ({ objekt_globalid: id, tilstandsgrad: 1, tidspunkt: "2026-10-29T10:00:00Z" }) as Inspeksjon;
const bilde = (): Fotovedlegg => ({
  id: "b1",
  blob: new Blob(["jpeg"], { type: "image/jpeg" }),
  navn: "innlop.jpg",
  x: 816990,
  y: 7764320,
  retning: 135,
  noyaktighet_m: 3,
  tidspunkt: "2026-10-29T10:00:00Z",
});

describe("frakoblet kø (IndexedDB)", () => {
  it("lagrer, lister i rekkefølge og fjerner", async () => {
    const q = newQueue();
    // Samme millisekund og id-er i omvendt rekkefølge: rekkefølgen skal likevel bevares
    await q.enqueue(insp("A"), [bilde()], "2");
    await q.enqueue(insp("B"), [], "1");
    expect(await q.count()).toBe(2);
    const items = await q.list();
    expect(items.map((i) => i.inspeksjon.objekt_globalid)).toEqual(["A", "B"]);
    expect(items[0]!.bilder[0]!.retning).toBe(135);
    await q.remove("2");
    expect(await q.count()).toBe(1);
  });

  it("teller mislykkede forsøk", async () => {
    const q = newQueue();
    await q.enqueue(insp("A"), [], "1");
    await q.markFailed("1", "502");
    await q.markFailed("1", "503");
    const [el] = await q.list();
    expect(el).toMatchObject({ forsok: 2, sisteFeil: "503" });
  });

  it("lagrer og henter utkast", async () => {
    const q = newQueue();
    await q.saveDraft({ id: "{SR3}", kommentar: "Utkast" } as never);
    expect((await q.getDraft("{SR3}"))?.kommentar).toBe("Utkast");
    await q.deleteDraft("{SR3}");
    expect(await q.getDraft("{SR3}")).toBeUndefined();
  });
});

describe("synkronisering", () => {
  it("sender direkte når enheten er på nett", async () => {
    const q = newQueue();
    const submit = vi.fn().mockResolvedValue({ globalid: "{X}", vedleggFeilet: 0 });
    const s = new InspectionSync({ queue: q, submit, isOnline: () => true });
    const r = await s.submitOrQueue(insp("A"), []);
    expect(r.status).toBe("sendt");
    expect(await q.count()).toBe(0);
  });

  it("legger i kø når enheten er frakoblet, og sender når den kommer på nett", async () => {
    const q = newQueue();
    let online = false;
    const counts: number[] = [];
    const submit = vi.fn().mockResolvedValue({ globalid: "{X}", vedleggFeilet: 0 });
    const s = new InspectionSync({ queue: q, submit, isOnline: () => online, onChange: (c) => counts.push(c) });
    expect((await s.submitOrQueue(insp("A"), [bilde()])).status).toBe("i-ko");
    expect(await s.submitOrQueue(insp("B"), [])).toEqual({ status: "i-ko", grunn: "Enheten er frakoblet" });
    expect(submit).not.toHaveBeenCalled();
    expect(await s.flush()).toEqual({ sendt: 0, feilet: 0 });

    online = true;
    expect(await s.flush()).toEqual({ sendt: 2, feilet: 0 });
    expect(submit.mock.calls.map((c) => (c[0] as Inspeksjon).objekt_globalid)).toEqual(["A", "B"]);
    expect((submit.mock.calls[0]![1] as Fotovedlegg[])[0]!.navn).toBe("innlop.jpg");
    expect(await q.count()).toBe(0);
    expect(counts.at(-1)).toBe(0);
  });

  it("legger i kø når innsending feiler, og stopper ved første feil i flush", async () => {
    const q = newQueue();
    const submit = vi.fn().mockRejectedValueOnce(new Error("Nettverksfeil"));
    const s = new InspectionSync({ queue: q, submit, isOnline: () => true });
    const r = await s.submitOrQueue(insp("A"), []);
    expect(r).toEqual({ status: "i-ko", grunn: "Innsending feilet (Nettverksfeil)" });
    await q.enqueue(insp("B"), []);
    submit.mockRejectedValueOnce(new Error("503"));
    expect(await s.flush()).toEqual({ sendt: 0, feilet: 1 });
    expect(await q.count()).toBe(2);
  });

  it("en post tjenesten avviser, blokkerer ikke resten av køen", async () => {
    const q = newQueue();
    const submit = vi.fn().mockRejectedValueOnce(new Error("Feltet kommentar er for langt")).mockResolvedValue({ globalid: "x", vedleggFeilet: 0 });
    const s = new InspectionSync({ queue: q, submit, isOnline: () => true });
    await q.enqueue(insp("A"), []);
    await q.enqueue(insp("B"), []);
    expect(await s.flush()).toEqual({ sendt: 1, feilet: 1 });
    const igjen = await q.list();
    expect(igjen.map((e) => e.sisteFeil)).toEqual(["Feltet kommentar er for langt"]);
  });
});
