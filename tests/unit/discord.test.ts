import { describe, expect, it } from "vitest";
import { DEFAULT_STAFF_ROLE_ID, decideRole, isSnowflake } from "@/lib/server/discord";

const base = { expectedDiscordId: "42", guildId: "999", staffRoleId: DEFAULT_STAFF_ROLE_ID };
const member = (roles: string[], id = "42") => ({ roles, nick: null, avatar: null, user: { id, username: "clem", global_name: "Clément", avatar: "abc123" } });

describe("decideRole", () => {
  it("reconnaît le rôle staff", () => {
    const d = decideRole({ ...base, status: 200, body: member(["1", DEFAULT_STAFF_ROLE_ID]) });
    expect(d).toMatchObject({ ok: true, isStaff: true, inGuild: true, name: "Clément" });
    expect(d.ok && d.avatarUrl).toBe("https://cdn.discordapp.com/avatars/42/abc123.png?size=256");
  });

  it("un membre sans le rôle n'est pas staff", () => {
    expect(decideRole({ ...base, status: 200, body: member(["1", "2"]) })).toMatchObject({ ok: true, isStaff: false, inGuild: true });
  });

  it("hors du serveur : pas staff, sans erreur", () => {
    expect(decideRole({ ...base, status: 404, body: { code: 10004 } })).toMatchObject({ ok: true, isStaff: false, inGuild: false });
  });

  it("refuse un jeton qui appartient à un autre compte Discord", () => {
    expect(decideRole({ ...base, status: 200, body: member([DEFAULT_STAFF_ROLE_ID], "666") })).toMatchObject({ ok: false, status: 403 });
    expect(decideRole({ ...base, expectedDiscordId: null, status: 200, body: member([DEFAULT_STAFF_ROLE_ID]) })).toMatchObject({ ok: false, status: 403 });
  });

  it("ne conclut rien quand Discord ne répond pas normalement", () => {
    expect(decideRole({ ...base, status: 401, body: null })).toMatchObject({ ok: false, status: 401 });
    expect(decideRole({ ...base, status: 429, body: { retry_after: 2.3 } })).toMatchObject({ ok: false, status: 429, retryAfter: 3 });
    expect(decideRole({ ...base, status: 500, body: null })).toMatchObject({ ok: false, status: 502 });
    expect(decideRole({ ...base, status: 200, body: "pas un objet" })).toMatchObject({ ok: false, status: 502 });
  });

  it("préfère le surnom et l'avatar du serveur", () => {
    const d = decideRole({ ...base, status: 200, body: { ...member([]), nick: "Clem MS", avatar: "srv9" } });
    expect(d).toMatchObject({ ok: true, name: "Clem MS", avatarUrl: "https://cdn.discordapp.com/guilds/999/users/42/avatars/srv9.png?size=256" });
  });

  it("ne confond pas un rôle au nom voisin", () => {
    expect(decideRole({ ...base, status: 200, body: member([DEFAULT_STAFF_ROLE_ID + "0", "x" + DEFAULT_STAFF_ROLE_ID]) })).toMatchObject({ isStaff: false });
  });
});

describe("isSnowflake", () => {
  it("n'accepte que des identifiants Discord", () => {
    expect(isSnowflake(DEFAULT_STAFF_ROLE_ID)).toBe(true);
    expect(isSnowflake("12/../3")).toBe(false);
    expect(isSnowflake("")).toBe(false);
    expect(isSnowflake(undefined)).toBe(false);
  });
});
