/* PINCH operations team. Simulation uses the prototype's seven; in live mode the app replaces them with the
   operators table and the signed-in operator (setOperators). ES module exports are live bindings, so every
   importer sees the update. */
export let ME = "Federico";
export let OPS = ["Federico", "Jake", "Priya", "Luis", "Dana", "Omar", "Kelly"];

export function setOperators(me: string, ops: string[]) {
  ME = me;
  OPS = ops.includes(me) ? ops : [me, ...ops];
}
