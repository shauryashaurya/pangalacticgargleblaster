// algorithms.js

export function getReachable(nodes, edges, iid) {
  if (!iid) return new Set();
  const a = {};
  nodes.forEach((n) => (a[n.id] = []));
  edges.forEach((e) => { if (a[e.from]) a[e.from].push(e.to); });
  const v = new Set([iid]), q = [iid];
  while (q.length) {
    const c = q.shift();
    (a[c] || []).forEach((nb) => { if (!v.has(nb)) { v.add(nb); q.push(nb); } });
  }
  return v;
}

export function getDeadStates(nodes, edges, fids) {
  if (fids.length === 0) return new Set(nodes.map((n) => n.id));
  const ra = {};
  nodes.forEach((n) => (ra[n.id] = []));
  edges.forEach((e) => { if (ra[e.to]) ra[e.to].push(e.from); });
  const al = new Set(fids), q = [...fids];
  while (q.length) {
    const c = q.shift();
    (ra[c] || []).forEach((nb) => { if (!al.has(nb)) { al.add(nb); q.push(nb); } });
  }
  return new Set(nodes.filter((n) => !al.has(n.id)).map((n) => n.id));
}

export function checkDeterminism(edges) {
  const s = {}, d = [];
  edges.forEach((e) => {
    const k = `${e.from}::${e.event}`;
    if (s[k]) d.push({ state: e.from, event: e.event });
    else s[k] = 1;
  });
  return d;
}

export function getUnhandledEvents(nodes, edges) {
  const ae = [...new Set(edges.map((e) => e.event))], r = {};
  nodes.forEach((n) => {
    const h = new Set(edges.filter((e) => e.from === n.id).map((e) => e.event));
    const u = ae.filter((ev) => !h.has(ev));
    if (u.length > 0) r[n.name] = u;
  });
  return r;
}

export function hopcroftMinimize(nodes, edges, iid, fids) {
  if (!iid || nodes.length === 0) return null;
  const reach = getReachable(nodes, edges, iid);
  const rN = nodes.filter((n) => reach.has(n.id));
  if (rN.length === 0) return null;
  const ae = [...new Set(edges.map((e) => e.event))];
  const sids = rN.map((n) => n.id);
  const fs = new Set(fids);
  const tm = {};
  sids.forEach((s) => {
    tm[s] = {};
    ae.forEach((ev) => {
      const t = edges.find((e) => e.from === s && e.event === ev);
      tm[s][ev] = t ? t.to : null;
    });
  });
  const f = sids.filter((s) => fs.has(s));
  const nf = sids.filter((s) => !fs.has(s));
  let P = [];
  if (f.length) P.push(f);
  if (nf.length) P.push(nf);
  if (!P.length) return null;

  let chg = true, it = 0;
  while (chg && it < 200) {
    chg = false; it++;
    const nP = [];
    for (const p of P) {
      if (p.length <= 1) { nP.push(p); continue; }
      const gpi = (sid) => P.findIndex((pp) => pp.includes(sid));
      const sig = (sid) => ae.map((ev) => {
        const t = tm[sid][ev]; return t ? gpi(t) : -1;
      }).join(",");
      const g = {};
      p.forEach((s) => { const k = sig(s); if (!g[k]) g[k] = []; g[k].push(s); });
      const sp = Object.values(g);
      if (sp.length > 1) chg = true;
      nP.push(...sp);
    }
    P = nP;
  }

  const nm = {};
  rN.forEach((n) => (nm[n.id] = n));
  const gpfs = (sid) => P.findIndex((pp) => pp.includes(sid));
  const mN = P.map((p, i) => ({
    id: `min_${i}`,
    name: p.map((s) => nm[s]?.name || s).join("/"),
    x: 140 + (i % 4) * 140,
    y: 100 + Math.floor(i / 4) * 120,
  }));
  const meS = new Set(), mE = [];
  P.forEach((p, i) => {
    const rep = p[0];
    ae.forEach((ev) => {
      const t = tm[rep][ev];
      if (t) {
        const ti = gpfs(t);
        const k = `${i}::${ev}::${ti}`;
        if (!meS.has(k)) {
          meS.add(k);
          mE.push({ id: `me_${meS.size}`, from: `min_${i}`, to: `min_${ti}`, event: ev });
        }
      }
    });
  });
  return {
    nodes: mN, edges: mE,
    initialStateId: `min_${gpfs(iid)}`,
    finalStateIds: P.map((p, i) => p.some((s) => fs.has(s)) ? `min_${i}` : null).filter(Boolean),
  };
}

export function genStrings(nodes, edges, iid, fids, maxL) {
  if (!iid || fids.length === 0) return { accepted: [], rejected: [] };
  const fs = new Set(fids), adj = {};
  nodes.forEach((n) => (adj[n.id] = []));
  edges.forEach((e) => { if (adj[e.from]) adj[e.from].push({ to: e.to, event: e.event }); });
  const acc = [], rej = [], q = [{ s: iid, p: [] }], v = new Set([`${iid}::`]);
  while (q.length && (acc.length < 5 || rej.length < 5)) {
    const { s, p } = q.shift();
    if (p.length > 0 && p.length <= maxL) {
      if (fs.has(s) && acc.length < 5) acc.push(p.join(", "));
      else if (!fs.has(s) && rej.length < 5) rej.push(p.join(", "));
    }
    if (p.length < maxL) {
      (adj[s] || []).forEach(({ to, event }) => {
        const k = `${to}::${[...p, event]}`;
        if (!v.has(k)) { v.add(k); q.push({ s: to, p: [...p, event] }); }
      });
    }
  }
  return { accepted: acc, rejected: rej };
}
