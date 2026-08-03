import React, { Fragment } from "react";
import { t } from "./locale.ts";
import type { ReactNode } from "react";

// A message whose parameters are React nodes: `<T k="key" p={{ name: <strong>… }} />`.
// Markup mid-sentence must not be split into JSX fragments: that freezes French word order.
export default function T({ k, p }: { k: string; p?: Record<string, ReactNode> }) {
  return (
    <>
      {t.parts(k, p).map((piece, i) => (
        // Cast here and not in the engine: i18n.ts holds no React import ON PURPOSE
        // (it runs under `node --test`), so the pieces come back untyped and this
        // component is the one place that knows they are nodes.
        <Fragment key={i}>{piece as ReactNode}</Fragment>
      ))}
    </>
  );
}
