"use client";

import { useRef } from "react";
import Link from "next/link";
import { ArrowRight, Check, Circle, CloudOff, Download, FileImage, FileText, FolderArchive, Image as ImageIcon, Loader2, Palette, Play, Redo2, Shapes, Square, Type, Undo2 } from "lucide-react";
import { Popover } from "@/components/ui/Popover";
import { SWATCHES } from "./ColorMenu";
import { useEditor } from "@/lib/editor/store";
import type { ShapeKind } from "@/lib/types";

function ToolBtn({ icon, label, onClick, testId }: { icon: React.ReactNode; label: string; onClick: () => void; testId?: string }) {
  return (
    <button
      className="flex h-[58px] w-[72px] flex-none flex-col items-center justify-center gap-0.5 rounded-[14px] border-[2.5px] border-ink bg-white text-[13px] font-extrabold shadow-[3px_3px_0_#111] transition-transform hover:-translate-x-px hover:-translate-y-px active:translate-x-0.5 active:translate-y-0.5"
      onClick={onClick}
      data-testid={testId}
    >
      {icon}
      {label}
    </button>
  );
}

export function TopBar({
  docLabel,
  back = { href: "/", label: "Retour à mes présentations" },
  onAddText,
  onAddShape,
  onAddImages,
  onShowBackgrounds,
  onExport,
  onPresent,
  onRetrySave,
}: {
  /** « modèle » quand le staff modifie un modèle plutôt qu'une présentation. */
  docLabel: string;
  /** Où mène le logo : l'accueil, ou le panel admin quand on modifie un modèle. */
  back?: { href: string; label: string };
  onAddText: () => void;
  onAddShape: (shape: ShapeKind) => void;
  onAddImages: (files: File[]) => void;
  onShowBackgrounds: () => void;
  onExport: (kind: "pdf" | "png" | "zip") => void;
  onPresent: () => void;
  onRetrySave: () => void;
}) {
  const title = useEditor((s) => s.title);
  const saveState = useEditor((s) => s.saveState);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const fileRef = useRef<HTMLInputElement>(null);
  const st = () => useEditor.getState();

  return (
    <header className="flex flex-none items-center gap-3 rounded-[22px] border-[3px] border-ink bg-sun px-3.5 py-2.5 shadow-[4px_5px_0_#111]" data-testid="topbar">
      <Link href={back.href} className="flex h-[50px] w-[52px] flex-none items-center justify-center rounded-[14px] bg-ink" title={back.label} aria-label={back.label} data-testid="editor-back">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/library/ms-logo.png" alt="MS Creators" className="h-[42px] w-[46px] object-contain" />
      </Link>

      <div className="flex min-w-[296px] max-w-[556px] flex-1 items-center gap-3" data-tour="doc-title">
        <label className="flex min-w-[160px] flex-1 flex-col">
          <span className="pl-1 text-[12px] font-extrabold leading-tight">Nom {docLabel}</span>
          <input
            className="h-[38px] w-full rounded-[11px] border-[2.5px] border-ink bg-white px-3 text-[17px] font-extrabold focus:outline-none focus:ring-[3px] focus:ring-white"
            value={title}
            onChange={(e) => st().setTitle(e.target.value)}
            placeholder="Sans titre"
            maxLength={120}
            data-testid="title-input"
          />
        </label>

        <div className="flex w-[124px] flex-none items-center gap-1.5 text-[13px] font-extrabold" aria-live="polite" data-testid="save-state" data-state={saveState}>
          {saveState === "saved" && (
            <>
              <Check size={16} strokeWidth={3.2} />
              Enregistré
            </>
          )}
          {saveState === "saving" && (
            <>
              <Loader2 size={16} strokeWidth={3} className="spin" />
              Enregistrement…
            </>
          )}
          {saveState === "dirty" && <span className="opacity-70">Modifications…</span>}
          {saveState === "error" && (
            <button className="flex items-center gap-1.5 rounded-lg bg-coral px-2 py-1 text-left leading-tight" onClick={onRetrySave} title="L'enregistrement a échoué. Clique pour réessayer.">
              <CloudOff size={16} strokeWidth={3} />
              Non enregistré · réessayer
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-none items-center gap-2">
        <ToolBtn icon={<Type size={22} strokeWidth={2.6} />} label="Texte" onClick={onAddText} testId="add-text" />
        <Popover
          align="center"
          width={196}
          button={({ toggle }) => <ToolBtn icon={<Shapes size={22} strokeWidth={2.4} />} label="Forme" onClick={toggle} testId="add-shape" />}
        >
          {(close) => (
            <div className="flex flex-col">
              {(
                [
                  ["rect", "Rectangle", <Square key="r" size={17} strokeWidth={3} />],
                  ["ellipse", "Rond", <Circle key="c" size={17} strokeWidth={3} />],
                  ["arrow", "Flèche", <ArrowRight key="a" size={17} strokeWidth={3} />],
                ] as const
              ).map(([kind, name, icon]) => (
                <button
                  key={kind}
                  className="flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-[14px] font-bold hover:bg-[#fff1cf]"
                  onClick={() => {
                    onAddShape(kind);
                    close();
                  }}
                  data-testid={`shape-${kind}`}
                >
                  {icon}
                  {name}
                </button>
              ))}
            </div>
          )}
        </Popover>
        <ToolBtn icon={<ImageIcon size={22} strokeWidth={2.4} />} label="Image" onClick={() => fileRef.current?.click()} testId="add-image" />
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
          className="hidden"
          data-testid="image-input"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length) onAddImages(files);
            e.target.value = "";
          }}
        />
        <Popover align="center" width={236} button={({ toggle }) => <ToolBtn icon={<Palette size={22} strokeWidth={2.4} />} label="Fond" onClick={toggle} testId="add-bg" />}>
          {(close) => (
            <div>
              <button
                className="nb-btn sun sm mb-3 w-full"
                onClick={() => {
                  onShowBackgrounds();
                  close();
                }}
              >
                Voir les fonds MS
              </button>
              <div className="mb-2 text-[13px] font-bold text-muted">Ou une couleur unie</div>
              <div className="grid grid-cols-6 gap-2">
                {SWATCHES.map((s) => (
                  <button
                    key={s.value}
                    className="h-8 w-8 rounded-full border-2 border-ink transition-transform hover:scale-110"
                    style={{ background: s.value }}
                    title={s.label}
                    onClick={() => st().setBackground({ kind: "color", color: s.value })}
                  />
                ))}
              </div>
              <label className="mt-3 flex cursor-pointer items-center gap-2 text-[13px] font-bold">
                <input
                  type="color"
                  className="h-8 w-10 cursor-pointer rounded border-2 border-ink bg-white p-0.5"
                  defaultValue="#ffcc55"
                  onChange={(e) => st().setBackground({ kind: "color", color: e.target.value })}
                />
                Autre couleur…
              </label>
            </div>
          )}
        </Popover>
      </div>

      <div className="mx-0.5 h-10 w-[2.5px] flex-none rounded bg-ink/25" />

      <div className="flex flex-none items-center">
        <button className="flex w-[62px] flex-col items-center gap-0.5 rounded-[10px] py-1 text-[12px] font-extrabold hover:bg-white/50 disabled:opacity-35" disabled={!canUndo} onClick={() => st().undo()} data-testid="undo">
          <Undo2 size={21} strokeWidth={2.6} />
          Annuler
        </button>
        <button className="flex w-[62px] flex-col items-center gap-0.5 rounded-[10px] py-1 text-[12px] font-extrabold hover:bg-white/50 disabled:opacity-35" disabled={!canRedo} onClick={() => st().redo()} data-testid="redo">
          <Redo2 size={21} strokeWidth={2.6} />
          Rétablir
        </button>
      </div>

      <div className="ml-auto flex flex-none items-center gap-2.5" data-tour="share">
        <Popover
          align="right"
          width={270}
          button={({ toggle }) => (
            <button className="nb-btn pill !px-5 !py-3 !text-[16px]" onClick={toggle} data-testid="download">
              <Download size={19} strokeWidth={2.8} />
              Télécharger
            </button>
          )}
        >
          {(close) => (
            <div className="flex flex-col">
              {(
                [
                  ["pdf", "PDF", "Toutes les diapos, prêt à partager", <FileText key="p" size={20} strokeWidth={2.4} />],
                  ["png", "Image PNG", "La diapo affichée", <FileImage key="i" size={20} strokeWidth={2.4} />],
                  ["zip", "Images PNG (ZIP)", "Une image par diapo", <FolderArchive key="z" size={20} strokeWidth={2.4} />],
                ] as const
              ).map(([kind, name, hint, icon]) => (
                <button
                  key={kind}
                  className="flex items-center gap-3 rounded-[10px] px-2.5 py-2 text-left hover:bg-[#fff1cf]"
                  onClick={() => {
                    close();
                    onExport(kind);
                  }}
                  data-testid={`export-${kind}`}
                >
                  {icon}
                  <span>
                    <span className="block text-[15px] font-extrabold leading-tight">{name}</span>
                    <span className="block text-[12px] font-semibold text-muted">{hint}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </Popover>
        <button className="nb-btn dark pill !px-5 !py-3 !text-[16px]" onClick={onPresent} data-testid="present-btn">
          <Play size={18} strokeWidth={3} fill="currentColor" />
          Présenter
        </button>
      </div>
    </header>
  );
}
