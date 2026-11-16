import { uuid } from "../ids";
import { blobToDataUrl, prepareImage } from "../images";
import type { Asset, Deck, DeckMeta, Profile, Template } from "../types";
import { DataError, type DataApi } from "./api";

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
};

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
    return { id: "local", name: "Mode démo", avatarUrl: null, isStaff: localStorage.getItem(K.staff) === "1" };
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
  async createTemplate(input) {
    const templates = read<Template[]>(K.templates, []);
    const template: Template = { id: uuid(), sort: 1000 + templates.length, ...input };
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
};
