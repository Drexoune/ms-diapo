"use client";

import { useMemo, useState } from "react";
import { Plus, Search, Settings2 } from "lucide-react";
import Link from "next/link";
import { ElementsThumb } from "@/components/slide/SlideView";
import { useApp } from "@/lib/app";
import { ASSET_CATEGORIES, type Asset, type AssetCategory } from "@/lib/types";

const CARD_W = 164;
const THUMB_H = 98;

export function AssetThumb({ asset, width = CARD_W - 20, height = THUMB_H }: { asset: Asset; width?: number; height?: number }) {
  if (asset.kind === "image" && asset.url) {
    const isBg = asset.category === "fonds";
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={asset.url}
        alt=""
        draggable={false}
        loading="lazy"
        style={{ width, height, objectFit: isBg ? "cover" : "contain", padding: isBg ? 0 : 8, display: "block" }}
      />
    );
  }
  return <ElementsThumb els={asset.elements ?? []} width={width} height={height} />;
}

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function LibraryPanel({
  category,
  onCategory,
  onInsert,
  onAdd,
  bgForAll,
  onBgForAll,
}: {
  category: AssetCategory;
  onCategory: (c: AssetCategory) => void;
  onInsert: (asset: Asset) => void;
  /** Ajout rapide par le staff dans la catégorie affichée. */
  onAdd: (category: AssetCategory) => void;
  bgForAll: boolean;
  onBgForAll: (v: boolean) => void;
}) {
  const { assets, profile, libraryReady } = useApp();
  const [query, setQuery] = useState("");

  const shown = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return assets.filter((a) => a.category === category);
    return assets.filter((a) => normalize(a.name).includes(q) || a.tags.some((t) => normalize(t).includes(q)));
  }, [assets, category, query]);

  return (
    <section className="nb flex h-[236px] flex-none flex-col overflow-hidden" data-testid="library">
      <div className="flex items-center gap-3 px-4 pb-2 pt-3">
        <h2 className="display mr-1 text-[21px]">Bibliothèque</h2>
        <div className="scroll-thin flex min-w-0 flex-1 items-center gap-2 overflow-x-auto py-1" role="tablist">
          {ASSET_CATEGORIES.map((c) => (
            <button
              key={c.id}
              role="tab"
              aria-selected={!query && category === c.id}
              className={"chip " + (!query && category === c.id ? "on" : "")}
              onClick={() => {
                setQuery("");
                onCategory(c.id);
              }}
            >
              {c.label}
            </button>
          ))}
          {category === "fonds" && !query && (
            <label className="ml-2 flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-[13px] font-bold">
              <input type="checkbox" className="h-4 w-4 accent-[#111]" checked={bgForAll} onChange={(e) => onBgForAll(e.target.checked)} />
              Sur toutes les diapos
            </label>
          )}
        </div>
        {profile?.isStaff && (
          <Link href="/admin" className="ic-btn whitespace-nowrap" title="Gérer la bibliothèque et les modèles (staff)">
            <Settings2 size={17} strokeWidth={2.6} />
            Gérer
          </Link>
        )}
        <label className="relative w-[230px] flex-none">
          <Search size={16} strokeWidth={3} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            className="h-10 w-full rounded-full border-[2.5px] border-ink bg-[#fff7e6] pl-9 pr-3 text-[14px] font-bold placeholder:text-muted focus:bg-white focus:outline-none"
            placeholder="Chercher un élément…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Chercher dans la bibliothèque"
          />
        </label>
      </div>

      <div className="scroll-thin flex min-h-0 flex-1 items-start gap-3 overflow-x-auto overflow-y-hidden px-4 pb-3 pt-1">
        {profile?.isStaff && !query && (
          <button
            className="flex h-[142px] flex-none flex-col items-center justify-center gap-1.5 rounded-[14px] border-[2.5px] border-dashed border-ink bg-white text-[13px] font-extrabold hover:bg-sun"
            style={{ width: 118 }}
            onClick={() => onAdd(category)}
            title="Ajouter un élément à cette catégorie (staff)"
            data-testid="library-add"
          >
            <Plus size={22} strokeWidth={3} />
            Ajouter
          </button>
        )}
        {shown.map((asset) => (
          <button
            key={asset.id}
            className="group flex flex-none flex-col rounded-[14px] border-[2.5px] border-ink bg-white p-2 text-left shadow-[3px_3px_0_#111] transition-transform hover:-translate-y-0.5 active:translate-y-0.5"
            style={{ width: CARD_W }}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "copy";
              e.dataTransfer.setData("application/x-ms-asset", asset.id);
            }}
            onClick={() => onInsert(asset)}
            title={asset.category === "fonds" ? `Appliquer le fond « ${asset.name} »` : `Ajouter « ${asset.name} » à la diapo`}
            data-asset-id={asset.id}
          >
            <span
              className="block overflow-hidden rounded-[9px] border-2 border-ink"
              style={{ background: "radial-gradient(circle at 50% 45%, #ffecc4, #ffcf8a)" }}
            >
              <AssetThumb asset={asset} />
            </span>
            <span className="mt-1.5 block truncate px-0.5 text-[13px] font-extrabold">{asset.name}</span>
          </button>
        ))}
        {libraryReady && !shown.length && (
          <div className="flex h-[142px] flex-1 items-center justify-center text-[15px] font-bold text-muted">
            {query ? `Aucun élément pour « ${query} »` : "Cette catégorie est vide pour l'instant."}
          </div>
        )}
      </div>
    </section>
  );
}
