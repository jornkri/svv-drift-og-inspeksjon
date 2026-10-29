import { describe, expect, it } from "vitest";
import { parseVegref, prettyVegref } from "../../src/map/search.ts";

describe("vegreferanse", () => {
  it.each([
    ["EV45 S1D1 m2340", "EV45S1D1m2340"],
    ["E45 S2D1 m10205", "EV45S2D1m10205"],
    ["ev45s1d1m2340", "EV45S1D1m2340"],
    ["FV100 S1D1", "FV100S1D1"],
    ["RV4", "RV4"],
  ])("tolker «%s»", (inn, ut) => {
    expect(parseVegref(inn)).toBe(ut);
  });

  it.each(["SR-003", "Elbyveien 12", "Stikkrennetrase-003", ""])("avviser «%s»", (inn) => {
    expect(parseVegref(inn)).toBeNull();
  });

  it("formaterer tilbake med mellomrom", () => {
    expect(prettyVegref("EV45S1D1m2340")).toBe("EV45 S1D1 m2340");
  });
});
