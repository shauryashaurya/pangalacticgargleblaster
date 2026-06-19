// layout.js
// Layout engine powered by Cytoscape.js
// Install: npm install cytoscape cytoscape-dagre dagre

import cytoscape from "cytoscape";
import dagre from "cytoscape-dagre";

cytoscape.use(dagre);

// available layout algorithms
export const LAYOUT_ALGORITHMS = {
  auto:        { name: "Auto", description: "Picks best algorithm based on graph structure" },
  dagre:       { name: "Dagre (Hierarchical)", description: "Layered DAG layout via dagre" },
  cose:        { name: "CoSE (Force)", description: "Compound Spring Embedder, force-directed" },
  breadthfirst:{ name: "Breadthfirst", description: "Tree layout via BFS from root" },
  circle:      { name: "Circle", description: "Nodes on a circle in BFS order" },
  concentric:  { name: "Concentric", description: "Concentric rings by connectivity" },
  grid:        { name: "Grid", description: "Even grid placement" },
};

function buildCy(nodes, edges) {
  const elements = [
    ...nodes.map((n) => ({ data: { id: n.id }, position: { x: n.x || 0, y: n.y || 0 } })),
    ...edges
      .filter((e) => e.from !== e.to)
      .map((e) => ({ data: { id: e.id, source: e.from, target: e.to } })),
  ];
  return cytoscape({ headless: true, styleEnabled: false, elements });
}

function extractPositions(cy, nodes, opts) {
  const pad = opts?.padding || 60;
  const w = opts?.width || 620;
  const h = opts?.height || 440;
  const raw = nodes.map((n) => {
    const pos = cy.getElementById(n.id).position();
    return { ...n, x: pos.x, y: pos.y };
  });
  // normalize into canvas bounds
  if (raw.length === 0) return raw;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  raw.forEach((n) => { minX = Math.min(minX, n.x); minY = Math.min(minY, n.y); maxX = Math.max(maxX, n.x); maxY = Math.max(maxY, n.y); });
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const usableW = w - 2 * pad;
  const usableH = h - 2 * pad;
  return raw.map((n) => ({
    ...n,
    x: Math.round(pad + ((n.x - minX) / rangeX) * usableW),
    y: Math.round(pad + ((n.y - minY) / rangeY) * usableH),
  }));
}

function runLayout(cy, layoutName, opts) {
  const common = { animate: false, fit: true };
  const configs = {
    dagre: {
      ...common, name: "dagre", rankDir: "LR", nodeSep: 60, rankSep: 100,
      roots: opts?.initialStateId ? [opts.initialStateId] : undefined,
    },
    cose: {
      ...common, name: "cose", idealEdgeLength: 120, nodeRepulsion: 8000,
      nodeOverlap: 40, gravity: 0.25, numIter: 200, randomize: true,
    },
    breadthfirst: {
      ...common, name: "breadthfirst", directed: true, spacingFactor: 1.2,
      roots: opts?.initialStateId ? [opts.initialStateId] : undefined,
    },
    circle:     { ...common, name: "circle" },
    concentric: {
      ...common, name: "concentric",
      concentric: (node) => node.degree(), levelWidth: () => 2,
    },
    grid: { ...common, name: "grid", rows: Math.ceil(Math.sqrt(cy.nodes().length)) },
  };
  const config = configs[layoutName] || configs.cose;
  cy.layout(config).run();
}

function detectBest(nodes, edges) {
  if (nodes.length <= 3) return "circle";
  const nonSelf = edges.filter((e) => e.from !== e.to);
  // check for cycles via DFS
  const fwd = {};
  nodes.forEach((n) => (fwd[n.id] = []));
  nonSelf.forEach((e) => { if (fwd[e.from]) fwd[e.from].push(e.to); });
  const white = new Set(nodes.map((n) => n.id));
  const grey = new Set();
  let cyclic = false;
  const dfs = (u) => {
    white.delete(u); grey.add(u);
    for (const v of (fwd[u] || [])) {
      if (grey.has(v)) { cyclic = true; return; }
      if (white.has(v)) dfs(v);
      if (cyclic) return;
    }
    grey.delete(u);
  };
  for (const n of nodes) {
    if (white.has(n.id)) dfs(n.id);
    if (cyclic) break;
  }
  if (!cyclic) return "dagre";
  return "cose";
}

export function autoLayout(nodes, edges, opts) {
  if (!nodes || nodes.length === 0) return nodes;
  if (nodes.length === 1) {
    const w = opts?.width || 620, h = opts?.height || 440;
    return [{ ...nodes[0], x: w / 2, y: h / 2 }];
  }
  const algo = detectBest(nodes, edges);
  return layoutWithAlgorithm(nodes, edges, algo, opts);
}

export function layoutWithAlgorithm(nodes, edges, algorithm, opts) {
  if (!nodes || nodes.length === 0) return nodes;
  const algoName = algorithm === "auto" ? detectBest(nodes, edges) : algorithm;
  const cy = buildCy(nodes, edges);
  runLayout(cy, algoName, opts);
  const result = extractPositions(cy, nodes, opts);
  cy.destroy();
  return result;
}

export function detectOverlaps(nodes, radius) {
  const minDist = (radius || 32) * 2.2;
  let count = 0;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dx = nodes[j].x - nodes[i].x, dy = nodes[j].y - nodes[i].y;
      if (Math.sqrt(dx * dx + dy * dy) < minDist) count++;
    }
  }
  return count;
}
