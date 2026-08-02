import React, { Fragment } from "react";
import { t } from "./locale.js";

// A message whose parameters are React nodes: `<T k="key" p={{ name: <strong>… }} />`.
// Markup mid-sentence must not be split into JSX fragments: that freezes French word order.
export default function T({ k, p }) {
  return (
    <>
      {t.parts(k, p).map((piece, i) => (
        <Fragment key={i}>{piece}</Fragment>
      ))}
    </>
  );
}
