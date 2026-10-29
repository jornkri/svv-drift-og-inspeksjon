import { describe, expect, it } from "vitest";
import { formatDistance, formatHeight, formatScale, formatUtm, groupDigits } from "../../src/map/coords.ts";

describe("koordinatformat", () => {
  it("viser UTM33 som N/Ø med tusenskille", () => {
    expect(formatUtm(835472.4, 7744215.2)).toBe("N 7 744 215 · Ø 835 472");
  });
  it("grupperer siffer", () => {
    expect(groupDigits(999)).toBe("999");
    expect(groupDigits(1000)).toBe("1 000");
    expect(groupDigits(-12345)).toBe("−12 345");
  });
  it("viser NN2000-høyde med én desimal og komma", () => {
    expect(formatHeight(106.43)).toBe("NN2000 106,4 m");
    expect(formatHeight(null)).toBe("NN2000 –");
  });
  it("viser avstand og målestokk", () => {
    expect(formatDistance(4.2)).toBe("4 m");
    expect(formatDistance(1234)).toBe("1,2 km");
    expect(formatScale(6000)).toBe("1:6 000");
  });
});
