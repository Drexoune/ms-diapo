"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { data } from "./backend";
import { STARTER_ASSETS, STARTER_TEMPLATES, resolveAvatarInEls, resolveAvatarInSlides } from "./starter";
import type { Asset, Profile, Template } from "./types";

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
  libraryReady: boolean;
  reloadLibrary: () => Promise<void>;
  toast: (text: string, kind?: Toast["kind"]) => void;
}

const Ctx = createContext<AppCtx | null>(null);

const fetchProfile = (): Promise<Profile | null> => data.getProfile().catch(() => null);

const fetchLibrary = () =>
  Promise.all([data.listAssets(), data.listTemplates(), data.listHidden()])
    .then(([assets, templates, hidden]) => ({ assets, templates, hidden }))
    .catch((e: unknown) => (e instanceof Error ? e : new Error("Bibliothèque indisponible")));

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
  const [libraryReady, setLibraryReady] = useState(false);
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
    (lib: { assets: Asset[]; templates: Template[]; hidden: string[] } | Error) => {
      if (lib instanceof Error) {
        // Le pack de départ reste disponible même si la base ne répond pas.
        toast(lib.message || "Bibliothèque indisponible", "error");
      } else {
        setCustomAssets(lib.assets);
        setCustomTemplates(lib.templates);
        setHidden(new Set(lib.hidden));
      }
      setLibraryReady(true);
    },
    [toast],
  );

  const refreshProfile = useCallback(async () => applyProfile(await fetchProfile()), [applyProfile]);
  const reloadLibrary = useCallback(async () => applyLibrary(await fetchLibrary()), [applyLibrary]);

  useEffect(() => {
    let alive = true;
    const profileNow = () => fetchProfile().then((p) => alive && applyProfile(p));
    profileNow();
    fetchLibrary().then((lib) => alive && applyLibrary(lib));
    const stop = data.onAuthChange(profileNow);
    return () => {
      alive = false;
      stop();
    };
  }, [applyProfile, applyLibrary]);

  const avatar = profile?.avatarUrl ?? null;

  const assets = useMemo(() => {
    const all = [...STARTER_ASSETS.filter((a) => !hidden.has(a.id)), ...customAssets];
    return all.map((a) => (a.kind === "elements" && a.elements ? { ...a, elements: resolveAvatarInEls(a.elements, avatar) } : a));
  }, [customAssets, hidden, avatar]);

  const templates = useMemo(() => {
    const all = [...STARTER_TEMPLATES.filter((t) => !hidden.has(t.id)), ...customTemplates];
    return all.map((t) => ({ ...t, slides: resolveAvatarInSlides(t.slides, avatar) }));
  }, [customTemplates, hidden, avatar]);

  const value = useMemo<AppCtx>(
    () => ({ profile, loading, refreshProfile, assets, templates, customAssets, customTemplates, hidden, libraryReady, reloadLibrary, toast }),
    [profile, loading, refreshProfile, assets, templates, customAssets, customTemplates, hidden, libraryReady, reloadLibrary, toast],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-5 left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-2" aria-live="polite">
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
