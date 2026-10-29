import { describe, expect, it } from "vitest";
import { nvdbGlobalid, nvdbTilObjekt, parseNvdbGlobalid } from "../../src/nvdb/objekt.ts";
import { driftskrav } from "../../src/handbok/r610.ts";

describe("NVDB-objekter som inspeksjonsobjekter", () => {
  it("lager og tolker globalid", () => {
    expect(nvdbGlobalid(79, 92835018)).toBe("nvdb:79:92835018");
    expect(parseNvdbGlobalid("nvdb:79:92835018")).toEqual({ typeId: 79, id: 92835018 });
    expect(parseNvdbGlobalid("{ABC-123}")).toBeNull();
  });

  it("oversetter stikkrenne til appobjekt med kote, lengde og håndboktype", () => {
    const o = nvdbTilObjekt({
      id: 92835018,
      metadata: { type: { id: 79, navn: "Stikkrenne/Kulvert" }, versjon: 3, startdato: "2021-07-20", sist_modifisert: "2025-11-22T10:36:09Z" },
      geometri: { wkt: "LINESTRING Z (1 2 209.27,3 4 210.03)", lengde: 14.44 },
      lokasjon: { vegsystemreferanser: [{ kortform: "EV45 S3D1 m2728" }] },
    });
    expect(o).toMatchObject({
      globalid: "nvdb:79:92835018",
      objekt_id: "NVDB-92835018",
      fag: "VA",
      objekttype: "Stikkrenne",
      kote_min: 209.27,
      kote_max: 210.03,
      lengde_m: 14.44,
      vegreferanse: "EV45 S3D1 m2728",
      mmi: null,
    });
    expect(driftskrav(o)?.intervallMnd).toBe(60);
  });

  it("legger kontekstobjekter under Veg og bruker typenavnet når håndboktype mangler", () => {
    const o = nvdbTilObjekt({ id: 1, metadata: { type: { id: 60, navn: "Bru" } }, geometri: { wkt: "POINT (1 2)" } });
    expect(o.fag).toBe("Veg");
    expect(o.objekttype).toBe("Bru");
    expect(o.kote_min).toBeNull();
  });
});
