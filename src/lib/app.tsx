"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { data } from "./backend";
import { STARTER_ASSETS, STARTER_TEMPLATES, resolveAvatarInEls, resolveAvatarInSlides } from "./starter";
import type { Asset, El, Example, Profile, Template } from "./types";

interface Toast {
  id: number;
  text: string;
  kind: "info" | "error" | "ok";
}

interface AppCtx {
  profile: Profile | null;
  /** Vrai tant que la session n'a pas été lue. */
  loading: boolean;
  refreshProfile: () => Promise<void>;
  /** Bibliothèque visible : pack de départ non masqué + ajouts du staff. */
  assets: Asset[];
  templates: Template[];
  /** Pour le panel admin : ajouts du staff et éléments du pack masqués. */
  customAssets: Asset[];
  customTemplates: Template[];
  hidden: Set<string>;
  /** Noms donnés par le staff aux éléments et modèles du pack de départ. */
  builtinNames: Record<string, string>;
  /** Contenus (textes réécrits) des éléments du pack de départ. */
  builtinContents: Record<string, El[]>;
  libraryReady: boolean;
  reloadLibrary: () => Promise<void>;
  /** Exemples, du plus récent au plus ancien ; `null` tant qu'ils se chargent. */
  examples: Example[] | null;
  /** Les exemples n'ont pas pu être lus (par exemple : migration pas encore exécutée). */
  examplesError: string | null;
  reloadExamples: () => Promise<void>;
  toast: (text: string, kind?: Toast["kind"]) => void;
}

const Ctx = createContext<AppCtx | null>(null);

const fetchProfile = (): Promise<Profile | null> => data.getProfile().catch(() => null);

const fetchLibrary = () =>
  Promise.all([data.listAssets(), data.listTemplates(), data.listHidden(), data.listBuiltinNames().catch(() => ({})), data.listBuiltinContents().catch(() => ({}))])
    .then(([assets, templates, hidden, names, contents]) => ({ assets, templates, hidden, names, contents }))
    .catch((e: unknown) => (e instanceof Error ? e : new Error("Bibliothèque indisponible")));

const fetchExamples = () => data.listExamples().catch((e: unknown) => (e instanceof Error ? e : new Error("Exemples indisponibles")));

/** Élément du pack de départ tel que le staff l'a renommé ou réécrit. */
export function applyBuiltin(a: Asset, names: Record<string, string>, contents: Record<string, El[]>): Asset {
  const name = names[a.id];
  const elements = a.kind === "elements" ? contents[a.id] : undefined;
  return name || elements ? { ...a, ...(name ? { name } : {}), ...(elements ? { elements } : {}) } : a;
}

export function useApp(): AppCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp doit être utilisé sous <AppProvider>");
  return ctx;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [customAssets, setCustomAssets] = useState<Asset[]>([]);
  const [customTemplates, setCustomTemplates] = useState<Template[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [builtinNames, setBuiltinNames] = useState<Record<string, string>>({});
  const [builtinContents, setBuiltinContents] = useState<Record<string, El[]>>({});
  const [libraryReady, setLibraryReady] = useState(false);
  const [examples, setExamples] = useState<Example[] | null>(null);
  const [examplesError, setExamplesError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextToast = useRef(1);

  const toast = useCallback((text: string, kind: Toast["kind"] = "info") => {
    const id = nextToast.current++;
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 7000 : 3200);
  }, []);

  const applyProfile = useCallback((p: Profile | null) => {
    // Même contenu : on garde le même objet, pour ne pas relancer ce qui dépend du profil.
    setProfile((prev) => (JSON.stringify(prev) === JSON.stringify(p) ? prev : p));
    setLoading(false);
  }, []);

  const applyLibrary = useCallback(
    (lib: { assets: Asset[]; templates: Template[]; hidden: string[]; names: Record<string, string>; contents: Record<string, El[]> } | Error) => {
      if (lib instanceof Error) {
        // Le pack de départ reste disponible même si la base ne répond pas.
        toast(lib.message || "Bibliothèque indisponible", "error");
      } else {
        setCustomAssets(lib.assets);
        setCustomTemplates(lib.templates);
        setHidden(new Set(lib.hidden));
        setBuiltinNames(lib.names);
        setBuiltinContents(lib.contents);
      }
      setLibraryReady(true);
    },
    [toast],
  );

  const applyExamples = useCallback((list: Example[] | Error) => {
    if (list instanceof Error) {
      // Pas de message intrusif : la rubrique affiche elle-même l'état (vide, ou à activer pour le staff).
      setExamples([]);
      setExamplesError(list.message);
    } else {
      setExamples(list);
      setExamplesError(null);
    }
  }, []);

  const refreshProfile = useCallback(async () => applyProfile(await fetchProfile()), [applyProfile]);
  const reloadLibrary = useCallback(async () => applyLibrary(await fetchLibrary()), [applyLibrary]);
  const reloadExamples = useCallback(async () => applyExamples(await fetchExamples()), [applyExamples]);

  useEffect(() => {
    let alive = true;
    const profileNow = () => fetchProfile().then((p) => alive && applyProfile(p));
    profileNow();
    fetchLibrary().then((lib) => alive && applyLibrary(lib));
    fetchExamples().then((list) => alive && applyExamples(list));
    const stop = data.onAuthChange(profileNow);
    return () => {
      alive = false;
      stop();
    };
  }, [applyProfile, applyLibrary, applyExamples]);

  const avatar = profile?.avatarUrl ?? null;

  const assets = useMemo(() => {
    const all = [...STARTER_ASSETS.filter((a) => !hidden.has(a.id)).map((a) => applyBuiltin(a, builtinNames, builtinContents)), ...customAssets];
    return all.map((a) => (a.kind === "elements" && a.elements ? { ...a, elements: resolveAvatarInEls(a.elements, avatar) } : a));
  }, [customAssets, hidden, avatar, builtinNames, builtinContents]);

  const templates = useMemo(() => {
    // Rangés par rang : la copie modifiée d'un modèle du pack prend la place de l'original.
    const all = [...STARTER_TEMPLATES.filter((t) => !hidden.has(t.id)).map((t) => (builtinNames[t.id] ? { ...t, name: builtinNames[t.id] } : t)), ...customTemplates].sort(
      (a, b) => a.sort - b.sort,
    );
    return all.map((t) => ({ ...t, slides: resolveAvatarInSlides(t.slides, avatar) }));
  }, [customTemplates, hidden, avatar, builtinNames]);

  const value = useMemo<AppCtx>(
    () => ({
      profile,
      loading,
      refreshProfile,
      assets,
      templates,
      customAssets,
      customTemplates,
      hidden,
      builtinNames,
      builtinContents,
      libraryReady,
      reloadLibrary,
      examples,
      examplesError,
      reloadExamples,
      toast,
    }),
    [profile, loading, refreshProfile, assets, templates, customAssets, customTemplates, hidden, builtinNames, builtinContents, libraryReady, reloadLibrary, examples, examplesError, reloadExamples, toast],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-5 left-1/2 z-[130] flex -translate-x-1/2 flex-col items-center gap-2" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={
              "pop-in pointer-events-auto max-w-[min(560px,90vw)] rounded-[14px] border-[2.5px] border-ink px-4 py-2.5 text-[15px] font-bold shadow-[3px_4px_0_#111] " +
              (t.kind === "error" ? "bg-coral text-ink" : t.kind === "ok" ? "bg-[#c8f5d2] text-ink" : "bg-ink text-white")
            }
          >
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
