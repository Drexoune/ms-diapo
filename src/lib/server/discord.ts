/**
 * Vérification du rôle staff auprès de Discord.
 *
 * Le navigateur envoie le jeton Discord obtenu à la connexion ; le serveur
 * interroge Discord avec ce jeton pour lire les rôles de la personne sur le
 * serveur MS Creators. La décision est isolée dans une fonction pure pour
 * être testée sans réseau.
 */

export const DEFAULT_STAFF_ROLE_ID = "1371781847557738526";

export interface DiscordMember {
  roles?: string[];
  nick?: string | null;
  avatar?: string | null;
  user?: { id?: string; username?: string; global_name?: string | null; avatar?: string | null };
}

export type RoleDecision =
  | { ok: true; isStaff: boolean; inGuild: boolean; name: string | null; avatarUrl: string | null }
  | { ok: false; status: number; error: string; retryAfter?: number };

export interface DecideInput {
  /** Statut HTTP renvoyé par Discord pour /users/@me/guilds/{guild}/member. */
  status: number;
  body: unknown;
  /** Identifiant Discord rattaché au compte connecté (connu de Supabase). */
  expectedDiscordId: string | null;
  guildId: string;
  staffRoleId: string;
}

export function decideRole({ status, body, expectedDiscordId, guildId, staffRoleId }: DecideInput): RoleDecision {
  if (status === 404) {
    // La personne n'est pas membre du serveur : compte valide, mais pas de rôle.
    return { ok: true, isStaff: false, inGuild: false, name: null, avatarUrl: null };
  }
  if (status === 401 || status === 403) {
    return { ok: false, status: 401, error: "discord_token_refused" };
  }
  if (status === 429) {
    const retry = Number((body as { retry_after?: number } | null)?.retry_after);
    return { ok: false, status: 429, error: "discord_rate_limited", retryAfter: Number.isFinite(retry) ? Math.ceil(retry) : 5 };
  }
  if (status !== 200 || !body || typeof body !== "object") {
    return { ok: false, status: 502, error: "discord_unavailable" };
  }

  const member = body as DiscordMember;
  const id = member.user?.id;
  // Le jeton doit appartenir au compte Discord lié à cette session : on ne
  // laisse personne emprunter le rôle de quelqu'un d'autre.
  if (!id || !expectedDiscordId || id !== expectedDiscordId) {
    return { ok: false, status: 403, error: "discord_account_mismatch" };
  }

  const roles = Array.isArray(member.roles) ? member.roles : [];
  const name = member.nick || member.user?.global_name || member.user?.username || null;
  let avatarUrl: string | null = null;
  if (member.avatar) avatarUrl = `https://cdn.discordapp.com/guilds/${guildId}/users/${id}/avatars/${member.avatar}.png?size=256`;
  else if (member.user?.avatar) avatarUrl = `https://cdn.discordapp.com/avatars/${id}/${member.user.avatar}.png?size=256`;

  return { ok: true, isStaff: roles.includes(staffRoleId), inGuild: true, name, avatarUrl };
}

/** Un identifiant Discord (« snowflake ») : uniquement des chiffres. */
export const isSnowflake = (s: unknown): s is string => typeof s === "string" && /^\d{15,22}$/.test(s);
