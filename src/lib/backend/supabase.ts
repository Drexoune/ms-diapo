import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { uuid } from "../ids";
import { prepareImage } from "../images";
import type { Asset, Deck, DeckMeta, El, Example, ExamplePage, Profile, Slide, Template } from "../types";
import { DataError, type DataApi } from "./api";
import { isOnboardedHere, markOnboardedHere } from "./local";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseConfigured = !!URL_ && !!KEY;

/** Au-delà de ce délai sans revérification, le rôle staff n'est plus reconnu (même règle côté base). */
export const STAFF_MAX_AGE_MS = 7 * 24 * 3600 * 1000;

const BUCKET_LIBRARY = "library";
const BUCKET_UPLOADS = "uploads";
const BUCKET_EXAMPLES = "examples";

/** Message affiché quand la rubrique Exemples est utilisée avant d'avoir créé sa table. */
export const EXAMPLES_MIGRATION_HINT =
  "La rubrique Exemples n'est pas encore activée dans Supabase : exécute supabase/migrations/20261118000000_exemples_et_visite.sql dans l'éditeur SQL.";

/** La table ou l'espace de stockage des exemples n'existe pas encore (migration pas exécutée). */
function isMissingExamples(error: { message?: string; code?: string } | null): boolean {
  const msg = error?.message ?? "";
  return error?.code === "PGRST205" || error?.code === "42P01" || /bucket not found/i.test(msg) || (/examples/.test(msg) && /(does not exist|schema cache)/.test(msg));
}

function failExamples(action: string, error: { message: string; code?: string } | null): never {
  if (isMissingExamples(error)) throw new DataError(EXAMPLES_MIGRATION_HINT, error);
  fail(action, error);
}

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

interface ExampleRow {
  id: string;
  title: string;
  author: string;
  description: string;
  pages: ExamplePage[];
  pdf_url: string | null;
  created_at: string;
}

const toExample = (r: ExampleRow): Example => ({
  id: r.id,
  title: r.title,
  author: r.author ?? "",
  description: r.description ?? "",
  pages: Array.isArray(r.pages) ? r.pages : [],
  pdfUrl: r.pdf_url,
  createdAt: r.created_at,
});

export const supabaseApi: DataApi = {
  mode: "supabase",

  async getProfile(): Promise<Profile | null> {
    const sb = getSupabase();
    const {
      data: { session },
    } = await sb.auth.getSession();
    if (!session) return null;
    await syncDiscordRole(session);
    // « * » plutôt qu'une liste : une colonne ajoutée par une migration pas encore exécutée
    // (onboarded_at) ne doit pas faire échouer la lecture du profil, donc du rôle staff.
    const { data } = await sb.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
    const meta = session.user.user_metadata ?? {};
    const checkedAt = data?.staff_checked_at ? Date.parse(data.staff_checked_at) : 0;
    const fresh = Date.now() - checkedAt < STAFF_MAX_AGE_MS;
    return {
      id: session.user.id,
      name: data?.name || meta.full_name || meta.name || "Membre",
      avatarUrl: data?.avatar_url || meta.avatar_url || null,
      isStaff: !!data?.is_staff && fresh,
      staffStale: !!data?.is_staff && !fresh,
      onboarded: !!data?.onboarded_at || isOnboardedHere(session.user.id),
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

  async listExamples(): Promise<Example[]> {
    const { data, error } = await getSupabase().from("examples").select("id,title,author,description,pages,pdf_url,created_at").order("created_at", { ascending: false });
    if (error) failExamples("Chargement des exemples impossible", error);
    return ((data ?? []) as ExampleRow[]).map(toExample);
  },

  async uploadExampleFile(exampleId, name, file) {
    const sb = getSupabase();
    const path = `${exampleId}/${name}`;
    const { error } = await sb.storage.from(BUCKET_EXAMPLES).upload(path, file, { contentType: file.type || undefined, cacheControl: "31536000", upsert: false });
    if (error) failExamples("Envoi du fichier impossible", error);
    return sb.storage.from(BUCKET_EXAMPLES).getPublicUrl(path).data.publicUrl;
  },

  async createExample(input): Promise<Example> {
    const { data, error } = await getSupabase()
      .from("examples")
      .insert({ id: input.id, title: input.title, author: input.author, description: input.description, pages: input.pages, pdf_url: input.pdfUrl })
      .select("id,title,author,description,pages,pdf_url,created_at")
      .single();
    if (error || !data) failExamples("Publication de l'exemple impossible", error);
    return toExample(data as ExampleRow);
  },

  async updateExample(id, patch) {
    const { pdfUrl, ...rest } = patch;
    const row = pdfUrl === undefined ? rest : { ...rest, pdf_url: pdfUrl };
    const { error, count } = await getSupabase().from("examples").update(row, { count: "exact" }).eq("id", id);
    if (error) failExamples("Modification impossible", error);
    if (count === 0) throw new DataError("Modification refusée : le rôle staff doit être revérifié. Reconnecte-toi.");
  },

  async deleteExample(id) {
    const sb = getSupabase();
    const { error } = await sb.from("examples").delete().eq("id", id);
    if (error && !isMissingExamples(error)) fail("Suppression impossible", error);
    // Puis les fichiers : pages, miniatures et PDF d'origine, rangés dans un dossier à son nom.
    const { data: files } = await sb.storage.from(BUCKET_EXAMPLES).list(id, { limit: 1000 });
    if (files?.length) await sb.storage.from(BUCKET_EXAMPLES).remove(files.map((f) => `${id}/${f.name}`));
  },

  async deleteExampleFiles(exampleId, urls) {
    const marker = `/object/public/${BUCKET_EXAMPLES}/`;
    const paths = urls
      .map((u) => {
        const at = u.indexOf(marker);
        return at >= 0 ? decodeURIComponent(u.slice(at + marker.length).split("?")[0]) : null;
      })
      // Uniquement les fichiers rangés dans le dossier de cet exemple.
      .filter((p): p is string => !!p && p.startsWith(`${exampleId}/`));
    if (!paths.length) return;
    const { error } = await getSupabase().storage.from(BUCKET_EXAMPLES).remove(paths);
    if (error) fail("Suppression des pages impossible", error);
  },

  async listBuiltinNames(): Promise<Record<string, string>> {
    const { data, error } = await getSupabase().from("builtin_names").select("item_id,name");
    // Migration pas encore exécutée : pas de renommage, sans bloquer la bibliothèque.
    if (error) return {};
    return Object.fromEntries((data ?? []).map((r) => [r.item_id as string, r.name as string]));
  },

  async setBuiltinName(id, name) {
    const sb = getSupabase();
    const { error } = name ? await sb.from("builtin_names").upsert({ item_id: id, name }) : await sb.from("builtin_names").delete().eq("item_id", id);
    if (error) {
      if (error.code === "PGRST205" || error.code === "42P01")
        throw new DataError("Le renommage n'est pas encore activé dans Supabase : exécute supabase/migrations/20261123000000_renommage_pack.sql dans l'éditeur SQL.", error);
      fail("Renommage impossible", error);
    }
  },

  async listBuiltinContents(): Promise<Record<string, El[]>> {
    const { data, error } = await getSupabase().from("builtin_contents").select("item_id,elements");
    // Migration pas encore exécutée : contenus d'origine, sans bloquer la bibliothèque.
    if (error) return {};
    return Object.fromEntries((data ?? []).filter((r) => Array.isArray(r.elements)).map((r) => [r.item_id as string, r.elements as El[]]));
  },

  async setBuiltinContent(id, elements) {
    const sb = getSupabase();
    const { error } = elements ? await sb.from("builtin_contents").upsert({ item_id: id, elements }) : await sb.from("builtin_contents").delete().eq("item_id", id);
    if (error) {
      if (error.code === "PGRST205" || error.code === "42P01")
        throw new DataError("La modification des textes n'est pas encore activée dans Supabase : exécute supabase/migrations/20261124000000_textes_pack.sql dans l'éditeur SQL.", error);
      fail("Enregistrement des textes impossible", error);
    }
  },

  async markOnboarded() {
    const {
      data: { session },
    } = await getSupabase().auth.getSession();
    if (!session) return;
    markOnboardedHere(session.user.id);
    // Côté serveur, pour ne pas la reproposer sur un autre appareil. Sans la migration, le repère local suffit.
    await getSupabase()
      .rpc("mark_onboarded")
      .then(
        () => undefined,
        () => undefined,
      );
  },
};
