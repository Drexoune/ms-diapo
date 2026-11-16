import { createClient } from "@supabase/supabase-js";
import { DEFAULT_STAFF_ROLE_ID, decideRole, isSnowflake } from "@/lib/server/discord";

/**
 * POST /api/discord/sync
 *
 * Appelé par le navigateur juste après la connexion Discord. Vérifie le rôle
 * de la personne sur le serveur MS Creators et l'inscrit dans son profil.
 * C'est le seul endroit qui peut écrire `is_staff` : les règles de la base
 * interdisent toute écriture du profil depuis le navigateur.
 *
 * En-tête  Authorization: Bearer <jeton de session Supabase>
 * Corps    { "provider_token": "<jeton Discord>" }
 */

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const guildId = process.env.DISCORD_GUILD_ID;
  const staffRoleId = process.env.DISCORD_STAFF_ROLE_ID || DEFAULT_STAFF_ROLE_ID;
  if (!supabaseUrl || !serviceKey || !isSnowflake(guildId) || !isSnowflake(staffRoleId)) {
    return json({ error: "not_configured" }, 503);
  }

  const jwt = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const payload = (await request.json().catch(() => null)) as { provider_token?: unknown } | null;
  const providerToken = payload?.provider_token;
  if (!jwt || typeof providerToken !== "string" || providerToken.length < 10 || providerToken.length > 512) {
    return json({ error: "bad_request" }, 400);
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error: authError } = await admin.auth.getUser(jwt);
  const user = auth?.user;
  if (authError || !user) return json({ error: "invalid_session" }, 401);

  const identity = user.identities?.find((i) => i.provider === "discord");
  const expectedDiscordId = identity?.id ?? (user.user_metadata?.provider_id as string | undefined) ?? null;

  let status = 0;
  let body: unknown = null;
  try {
    const res = await fetch(`https://discord.com/api/v10/users/@me/guilds/${guildId}/member`, {
      headers: { authorization: `Bearer ${providerToken}` },
      cache: "no-store",
    });
    status = res.status;
    body = await res.json().catch(() => null);
  } catch {
    return json({ error: "discord_unreachable" }, 502);
  }

  const decision = decideRole({ status, body, expectedDiscordId, guildId, staffRoleId });
  if (!decision.ok) {
    return json({ error: decision.error }, decision.status, decision.retryAfter ? { "retry-after": String(decision.retryAfter) } : {});
  }

  // L'avatar est recopié dans notre stockage : son adresse reste stable et
  // l'export des diapos peut le lire sans restriction d'origine.
  let avatarUrl = decision.avatarUrl;
  if (avatarUrl) {
    try {
      const img = await fetch(avatarUrl, { cache: "no-store" });
      if (img.ok) {
        const bytes = await img.arrayBuffer();
        const path = `${user.id}/avatar.png`;
        const up = await admin.storage.from("uploads").upload(path, bytes, { contentType: "image/png", upsert: true, cacheControl: "3600" });
        if (!up.error) {
          const stamp = avatarUrl.match(/\/([a-z0-9_]+)\.png/i)?.[1]?.slice(-8) ?? Date.now().toString(36);
          avatarUrl = `${admin.storage.from("uploads").getPublicUrl(path).data.publicUrl}?v=${stamp}`;
        }
      }
    } catch {
      /* on garde l'adresse Discord */
    }
  }

  const row: Record<string, unknown> = {
    id: user.id,
    discord_id: expectedDiscordId,
    is_staff: decision.isStaff,
    in_guild: decision.inGuild,
    staff_checked_at: new Date().toISOString(),
  };
  if (decision.name) row.name = decision.name;
  if (avatarUrl) row.avatar_url = avatarUrl;

  const { error: writeError } = await admin.from("profiles").upsert(row, { onConflict: "id" });
  if (writeError) return json({ error: "profile_write_failed" }, 500);

  return json({ is_staff: decision.isStaff, in_guild: decision.inGuild });
}
