"use client";

import { pagesLabel } from "./ExampleViewer";
import type { Example } from "@/lib/types";

/** Carte d'un exemple : couverture, titre, présentateur et nombre de pages. */
export function ExampleCard({ example, onOpen, width }: { example: Example; onOpen: () => void; width?: number }) {
  const cover = example.pages[0];
  return (
    <button
      className="group flex flex-none flex-col rounded-[16px] border-[3px] border-ink bg-white p-2.5 text-left shadow-[4px_5px_0_#111] transition-transform hover:-translate-y-0.5"
      style={{ width }}
      onClick={onOpen}
      title={`Feuilleter « ${example.title} »`}
      data-example-id={example.id}
    >
      <span className="relative block overflow-hidden rounded-[10px] border-[2.5px] border-ink bg-[#ffecc4]" style={{ aspectRatio: cover ? `${cover.w} / ${cover.h}` : "16 / 9" }}>
        {cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover.thumb} alt="" loading="lazy" className="block h-full w-full object-cover" draggable={false} />
        )}
        <span className="absolute bottom-1.5 right-1.5 rounded-full border-2 border-ink bg-white px-2 py-0.5 text-[11px] font-extrabold">{pagesLabel(example.pages.length)}</span>
      </span>
      <span className="mt-2 block truncate text-[16px] font-extrabold">{example.title}</span>
      <span className="block truncate text-[13px] font-semibold text-muted">{example.author ? `Présenté par ${example.author}` : example.description || " "}</span>
    </button>
  );
}
