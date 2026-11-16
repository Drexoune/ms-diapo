"use client";

import { Ban } from "lucide-react";
import { Popover } from "@/components/ui/Popover";
import { GOLD_FILL, PALETTE } from "@/lib/factory";

/** Couleurs de la charte MS Creators, dans l'ordre où on les cherche. */
export const SWATCHES: { value: string; label: string }[] = [
  { value: PALETTE.white, label: "Blanc" },
  { value: "#000000", label: "Noir" },
  { value: PALETTE.yellow, label: "Jaune MS" },
  { value: PALETTE.orange, label: "Orange" },
  { value: PALETTE.peach, label: "Pêche" },
  { value: PALETTE.cream, label: "Crème" },
  { value: PALETTE.coral, label: "Corail" },
  { value: PALETTE.pink, label: "Rose" },
  { value: PALETTE.green, label: "Vert clair" },
  { value: PALETTE.forest, label: "Vert foncé" },
  { value: PALETTE.blue, label: "Bleu" },
  { value: PALETTE.lilac, label: "Lilas" },
  { value: PALETTE.gray, label: "Gris clair" },
  { value: PALETTE.dark, label: "Gris foncé" },
];

export const GOLD_SWATCH = { value: GOLD_FILL, label: "Doré" };

export function Swatch({ color, size = 22 }: { color: string | null; size?: number }) {
  return (
    <span
      className="inline-block flex-none rounded-full border-2 border-ink"
      style={{
        width: size,
        height: size,
        background: color ?? "repeating-linear-gradient(45deg,#fff,#fff 3px,#ddd 3px,#ddd 6px)",
      }}
    />
  );
}

export function ColorMenu({
  value,
  onPick,
  label,
  allowNone,
  withGold,
  icon,
  text,
}: {
  value: string | null;
  onPick: (color: string | null) => void;
  label: string;
  allowNone?: boolean;
  withGold?: boolean;
  icon?: React.ReactNode;
  /** Libellé court affiché dans le bouton. */
  text?: string;
}) {
  const list = withGold ? [...SWATCHES, GOLD_SWATCH] : SWATCHES;
  const isHex = !!value && /^#[0-9a-f]{6}$/i.test(value);
  return (
    <Popover
      width={236}
      button={({ open, toggle }) => (
        <button
          className={"ic-btn " + (open ? "on" : "")}
          onMouseDown={(e) => e.preventDefault()}
          onClick={toggle}
          title={label}
          aria-label={label}
        >
          {icon}
          {text}
          <Swatch color={value} />
        </button>
      )}
    >
      {() => (
        <div>
          <div className="mb-2 text-[13px] font-bold text-muted">{label}</div>
          <div className="grid grid-cols-6 gap-2">
            {allowNone && (
              <button className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-ink bg-white" onClick={() => onPick(null)} title="Aucun">
                <Ban size={16} />
              </button>
            )}
            {list.map((s) => (
              <button
                key={s.value}
                className={"h-8 w-8 rounded-full border-2 border-ink transition-transform hover:scale-110 " + (value === s.value ? "ring-[3px] ring-blue ring-offset-1" : "")}
                style={{ background: s.value }}
                onClick={() => onPick(s.value)}
                title={s.label}
                aria-label={s.label}
              />
            ))}
          </div>
          <label className="mt-3 flex cursor-pointer items-center gap-2 text-[13px] font-bold">
            <input
              type="color"
              className="h-8 w-10 cursor-pointer rounded border-2 border-ink bg-white p-0.5"
              value={isHex ? value! : "#ffcc55"}
              onChange={(e) => onPick(e.target.value)}
            />
            Autre couleur…
          </label>
        </div>
      )}
    </Popover>
  );
}
