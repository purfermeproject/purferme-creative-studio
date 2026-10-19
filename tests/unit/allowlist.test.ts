import { afterEach, describe, expect, it, vi } from "vitest";
import { checkTeamPassword, isAllowedEmail, teamIdentity } from "@/lib/allowlist";

afterEach(() => vi.unstubAllEnvs());

describe("team password", () => {
  it("accepts only the exact password", () => {
    vi.stubEnv("TEAM_PASSWORD", "chai-and-cookies-2026");
    expect(checkTeamPassword("chai-and-cookies-2026")).toBe(true);
    expect(checkTeamPassword("chai-and-cookies-2025")).toBe(false);
    expect(checkTeamPassword("")).toBe(false);
  });

  it("is off when TEAM_PASSWORD is empty", () => {
    vi.stubEnv("TEAM_PASSWORD", "");
    expect(checkTeamPassword("")).toBe(false);
    expect(isAllowedEmail("priya@team.studio")).toBe(false);
  });

  it("lets team identities in only while the password is enabled", () => {
    vi.stubEnv("TEAM_PASSWORD", "x");
    vi.stubEnv("ALLOWED_EMAILS", "a@gmail.com");
    expect(isAllowedEmail("priya@team.studio")).toBe(true);
    expect(isAllowedEmail("A@gmail.com")).toBe(true);
    expect(isAllowedEmail("stranger@gmail.com")).toBe(false);
  });

  it("turns a name into a readable identity", () => {
    expect(teamIdentity("Priya S.")).toEqual({ email: "priya-s@team.studio", name: "Priya S." });
    expect(teamIdentity("   ")).toEqual({ email: "team@team.studio", name: "Team" });
  });
});
