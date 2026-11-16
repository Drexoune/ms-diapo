"use client";

import { useParams } from "next/navigation";
import { EditorScreen } from "./EditorScreen";

export function DocRoute({ kind }: { kind: "deck" | "template" }) {
  const { id } = useParams<{ id: string }>();
  // La clé force un éditeur neuf quand on passe d'un document à un autre.
  return <EditorScreen key={`${kind}:${id}`} docKind={kind} docId={id} />;
}
