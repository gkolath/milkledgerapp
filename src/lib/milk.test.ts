import { describe, expect, it } from "vitest";
import { computeBill, missedDates, upiLink } from "./milk";

const h = { seller_name: "Raju", upi_id: "raju@okaxis", rate_one: 70, rate_half: 35 };

describe("milk bill", () => {
  it("uses the rate saved with a day, else the current rate", () => {
    const b = computeBill({ one: { 1: "y", 2: "y", 3: "n" }, half: { 1: "y" } }, { one: { 1: 60 }, half: {} }, h, []);
    expect(b.one).toEqual({ days: 2, amount: 130 });
    expect(b.half).toEqual({ days: 1, amount: 35 });
    expect(b.total).toBe(165);
    expect(b.litres).toBe(2.5);
  });
  it("never shows a negative amount due", () => {
    const b = computeBill({ one: { 1: "y" }, half: {} }, { one: {}, half: {} }, h, [{ amount: 100 }]);
    expect(b.due).toBe(0);
  });
  it("counts a day as missed only when no milk came at all", () => {
    expect(missedDates({ one: { 1: "n", 2: "n" }, half: { 2: "y" } })).toEqual([1]);
  });
  it("builds a UPI link with the amount in rupees", () => {
    expect(upiLink(h, 140, 2026, 10)).toContain("am=140.00");
  });
});
