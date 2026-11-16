import { Suspense } from "react";
import { DocRoute } from "@/components/editor/DocRoute";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <DocRoute kind="template" />
    </Suspense>
  );
}
