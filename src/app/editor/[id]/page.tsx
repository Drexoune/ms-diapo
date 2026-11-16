import { Suspense } from "react";
import { DocRoute } from "@/components/editor/DocRoute";

export default function Page() {
  // L'identifiant de la présentation n'est connu qu'à la requête : il est lu côté navigateur, sous Suspense.
  return (
    <Suspense fallback={null}>
      <DocRoute kind="deck" />
    </Suspense>
  );
}
