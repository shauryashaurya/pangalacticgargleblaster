// validation.js

export function validateMachine(m, key) {
  const d = [], k = key || "(current)";
  if (!m) { d.push({ severity: "error", msg: `[${k}] Machine is null.` }); return d; }
  if (!Array.isArray(m.nodes) || m.nodes.length === 0) { d.push({ severity: "error", msg: `[${k}] No nodes.` }); return d; }
  if (!Array.isArray(m.edges)) { d.push({ severity: "error", msg: `[${k}] edges not an array.` }); return d; }

  const nids = new Set(), nnames = new Set();
  m.nodes.forEach((n, i) => {
    if (!n.id) d.push({ severity: "error", msg: `[${k}] Node[${i}] no id.` });
    if (!n.name) d.push({ severity: "warn", msg: `[${k}] Node "${n.id}" empty name.` });
    if (typeof n.x !== "number" || typeof n.y !== "number")
      d.push({ severity: "warn", msg: `[${k}] Node "${n.id}" non-numeric coords.` });
    if (nids.has(n.id)) d.push({ severity: "error", msg: `[${k}] Dup node id "${n.id}".` });
    nids.add(n.id);
    if (nnames.has(n.name)) d.push({ severity: "warn", msg: `[${k}] Dup node name "${n.name}".` });
    nnames.add(n.name);
  });

  const eids = new Set(), tm = {};
  m.edges.forEach((e, i) => {
    if (!e.id) d.push({ severity: "error", msg: `[${k}] Edge[${i}] no id.` });
    if (eids.has(e.id)) d.push({ severity: "error", msg: `[${k}] Dup edge id "${e.id}".` });
    eids.add(e.id);
    if (e.from && !nids.has(e.from))
      d.push({ severity: "error", msg: `[${k}] Edge "${e.id}" unknown from "${e.from}".` });
    if (e.to && !nids.has(e.to))
      d.push({ severity: "error", msg: `[${k}] Edge "${e.id}" unknown to "${e.to}".` });
    if (!e.event) d.push({ severity: "warn", msg: `[${k}] Edge "${e.id}" empty event.` });
    const tk = `${e.from}::${e.event}`;
    if (tm[tk]) d.push({ severity: "warn", msg: `[${k}] Nondet: (${e.from}, ${e.event}).` });
    tm[tk] = true;
  });

  if (m.initialStateId && !nids.has(m.initialStateId))
    d.push({ severity: "error", msg: `[${k}] initialStateId "${m.initialStateId}" unknown.` });
  if (!m.initialStateId)
    d.push({ severity: "warn", msg: `[${k}] No initial state.` });
  if (Array.isArray(m.finalStateIds)) {
    m.finalStateIds.forEach((f) => {
      if (!nids.has(f)) d.push({ severity: "error", msg: `[${k}] finalStateIds unknown "${f}".` });
    });
  }
  if (d.length === 0)
    d.push({ severity: "ok", msg: `[${k}] Valid. ${m.nodes.length}S ${m.edges.length}E.` });
  return d;
}

export function validatePresetFile(data) {
  const d = [];
  if (!data || typeof data !== "object") {
    d.push({ severity: "error", msg: "Not a valid JSON object." });
    return { diags: d, machines: {} };
  }
  if (data.format && data.format !== "typestate-fsm")
    d.push({ severity: "warn", msg: `Format: "${data.format}" (expected "typestate-fsm").` });
  if (data.version)
    d.push({ severity: "info", msg: `Version: ${data.version}` });

  const machines = data.machines || data;
  if (typeof machines !== "object" || Array.isArray(machines)) {
    d.push({ severity: "error", msg: "No 'machines' object found." });
    return { diags: d, machines: {} };
  }

  const valid = {};
  let total = 0, ok = 0;
  Object.entries(machines).forEach(([key, m]) => {
    if (["version", "format", "description", "schema"].includes(key)) return;
    total++;
    const md = validateMachine(m, key);
    if (!md.some((x) => x.severity === "error")) { valid[key] = m; ok++; }
    d.push(...md);
  });
  d.unshift({ severity: "info", msg: `Parsed ${total} entries, ${ok} valid.` });
  return { diags: d, machines: valid };
}
