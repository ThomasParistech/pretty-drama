// The style a dnd-kit sortable wears while it moves, written once for the editor's
// three of them (a line, an act, a scene). Pure, so it stays under `node --test`.
// `translate3d` spelled out rather than `CSS.Transform.toString`: that ONE call was the
// whole reason to depend on @dnd-kit/utilities directly. The scale factors it also
// writes are always 1 here, both lists using `verticalListSortingStrategy`.
// `undefined` on a null transform, like dnd-kit's own helper: React then writes no
// `transform` at all rather than an invalid one.
// ROUNDED, as dnd-kit rounds: a sub-pixel translate3d blurs the text of the row being
// dragged, which is the one being read. Same reason `x ? … : 0` guards a NaN or a
// missing offset, which would void the whole declaration.
const px = (value) => (value ? Math.round(value) : 0);

export function dragStyle(transform, transition, isDragging) {
  return {
    transform: transform ? `translate3d(${px(transform.x)}px, ${px(transform.y)}px, 0)` : undefined,
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
}
