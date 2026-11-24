import { DataError, type DataApi } from "./api";
import { isOnboardedHere, localApi, markOnboardedHere } from "./local";
import { supabaseApi, supabaseConfigured } from "./supabase";

/**
 * Choix de la source de données :
 *  - Supabase n'est pas configuré → tout en local (développement) ;
 *  - Supabase est configuré → comptes Discord, ou « mode invité » si la
 *    personne a choisi d'essayer sans compte.
 *
 * Le mode invité garde les présentations dans le navigateur (rien n'est
 * envoyé au serveur) mais montre la vraie bibliothèque et les vrais modèles,
 * qui sont lisibles sans compte. Il ne donne jamais accès au panel admin.
 */

const GUEST_KEY = "msd:guest";
const guestListeners = new Set<() => void>();

export function isGuest(): boolean {
  return supabaseConfigured && typeof localStorage !== "undefined" && localStorage.getItem(GUEST_KEY) === "1";
}

export function enterGuest() {
  localStorage.setItem(GUEST_KEY, "1");
  guestListeners.forEach((cb) => cb());
}

export function leaveGuest() {
  localStorage.removeItem(GUEST_KEY);
  guestListeners.forEach((cb) => cb());
}

const staffOnly = async (): Promise<never> => {
  throw new DataError("Connecte-toi avec Discord pour modifier la bibliothèque.");
};

const guestApi: DataApi = {
  ...localApi,
  mode: "guest",
  async getProfile() {
    return { id: "guest", name: "Invité", avatarUrl: null, isStaff: false, onboarded: isOnboardedHere("guest") };
  },
  async markOnboarded() {
    markOnboardedHere("guest");
  },
  async signIn() {
    leaveGuest();
    await supabaseApi.signIn();
  },
  async signOut() {
    leaveGuest();
  },
  // Bibliothèque du site, en lecture seule ; si elle ne répond pas, le pack de départ suffit.
  listAssets: () => supabaseApi.listAssets().catch(() => []),
  listTemplates: () => supabaseApi.listTemplates().catch(() => []),
  listHidden: () => supabaseApi.listHidden().catch(() => []),
  listBuiltinNames: () => supabaseApi.listBuiltinNames().catch(() => ({})),
  setBuiltinName: staffOnly,
  listBuiltinContents: () => supabaseApi.listBuiltinContents().catch(() => ({})),
  setBuiltinContent: staffOnly,
  deleteExampleFiles: staffOnly,
  getTemplate: (id) => supabaseApi.getTemplate(id).catch(() => null),
  // Les exemples du site, consultables par tous.
  listExamples: () => supabaseApi.listExamples(),
  uploadExampleFile: staffOnly,
  createExample: staffOnly,
  updateExample: staffOnly,
  deleteExample: staffOnly,
  createAsset: staffOnly,
  updateAsset: staffOnly,
  deleteAsset: staffOnly,
  createTemplate: staffOnly,
  updateTemplate: staffOnly,
  deleteTemplate: staffOnly,
  setHidden: staffOnly,
};

const active = (): DataApi => (!supabaseConfigured ? localApi : isGuest() ? guestApi : supabaseApi);

/** Prévient à chaque changement de session, quelle qu'en soit la source (Discord, invité, démo). */
function onAuthChange(cb: () => void): () => void {
  guestListeners.add(cb);
  const stops = [localApi.onAuthChange(cb)];
  if (supabaseConfigured) stops.push(supabaseApi.onAuthChange(cb));
  return () => {
    guestListeners.delete(cb);
    stops.forEach((stop) => stop());
  };
}

/** Point d'accès unique : chaque appel part vers la source active à cet instant. */
export const data: DataApi = new Proxy({} as DataApi, {
  get(_target, prop: keyof DataApi) {
    if (prop === "onAuthChange") return onAuthChange;
    const api = active();
    const value = api[prop];
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(api) : value;
  },
});

export { supabaseConfigured };
export { EXAMPLES_MIGRATION_HINT } from "./supabase";
export { DataError } from "./api";
export type { DataApi, ExamplePatch, NewAsset, NewExample, NewTemplate, UploadResult } from "./api";
