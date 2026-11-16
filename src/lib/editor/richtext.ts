"use client";

import { useEditor } from "./store";

/**
 * Couleur d'une partie du texte en cours d'édition (« mot en jaune »).
 * La sélection est mémorisée avant qu'un clic dans la barre d'outils ne la
 * fasse perdre, puis restaurée au moment d'appliquer la couleur.
 */

let saved: Range | null = null;

export function editingNode(): HTMLElement | null {
  const id = useEditor.getState().editingId;
  if (!id) return null;
  return document.querySelector<HTMLElement>(`[data-el-id="${id}"] .tx`);
}

export function rememberSelection() {
  const node = editingNode();
  const sel = window.getSelection();
  if (node && sel && sel.rangeCount && node.contains(sel.getRangeAt(0).commonAncestorContainer)) {
    saved = sel.getRangeAt(0).cloneRange();
  } else {
    saved = null;
  }
}

/** Colore la sélection de texte courante. Renvoie false s'il n'y a rien à colorer (aucun mot sélectionné). */
export function colorSelection(color: string): boolean {
  const node = editingNode();
  const sel = window.getSelection();
  if (!node || !sel) return false;
  let range = sel.rangeCount ? sel.getRangeAt(0) : null;
  if (!range || !node.contains(range.commonAncestorContainer)) {
    if (!saved) return false;
    range = saved;
    node.focus({ preventScroll: true });
    sel.removeAllRanges();
    sel.addRange(range);
  }
  if (range.collapsed) return false;
  // execCommand reste la seule façon de modifier une zone éditable en conservant l'annulation native.
  document.execCommand("styleWithCSS", false, "true");
  document.execCommand("foreColor", false, color);
  saved = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
  return true;
}
