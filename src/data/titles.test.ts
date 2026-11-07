import { describe, expect, it } from "vitest";
import { PRESETS } from "./presets";
import { TITLE_BY_ID, TITLES } from "./titles";

describe("sample shelf", () => {
  it("keeps ids, scores, and runtimes comparable", () => {
    const ids = new Set<string>();
    for (const title of TITLES) {
      expect(ids.has(title.id)).toBe(false);
      ids.add(title.id);
      expect(title.name.length).toBeGreaterThan(0);
      expect(title.highlights).toHaveLength(2);
      expect(title.vibeTags.length).toBeGreaterThanOrEqual(3);
      expect(title.critic).toBeGreaterThanOrEqual(0);
      expect(title.critic).toBeLessThanOrEqual(100);
      expect(title.audience).toBeGreaterThanOrEqual(0);
      expect(title.audience).toBeLessThanOrEqual(100);
      expect(title.intensity).toBeGreaterThanOrEqual(1);
      expect(title.intensity).toBeLessThanOrEqual(10);
      expect(title.mark).toMatch(/^[A-Z0-9]{2}$/);
      expect(title.palette[0]).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(title.palette[1]).toMatch(/^#[0-9a-fA-F]{6}$/);
      for (const value of Object.values(title.fits)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      }
      if (title.episodeCount && title.episodeMinutes) {
        expect(title.runtimeMinutes).toBe(title.episodeCount * title.episodeMinutes);
      }
    }
    expect(TITLES.length).toBeGreaterThanOrEqual(36);
  });

  it("points every toss-up at real titles", () => {
    for (const preset of PRESETS) {
      expect(preset.titleIds.length).toBeGreaterThanOrEqual(2);
      expect(preset.titleIds.length).toBeLessThanOrEqual(4);
      for (const id of preset.titleIds) {
        expect(TITLE_BY_ID.get(id)?.id).toBe(id);
      }
    }
  });
});
