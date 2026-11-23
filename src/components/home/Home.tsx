"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Compass, Copy, FilePlus2, Loader2, LogOut, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { ExamplesSection } from "@/components/examples/ExamplesSection";
import { Confirm } from "@/components/ui/Modal";
import { FluidThumb, SlideThumb } from "@/components/slide/SlideView";
import { useApp } from "@/lib/app";
import { data, enterGuest } from "@/lib/backend";
import { isOnboardedHere, setLocalStaff } from "@/lib/backend/local";
import { startTour, useTour } from "@/lib/tour";
import { cloneSlides } from "@/lib/ids";
import { STARTER_TEMPLATES, firstSlide, resolveAvatarInSlides } from "@/lib/starter";
import type { DeckMeta, Slide } from "@/lib/types";

const errorText = (e: unknown) => (e instanceof Error ? e.message : "Une erreur est survenue");

function DiscordIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

function Brand({ size = 44 }: { size?: number }) {
  return (
    <span className="flex items-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/library/ms-logo.png" alt="" style={{ height: size, width: size * 1.14 }} className="object-contain" />
      <span className="display" style={{ fontSize: size * 0.62 }}>
        MS Diapos
      </span>
    </span>
  );
}

/* ───────────── Écran de connexion ───────────── */

function Landing() {
  const { toast } = useApp();
  const [busy, setBusy] = useState(false);
  // Retour de Discord avec une erreur (accès refusé, lien expiré…) : lue une fois, dans l'URL de retour.
  const [authError] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search + "&" + window.location.hash.slice(1));
    const description = params.get("error_description") ?? params.get("error");
    return description ? description.replace(/\+/g, " ") : null;
  });
  const preview = ["ouverture", "quatre-cartes", "phrase-choc", "avant-apres", "planning-6", "objectifs"]
    .map((id) => STARTER_TEMPLATES.find((t) => t.id === `b:modele-${id}`))
    .filter((t): t is NonNullable<typeof t> => !!t);

  const signIn = async () => {
    setBusy(true);
    try {
      await data.signIn();
    } catch (e) {
      toast(errorText(e), "error");
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-full flex-col items-center overflow-hidden px-5 py-10">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/library/fonds/creme-croix.svg" alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
      <div className="relative flex w-full max-w-[1080px] flex-1 flex-col items-center justify-center gap-8 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/library/ms-logo.png" alt="MS Creators" className="h-[150px] w-[170px] object-contain drop-shadow-[-4px_5px_0_#000]" />
        <h1
          className="display text-[clamp(44px,8vw,104px)] text-white"
          style={{ WebkitTextStroke: "0.14em #000", paintOrder: "stroke fill", filter: "drop-shadow(-0.055em 0.075em 0 #000)" }}
        >
          MS Diapos
        </h1>
        <p className="max-w-[640px] text-[clamp(17px,2.2vw,22px)] font-bold leading-snug">
          Crée tes diapos aux couleurs de MS Creators : choisis un modèle, écris ton texte, présente. Pas besoin de savoir faire du design.
        </p>
        <button className="nb-btn !rounded-[18px] !border-[3px] !bg-[#5865f2] !px-7 !py-4 !text-[19px] !text-white !shadow-[5px_6px_0_#111]" onClick={signIn} disabled={busy} data-testid="signin">
          {busy ? <Loader2 className="spin" size={22} strokeWidth={3} /> : <DiscordIcon />}
          Se connecter avec Discord
        </button>
        <div className="-mt-3 flex flex-col items-center gap-1.5">
          <button className="nb-btn !rounded-[14px] !px-5 !py-2.5 !text-[16px]" onClick={enterGuest} data-testid="guest">
            <UserRound size={18} strokeWidth={2.8} />
            Essayer sans compte
          </button>
          <span className="text-[13px] font-bold text-muted">Mode invité : tes présentations restent dans ce navigateur.</span>
        </div>
        {authError && (
          <p className="max-w-[560px] rounded-[14px] border-[2.5px] border-ink bg-coral px-4 py-2.5 text-[15px] font-bold" role="alert">
            La connexion n&apos;a pas abouti : {authError}
          </p>
        )}
        <div className="mt-2 flex flex-wrap justify-center gap-4">
          {preview.map((t, i) => (
            <div
              key={t.id}
              className="overflow-hidden rounded-[12px] border-[3px] border-ink shadow-[4px_5px_0_#111]"
              style={{ transform: `rotate(${[-2, 1.5, -1, 2, -1.5, 1][i]}deg)` }}
            >
              <SlideThumb slide={resolveAvatarInSlides(t.slides, null)[0]} width={300} />
            </div>
          ))}
        </div>
      </div>
      <p className="relative mt-8 text-[13px] font-bold text-muted">
        Discord sert seulement à te reconnaître et à vérifier ton rôle sur le serveur MS Creators. Aucun message n&apos;est lu ni envoyé.
      </p>
    </div>
  );
}

/* ───────────── Tableau de bord ───────────── */

const rtf = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });

function ago(iso: string): string {
  const s = (Date.parse(iso) - Date.now()) / 1000;
  const abs = Math.abs(s);
  if (abs < 60) return "à l'instant";
  if (abs < 3600) return rtf.format(Math.round(s / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(s / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(s / 86400), "day");
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

function Dashboard() {
  const router = useRouter();
  const { profile, templates, toast, refreshProfile } = useApp();
  const [decks, setDecks] = useState<DeckMeta[] | null>(null);
  const [creating, setCreating] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<DeckMeta | null>(null);

  // Première connexion : la visite guidée démarre d'elle-même, une seule fois par compte.
  useEffect(() => {
    if (!profile || profile.onboarded || isOnboardedHere(profile.id) || useTour.getState().steps) return;
    startTour("full", { name: profile.name, isStaff: profile.isStaff });
    data.markOnboarded().catch(() => undefined);
  }, [profile]);

  const fetchDecks = useCallback(
    () =>
      data.listDecks().catch((e: unknown) => {
        toast(errorText(e), "error");
        return [] as DeckMeta[];
      }),
    [toast],
  );
  const reload = useCallback(async () => setDecks(await fetchDecks()), [fetchDecks]);

  useEffect(() => {
    let alive = true;
    fetchDecks().then((d) => alive && setDecks(d));
    return () => {
      alive = false;
    };
  }, [fetchDecks]);

  const create = async (key: string, title: string, slides: Slide[]) => {
    if (creating) return;
    setCreating(key);
    try {
      const deck = await data.createDeck({ title, slides });
      router.push(`/editor/${deck.id}`);
    } catch (e) {
      toast(errorText(e), "error");
      setCreating(null);
    }
  };

  const duplicate = async (meta: DeckMeta) => {
    try {
      const deck = await data.getDeck(meta.id);
      if (!deck) return;
      await data.createDeck({ title: `${deck.title} (copie)`, slides: cloneSlides(deck.slides) });
      toast("Présentation dupliquée", "ok");
      reload();
    } catch (e) {
      toast(errorText(e), "error");
    }
  };

  const remove = async (meta: DeckMeta) => {
    try {
      await data.deleteDeck(meta.id);
      setDecks((d) => (d ?? []).filter((x) => x.id !== meta.id));
      toast("Présentation supprimée");
    } catch (e) {
      toast(errorText(e), "error");
    }
  };

  const avatar = profile?.avatarUrl ?? null;
  const deckTemplates = templates.filter((t) => t.kind === "deck");
  const blank = resolveAvatarInSlides([firstSlide()], avatar);

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[1280px] flex-col gap-7 px-5 py-6">
      <header className="flex flex-wrap items-center gap-4 rounded-[22px] border-[3px] border-ink bg-sun px-5 py-3 shadow-[4px_5px_0_#111]">
        <Brand />
        <div className="ml-auto flex items-center gap-3">
          {profile?.isStaff && (
            <Link href="/admin" className="nb-btn sm" data-testid="admin-link" data-tour="admin">
              <ShieldCheck size={16} strokeWidth={2.8} />
              Panel admin
            </Link>
          )}
          <button
            className="nb-btn sm"
            onClick={() => profile && startTour("full", { name: profile.name, isStaff: profile.isStaff })}
            title="Revoir la visite guidée"
            data-testid="replay-tour"
          >
            <Compass size={16} strokeWidth={2.8} />
            Visite guidée
          </button>
          <span className="flex items-center gap-2.5 rounded-full border-[2.5px] border-ink bg-white py-1 pl-1 pr-3.5 text-[14px] font-extrabold">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={avatar || "/library/avatar-defaut.svg"} alt="" className="h-8 w-8 rounded-full border-2 border-ink object-cover" />
            {profile?.name}
          </span>
          {data.mode !== "local" && (
            <button
              className="ic-btn"
              onClick={() => data.signOut()}
              title={data.mode === "guest" ? "Quitter le mode invité" : "Se déconnecter"}
              aria-label={data.mode === "guest" ? "Quitter le mode invité" : "Se déconnecter"}
              data-testid="signout"
            >
              <LogOut size={19} strokeWidth={2.6} />
            </button>
          )}
        </div>
      </header>

      {data.mode === "local" && (
        <div className="flex flex-wrap items-center gap-3 rounded-[16px] border-[2.5px] border-dashed border-ink bg-white px-4 py-3 text-[14px] font-bold">
          <span>
            <b className="font-extrabold">Mode démo local</b> — Supabase n&apos;est pas configuré : pas de compte, les présentations restent dans ce navigateur.
          </span>
          <label className="ml-auto flex cursor-pointer items-center gap-2">
            <input type="checkbox" className="h-4 w-4 accent-[#111]" checked={!!profile?.isStaff} onChange={(e) => setLocalStaff(e.target.checked)} data-testid="demo-staff" />
            Simuler le rôle staff
          </label>
        </div>
      )}

      {data.mode === "guest" && (
        <div className="flex flex-wrap items-center gap-3 rounded-[16px] border-[2.5px] border-dashed border-ink bg-white px-4 py-3 text-[14px] font-bold" data-testid="guest-banner">
          <span>
            <b className="font-extrabold">Mode invité</b> — tes présentations restent dans ce navigateur, sur cet appareil. Connecte-toi avec Discord pour les retrouver partout.
          </span>
          <button className="nb-btn sm ml-auto !bg-[#5865f2] !text-white" onClick={() => data.signIn().catch((e) => toast(errorText(e), "error"))} data-testid="guest-signin">
            <DiscordIcon size={16} />
            Se connecter avec Discord
          </button>
        </div>
      )}

      {profile?.staffStale && (
        <div className="flex flex-wrap items-center gap-3 rounded-[16px] border-[2.5px] border-ink bg-[#ffd6d6] px-4 py-3 text-[14px] font-bold">
          <span>Ton rôle staff n&apos;a pas été vérifié depuis plus de 7 jours. Reconnecte-toi pour retrouver le panel admin.</span>
          <button
            className="nb-btn sm ml-auto"
            onClick={async () => {
              await data.signOut();
              await refreshProfile();
            }}
          >
            Me reconnecter
          </button>
        </div>
      )}

      <section data-tour="new-deck">
        <h2 className="display mb-3 text-[24px]">Nouvelle présentation</h2>
        <div className="scroll-thin flex gap-4 overflow-x-auto pb-3 pl-0.5 pt-0.5">
          <button
            className="group flex w-[236px] flex-none flex-col rounded-[16px] border-[3px] border-ink bg-white p-2.5 text-left shadow-[4px_5px_0_#111] transition-transform hover:-translate-y-0.5"
            onClick={() => create("blank", "Ma présentation", blank)}
            data-testid="new-blank"
          >
            <span className="relative block overflow-hidden rounded-[10px] border-[2.5px] border-ink">
              <SlideThumb slide={blank[0]} width={210} />
              <span className="absolute inset-0 flex items-center justify-center bg-white/55 opacity-0 transition-opacity group-hover:opacity-100">
                {creating === "blank" ? <Loader2 className="spin" size={30} strokeWidth={3} /> : <FilePlus2 size={34} strokeWidth={2.6} />}
              </span>
            </span>
            <span className="mt-2 text-[16px] font-extrabold">Partir de zéro</span>
            <span className="text-[13px] font-semibold text-muted">Une diapo de titre, prête à écrire</span>
          </button>
          {deckTemplates.map((t) => (
            <button
              key={t.id}
              className="group flex w-[236px] flex-none flex-col rounded-[16px] border-[3px] border-ink bg-white p-2.5 text-left shadow-[4px_5px_0_#111] transition-transform hover:-translate-y-0.5"
              onClick={() => create(t.id, t.name, cloneSlides(t.slides))}
              data-template-id={t.id}
            >
              <span className="relative block overflow-hidden rounded-[10px] border-[2.5px] border-ink">
                <SlideThumb slide={t.slides[1] ?? t.slides[0]} width={210} />
                {creating === t.id && (
                  <span className="absolute inset-0 flex items-center justify-center bg-white/60">
                    <Loader2 className="spin" size={30} strokeWidth={3} />
                  </span>
                )}
              </span>
              <span className="mt-2 truncate text-[16px] font-extrabold">{t.name}</span>
              <span className="text-[13px] font-semibold text-muted">Modèle · {t.slides.length} diapos</span>
            </button>
          ))}
        </div>
      </section>

      <ExamplesSection />

      <section className="flex-1" data-tour="my-decks">
        <h2 className="display mb-3 text-[24px]">Mes présentations</h2>
        {decks === null ? (
          <div className="flex items-center gap-3 py-10 text-[16px] font-extrabold">
            <Loader2 className="spin" size={22} strokeWidth={3} /> Chargement…
          </div>
        ) : decks.length === 0 ? (
          <div className="rounded-[18px] border-[2.5px] border-dashed border-ink bg-white px-6 py-10 text-center">
            <p className="text-[18px] font-extrabold">Tu n&apos;as pas encore de présentation.</p>
            <p className="mt-1 text-[15px] font-semibold text-muted">Choisis un modèle juste au-dessus : tu n&apos;auras plus qu&apos;à remplacer les textes.</p>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-5" data-testid="deck-grid">
            {decks.map((d) => (
              <div key={d.id} className="group relative rounded-[16px] border-[3px] border-ink bg-white p-2.5 shadow-[4px_5px_0_#111] transition-transform hover:-translate-y-0.5">
                <Link href={`/editor/${d.id}`} className="block" data-deck-id={d.id}>
                  <span className="block overflow-hidden rounded-[10px] border-[2.5px] border-ink bg-[#ffecc4]">
                    {d.cover ? <FluidThumb slide={d.cover} /> : <span className="block aspect-video" />}
                  </span>
                  <span className="mt-2 block truncate text-[16px] font-extrabold">{d.title || "Sans titre"}</span>
                  <span className="block text-[13px] font-semibold text-muted">
                    {d.slideCount} diapo{d.slideCount > 1 ? "s" : ""} · modifiée {ago(d.updatedAt)}
                  </span>
                </Link>
                <div className="absolute right-4 top-4 flex gap-1.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                  <button className="flex h-8 w-8 items-center justify-center rounded-[9px] border-[2.5px] border-ink bg-white hover:bg-sun" onClick={() => duplicate(d)} title="Dupliquer" aria-label="Dupliquer">
                    <Copy size={15} strokeWidth={2.8} />
                  </button>
                  <button className="flex h-8 w-8 items-center justify-center rounded-[9px] border-[2.5px] border-ink bg-white hover:bg-coral" onClick={() => setToDelete(d)} title="Supprimer" aria-label="Supprimer">
                    <Trash2 size={15} strokeWidth={2.8} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {toDelete && (
        <Confirm
          title="Supprimer la présentation ?"
          message={
            <>
              « {toDelete.title || "Sans titre"} » sera supprimée définitivement. Cette action ne peut pas être annulée.
            </>
          }
          confirmLabel="Supprimer"
          danger
          onConfirm={() => remove(toDelete)}
          onClose={() => setToDelete(null)}
        />
      )}
    </div>
  );
}

export function Home() {
  const { profile, loading } = useApp();
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center gap-3 text-[18px] font-extrabold">
        <Loader2 className="spin" size={24} strokeWidth={3} />
        Chargement…
      </div>
    );
  }
  return profile ? <Dashboard /> : <Landing />;
}
