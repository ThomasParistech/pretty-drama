import React, { Fragment } from "react";
import { t } from "./locale.js";

// A message whose parameters are React nodes: `<T k="key" p={{ name: <strong>… }} />`.
//
// This exists because sentences on this site regularly carry markup mid-phrase (a
// <strong>, a <code>, an icon, a colour-bearing <span>), and the alternative is
// to cut the sentence into JSX fragments, which hard-codes French word order into
// the component. The worst case in the repo was the upload card of the Progress
// page: six fragments in four nested spans, where the order mattered because each
// colour follows its noun. Here the translator keeps the word order and the
// component keeps the markup.
//
// Every piece is wrapped in a keyed Fragment, including the plain strings. Text
// nodes do not need a key, but mixing keyed and unkeyed children in one array is
// the sort of thing that earns a console warning after a refactor, and the extra
// wrappers cost nothing.
export default function T({ k, p }) {
  return (
    <>
      {t.parts(k, p).map((piece, i) => (
        <Fragment key={i}>{piece}</Fragment>
      ))}
    </>
  );
}
