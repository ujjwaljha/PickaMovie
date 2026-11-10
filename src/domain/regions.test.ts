import { describe, expect, it } from "vitest";
import { regionFromLocale, watchLine } from "./regions";

describe("watch regions", () => {
  it("uses the locale country when that country is listed", () => {
    expect(regionFromLocale("en-IN")).toBe("IN");
    expect(regionFromLocale("hi_IN")).toBe("IN");
    expect(regionFromLocale("en")).toBe("US");
    expect(regionFromLocale("fr-ZZ")).toBe("US");
  });

  it("says where a title can be streamed, rented, or bought", () => {
    expect(watchLine({ region: "IN", stream: ["Netflix", "JioHotstar"], rent: [], buy: [] })).toBe("Stream on Netflix, JioHotstar in India");
    expect(watchLine({ region: "US", stream: [], rent: ["Apple TV"], buy: ["Apple TV"] })).toBe("Rent on Apple TV · Buy on Apple TV in United States");
    expect(watchLine({ region: "GB", stream: [], rent: [], buy: [] })).toBe("No streaming listing in United Kingdom");
  });
});