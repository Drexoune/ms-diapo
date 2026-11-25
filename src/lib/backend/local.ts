import { uuid } from "../ids";
import { blobToDataUrl, prepareImage } from "../images";
import type { Asset, Deck, DeckMeta, El, Example, Profile, Template } from "../types";
import { DataError, type DataApi } from "./api";
import { deleteFile, deleteFiles, putFile, resolve, unresolve } from "./files";

/**
 * Stockage local (navigateur). Sert au développement et à la démonstration
 * quand Supabase n'est pas configuré : pas de compte, pas de partage, les
 * présentations restent sur cet appareil.
 */

const K = {
  decks: "msd:decks",
  assets: "msd:assets",
  templates: "msd:templates",
  hidden: "msd:hidden",
  staff: "msd:staff",
  examples: "msd:examples",
  builtinNames: "msd:builtin-names",
  builtinContents: "msd:builtin-contents",
};

/* ───────────── Visite guidée ─────────────
   Repère « déjà vue » gardé dans le navigateur, par compte. Le mode démo et
   le mode invité n'ont que lui ; un compte Discord l'a aussi côté serveur. */

const onboardedKey = (profileId: string) => `msd:onboarded:${profileId}`;

export function isOnboardedHere(profileId: string): boolean {
  try {
    return localStorage.getItem(onboardedKey(profileId)) === "1";
  } catch {
    return false;
  }
}

export function markOnboardedHere(profileId: string) {
  try {
    localStorage.setItem(onboardedKey(profileId), "1");
  } catch {
    /* stockage indisponible : la visite pourra se représenter, sans gravité */
  }
}

/** Adresses « idb: » d'un exemple rendues affichables. */
async function resolveExample(ex: Example): Promise<Example> {
  const pages = await Promise.all(ex.pages.map(async (p) => ({ ...p, url: await resolve(p.url), thumb: await resolve(p.thumb) })));
  return { ...ex, pages, pdfUrl: ex.pdfUrl ? await resolve(ex.pdfUrl) : null };
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    throw new DataError("L'espace de stockage du navigateur est plein. Supprime des présentations ou des images.", e);
  }
}

const listeners = new Set<() => void>();

export function setLocalStaff(on: boolean) {
  localStorage.setItem(K.staff, on ? "1" : "0");
  listeners.forEach((cb) => cb());
}

export const localApi: DataApi = {
  mode: "local",

  async getProfile(): Promise<Profile> {
    return { id: "local", name: "Mode démo", avatarUrl: null, isStaff: localStorage.getItem(K.staff) === "1", onboarded: isOnboardedHere("local") };
  },
  onAuthChange(cb) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  async signIn() {},
  async signOut() {},

  async listDecks(): Promise<DeckMeta[]> {
    const decks = Object.values(read<Record<string, Deck>>(K.decks, {}));
    return decks
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((d) => ({ id: d.id, title: d.title, updatedAt: d.updatedAt, cover: d.slides[0] ?? null, slideCount: d.slides.length }));
  },
  async getDeck(id) {
    return read<Record<string, Deck>>(K.decks, {})[id] ?? null;
  },
  async createDeck(input) {
    const decks = read<Record<string, Deck>>(K.decks, {});
    const deck: Deck = { id: uuid(), title: input.title, slides: input.slides, updatedAt: new Date().toISOString() };
    decks[deck.id] = deck;
    write(K.decks, decks);
    return deck;
  },
  async saveDeck(id, patch) {
    const decks = read<Record<string, Deck>>(K.decks, {});
    if (!decks[id]) throw new DataError("Présentation introuvable");
    decks[id] = { ...decks[id], ...patch, updatedAt: new Date().toISOString() };
    write(K.decks, decks);
  },
  async deleteDeck(id) {
    const decks = read<Record<string, Deck>>(K.decks, {});
    delete decks[id];
    write(K.decks, decks);
  },

  async listAssets() {
    return read<Asset[]>(K.assets, []);
  },
  async createAsset(input) {
    const assets = read<Asset[]>(K.assets, []);
    const asset: Asset = { id: uuid(), sort: 1000 + assets.length, ...input };
    write(K.assets, [...assets, asset]);
    return asset;
  },
  async updateAsset(id, patch) {
    write(
      K.assets,
      read<Asset[]>(K.assets, []).map((a) => (a.id === id ? { ...a, ...patch } : a)),
    );
  },
  async deleteAsset(id) {
    write(
      K.assets,
      read<Asset[]>(K.assets, []).filter((a) => a.id !== id),
    );
  },

  async listTemplates() {
    return read<Template[]>(K.templates, []);
  },
  async getTemplate(id) {
    return read<Template[]>(K.templates, []).find((t) => t.id === id) ?? null;
  },
  async createTemplate({ sort, ...input }) {
    const templates = read<Template[]>(K.templates, []);
    const template: Template = { id: uuid(), sort: sort ?? 1000 + templates.length, ...input };
    write(K.templates, [...templates, template]);
    return template;
  },
  async updateTemplate(id, patch) {
    write(
      K.templates,
      read<Template[]>(K.templates, []).map((t) => (t.id === id ? { ...t, ...patch } : t)),
    );
  },
  async deleteTemplate(id) {
    write(
      K.templates,
      read<Template[]>(K.templates, []).filter((t) => t.id !== id),
    );
  },

  async listBuiltinNames() {
    return read<Record<string, string>>(K.builtinNames, {});
  },
  async setBuiltinName(id, name) {
    const names = read<Record<string, string>>(K.builtinNames, {});
    if (name) names[id] = name;
    else delete names[id];
    write(K.builtinNames, names);
  },
  async listBuiltinContents() {
    return read<Record<string, El[]>>(K.builtinContents, {});
  },
  async setBuiltinContent(id, elements) {
    const contents = read<Record<string, El[]>>(K.builtinContents, {});
    if (elements) contents[id] = elements;
    else delete contents[id];
    write(K.builtinContents, contents);
  },
  async listHidden() {
    return read<string[]>(K.hidden, []);
  },
  async setHidden(id, hidden) {
    const set = new Set(read<string[]>(K.hidden, []));
    if (hidden) set.add(id);
    else set.delete(id);
    write(K.hidden, [...set]);
  },

  async uploadImage(file) {
    const img = await prepareImage(file);
    return { url: await blobToDataUrl(img.blob), width: img.width, height: img.height };
  },

  async listExamples() {
    const list = read<Example[]>(K.examples, []).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return Promise.all(list.map(resolveExample));
  },
  async uploadExampleFile(exampleId, name, file) {
    try {
      // Adresse affichable tout de suite ; elle est retraduite en clé « idb: » à l'enregistrement.
      return await resolve(await putFile(`examples/${exampleId}/${name}`, file));
    } catch (e) {
      throw new DataError("Le navigateur refuse d'enregistrer ce fichier (espace plein ?).", e);
    }
  },
  async createExample(input) {
    const example: Example = {
      ...input,
      pages: input.pages.map((p) => ({ ...p, url: unresolve(p.url), thumb: unresolve(p.thumb) })),
      pdfUrl: input.pdfUrl ? unresolve(input.pdfUrl) : null,
      createdAt: new Date().toISOString(),
    };
    write(K.examples, [...read<Example[]>(K.examples, []), example]);
    return resolveExample(example);
  },
  async updateExample(id, patch) {
    // Les pages arrivent avec leurs adresses affichables : on remet les adresses enregistrées.
    const stored: Partial<Example> = { ...patch };
    if (patch.pages) stored.pages = patch.pages.map((p) => ({ ...p, url: unresolve(p.url), thumb: unresolve(p.thumb) }));
    if (patch.pdfUrl) stored.pdfUrl = unresolve(patch.pdfUrl);
    write(
      K.examples,
      read<Example[]>(K.examples, []).map((e) => (e.id === id ? { ...e, ...stored } : e)),
    );
  },
  async deleteExampleFiles(_exampleId, urls) {
    await Promise.all(urls.map(deleteFile));
  },
  async deleteExample(id) {
    write(
      K.examples,
      read<Example[]>(K.examples, []).filter((e) => e.id !== id),
    );
    await deleteFiles(`examples/${id}/`);
  },

  async markOnboarded() {
    markOnboardedHere("local");
  },
};
