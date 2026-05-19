// fallow-ignore-file unused-file
// @ts-nocheck

import {describe, expect, test} from "bun:test";
import {
  createRandomRoomName,
  createRandomUserName,
  resolveRoomName,
  resolveUserName,
} from "./random-names";

describe("random names", () => {
  test("creates valid room and user names", () => {
    expect(createRandomRoomName()).toMatch(/\S/);
    expect(createRandomRoomName().length).toBeLessThanOrEqual(60);
    expect(createRandomUserName()).toMatch(/\S/);
    expect(createRandomUserName().length).toBeLessThanOrEqual(40);
  });

  test("keeps provided names and fills blank names", () => {
    expect(resolveRoomName(" Friday Picks ")).toBe("Friday Picks");
    expect(resolveUserName(" Sam ")).toBe("Sam");
    expect(resolveRoomName("")).toMatch(/\S/);
    expect(resolveUserName("   ")).toMatch(/\S/);
  });
});
