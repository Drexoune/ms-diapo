import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { uuid } from "../ids";
import { prepareImage } from "../images";
import type { Asset, Deck, DeckMeta, Profile, Slide, Template } from "../types";
import { DataError, type DataApi } from "./api";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseConfigured = !!URL_ && !!KEY;

/** Au-delà de ce délai sans revérification, le rôle staff n'est plus reconnu (même règle côté base). */
export const STAFF_MAX_AGE_MS = 7 * 24 * 3600 * 1000;

const BUCKET_LIBRARY = "library";
const BUCKET_UPLOADS = "uploads";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!client) {
    client = createClient(URL_!, KEY!, {
      auth: { flowType: "pkce", detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
    });
  }
  return client;
}

function fail(action: string, error: { message: string } | null): never {
  throw new DataError(`${action} : ${error?.message ?? "erreur inconnue"}`, error);
}

interface AssetRow {
  id: string;
  category: Asset["category"];
  name: string;
  tags: string[] | null;
  kind: Asset["kind"];
  url: string | null;
  width: number | null;
  height: number | null;
  elements: Asset["elements"];
  sort: number;
}

const toAsset = (r: AssetRow): Asset => ({ ...r, tags: r.tags ?? [] });

interface TemplateRow {
  id: string;
  kind: Template["kind"];
  name: string;
  category: Template["category"];
  slides: Slide[];
  sort: number;
}

const SYNC_KEY = "msd:role-sync";

/**
 * Demande au serveur de vérifier le rôle Discord. Le jeton Discord n'est
 * disponible que juste après la connexion : on s'en sert une fois, puis on
 * note qu'il a servi.
 */
async function syncDiscordRole(session: Session): Promise<void> {
  const token = session.provider_token;
  if (!token) return;
  const mark = `${session.user.id}:${token.slice(-12)}`;
  if (localStorage.getItem(SYNC_KEY) === mark) return;
  try {
    const res = await fetch("/api/discord/sync", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ provider_token: token }),
    });
    // Une erreur passagère (Discord indisponible) laisse une nouvelle chance au prochain chargement.
    if (res.ok || res.status === 401 || res.status === 403) localStorage.setItem(SYNC_KEY, mark);
  } catch {
    /* hors ligne : on réessaiera */
  }
}

export const supabaseApi: DataApi = {
  mode: "supabase",

  async getProfile(): Promise<Profile | null> {
    const sb = getSupabase();
    const {
      data: { session },
    } = await sb.auth.getSession();
    if (!session) return null;
    await syncDiscordRole(session);
    const { data } = await sb.from("profiles").select("id,name,avatar_url,is_staff,staff_checked_at").eq("id", session.user.id).maybeSingle();
    const meta = session.user.user_metadata ?? {};
    const checkedAt = data?.staff_checked_at ? Date.parse(data.staff_checked_at) : 0;
    const fresh = Date.now() - checkedAt < STAFF_MAX_AGE_MS;
    return {
      id: session.user.id,
      name: data?.name || meta.full_name || meta.name || "Membre",
      avatarUrl: data?.avatar_url || meta.avatar_url || null,
      isStaff: !!data?.is_staff && fresh,
      staffStale: !!data?.is_staff && !fresh,
    };
  },

  onAuthChange(cb) {
    const { data } = getSupabase().auth.onAuthStateChange((event) => {
      // Jamais d'appel Supabase directement dans ce rappel : il s'exécute sous verrou.
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") setTimeout(cb, 0);
    });
    return () => data.subscription.unsubscribe();
  },

  async signIn() {
    const { error } = await getSupabase().auth.signInWithOAuth({
      provider: "discord",
      options: {
        // guilds.members.read : lire les rôles de la personne sur le serveur MS Creators, rien d'autre.
        scopes: "identify guilds.members.read",
        redirectTo: `${window.location.origin}/`,
      },
    });
    if (error) fail("Connexion Discord impossible", error);
  },

  async signOut() {
    localStorage.removeItem(SYNC_KEY);
    await getSupabase().auth.signOut();
  },

  async listDecks(): Promise<DeckMeta[]> {
    const { data, error } = await getSupabase()
      .from("decks")
      .select("id,title,updated_at,slide_count,cover:slides->0")
      .order("updated_at", { ascending: false });
    if (error) fail("Chargement des présentations impossible", error);
    return (data ?? []).map((r) => ({
      id: r.id as string,
      title: r.title as string,
      updatedAt: r.updated_at as string,
      slideCount: (r.slide_count as number) ?? 0,
      cover: (r.cover as unknown as Slide) ?? null,
    }));
  },

  async getDeck(id): Promise<Deck | null> {
    const { data, error } = await getSupabase().from("decks").select("id,title,slides,updated_at").eq("id", id).maybeSingle();
    if (error) fail("Chargement de la présentation impossible", error);
    if (!data) return null;
    return { id: data.id, title: data.title, slides: data.slides as Slide[], updatedAt: data.updated_at };
  },

  async createDeck(input): Promise<Deck> {
    const { data, error } = await getSupabase().from("decks").insert({ title: input.title, slides: input.slides }).select("id,title,slides,updated_at").single();
    if (error || !data) fail("Création de la présentation impossible", error);
    return { id: data.id, title: data.title, slides: data.slides as Slide[], updatedAt: data.updated_at };
  },

  async saveDeck(id, patch) {
    const { error, count } = await getSupabase().from("decks").update({ title: patch.title, slides: patch.slides }, { count: "exact" }).eq("id", id);
    if (error) fail("Enregistrement impossible", error);
    // Zéro ligne touchée : session expirée ou présentation supprimée ailleurs.
    if (count === 0) throw new DataError("Enregistrement impossible : la présentation n'est plus accessible. Reconnecte-toi.");
  },

  async deleteDeck(id) {
    const { error } = await getSupabase().from("decks").delete().eq("id", id);
    if (error) fail("Suppression impossible", error);
  },

  async listAssets(): Promise<Asset[]> {
    const { data, error } = await getSupabase().from("assets").select("id,category,name,tags,kind,url,width,height,elements,sort").order("sort").order("created_at");
    if (error) fail("Chargement de la bibliothèque impossible", error);
    return ((data ?? []) as AssetRow[]).map(toAsset);
  },

  async createAsset(input): Promise<Asset> {
    const { data, error } = await getSupabase()
      .from("assets")
      .insert({ ...input, sort: Math.floor(Date.now() / 1000) })
      .select("id,category,name,tags,kind,url,width,height,elements,sort")
      .single();
    if (error || !data) fail("Ajout à la bibliothèque impossible", error);
    return toAsset(data as AssetRow);
  },

  async updateAsset(id, patch) {
    const { error } = await getSupabase().from("assets").update(patch).eq("id", id);
    if (error) fail("Modification impossible", error);
  },

  async deleteAsset(id) {
    const sb = getSupabase();
    const { data } = await sb.from("assets").select("url").eq("id", id).maybeSingle();
    const { error } = await sb.from("assets").delete().eq("id", id);
    if (error) fail("Suppression impossible", error);
    // Le fichier associé est retiré du stockage (sans bloquer si ça échoue).
    const marker = `/object/public/${BUCKET_LIBRARY}/`;
    const at = data?.url?.indexOf(marker) ?? -1;
    if (data?.url && at >= 0) await sb.storage.from(BUCKET_LIBRARY).remove([decodeURIComponent(data.url.slice(at + marker.length))]);
  },

  async listTemplates(): Promise<Template[]> {
    const { data, error } = await getSupabase().from("templates").select("id,kind,name,category,slides,sort").order("sort").order("created_at");
    if (error) fail("Chargement des modèles impossible", error);
    return (data ?? []) as TemplateRow[];
  },

  async getTemplate(id): Promise<Template | null> {
    const { data, error } = await getSupabase().from("templates").select("id,kind,name,category,slides,sort").eq("id", id).maybeSingle();
    if (error) fail("Chargement du modèle impossible", error);
    return (data as TemplateRow | null) ?? null;
  },

  async createTemplate(input): Promise<Template> {
    const { data, error } = await getSupabase()
      .from("templates")
      .insert({ ...input, sort: Math.floor(Date.now() / 1000) })
      .select("id,kind,name,category,slides,sort")
      .single();
    if (error || !data) fail("Création du modèle impossible", error);
    return data as TemplateRow;
  },

  async updateTemplate(id, patch) {
    const { error, count } = await getSupabase().from("templates").update(patch, { count: "exact" }).eq("id", id);
    if (error) fail("Modification du modèle impossible", error);
    if (count === 0) throw new DataError("Modification refusée : le rôle staff doit être revérifié. Reconnecte-toi.");
  },

  async deleteTemplate(id) {
    const { error } = await getSupabase().from("templates").delete().eq("id", id);
    if (error) fail("Suppression impossible", error);
  },

  async listHidden(): Promise<string[]> {
    const { data, error } = await getSupabase().from("hidden_builtins").select("item_id");
    if (error) fail("Chargement de la bibliothèque impossible", error);
    return (data ?? []).map((r) => r.item_id as string);
  },

  async setHidden(id, hidden) {
    const sb = getSupabase();
    const { error } = hidden ? await sb.from("hidden_builtins").upsert({ item_id: id }) : await sb.from("hidden_builtins").delete().eq("item_id", id);
    if (error) fail("Modification impossible", error);
  },

  async uploadImage(file, scope) {
    const sb = getSupabase();
    const img = await prepareImage(file, { allowSvg: scope === "library" });
    const {
      data: { session },
    } = await sb.auth.getSession();
    if (!session) throw new DataError("Connecte-toi pour ajouter une image.");
    const bucket = scope === "library" ? BUCKET_LIBRARY : BUCKET_UPLOADS;
    // Les images personnelles sont rangées dans un dossier au nom du compte (exigé par les règles de stockage).
    const path = scope === "library" ? `${uuid()}.${img.ext}` : `${session.user.id}/${uuid()}.${img.ext}`;
    const { error } = await sb.storage.from(bucket).upload(path, img.blob, { contentType: img.contentType, cacheControl: "31536000", upsert: false });
    if (error) fail("Envoi de l'image impossible", error);
    return { url: sb.storage.from(bucket).getPublicUrl(path).data.publicUrl, width: img.width, height: img.height };
  },
};
