// codegen.js

export function generateCode(nodes, edges, iid, fids) {
  if (!nodes.length) return "// Add states and transitions to generate code.";
  const nm = {};
  nodes.forEach((n) => (nm[n.id] = n.name));
  const sn = nodes.map((n) => n.name);
  const en = [...new Set(edges.map((e) => e.event))];
  const init = iid ? nm[iid] || "?" : "?";
  const gr = {};
  nodes.forEach((n) => (gr[n.id] = []));
  edges.forEach((e) => { if (gr[e.from]) gr[e.from].push(e); });

  let c = `type State = ${sn.map((s) => `"${s}"`).join(" | ") || "never"};\n\n`;
  c += `type Event = ${en.map((e) => `"${e}"`).join(" | ") || "never"};\n\n`;
  c += `function transition(state: State, event: Event): State {\n  switch (state) {\n`;
  nodes.forEach((n) => {
    c += `    case "${n.name}":\n      switch (event) {\n`;
    (gr[n.id] || []).forEach((e) => {
      c += `        case "${e.event}": return "${nm[e.to]}";\n`;
    });
    c += `        default: return state;\n      }\n`;
  });
  c += `    default: return state;\n  }\n}\n\n`;
  c += `// const [state, dispatch] = useReducer(transition, "${init}");\n`;
  c += `// const finalState = events.reduce(transition, "${init}");\n\n`;
  c += `// === ADVANCED: Type-safe dispatch ===\n\ntype TransitionMap = {\n`;
  nodes.forEach((n) => {
    const t = gr[n.id] || [];
    if (!t.length) c += `  "${n.name}": {};\n`;
    else {
      c += `  "${n.name}": {\n`;
      t.forEach((e) => { c += `    "${e.event}": "${nm[e.to]}";\n`; });
      c += `  };\n`;
    }
  });
  c += `};\n\ntype ValidEvent<S extends State> = keyof TransitionMap[S];\n`;
  c += `type NextState<S extends State, E extends ValidEvent<S>> = TransitionMap[S][E];\n\n`;
  c += `function typedDispatch<S extends State, E extends ValidEvent<S>>(state: S, event: E): NextState<S, E> {\n`;
  c += `  return (TransitionMap as any)[state][event];\n}\n`;
  return c;
}

export function highlightTS(code) {
  return code.split("\n").map((l) => {
    let h = l.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    if (h.trimStart().startsWith("//"))
      return `<span style="color:#6a737d">${h}</span>`;
    h = h.replace(
      /\b(type|function|switch|case|return|default|const|extends|keyof|any|as|never)\b/g,
      '<span style="color:#ff7b72">$1</span>'
    );
    h = h.replace(/"([^"]*)"/g, '<span style="color:#a5d6ff">"$1"</span>');
    h = h.replace(
      /\b(State|Event|TransitionMap|ValidEvent|NextState)\b/g,
      '<span style="color:#d2a8ff">$1</span>'
    );
    return h;
  }).join("\n");
}
