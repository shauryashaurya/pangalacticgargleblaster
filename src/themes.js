// themes.js

export const NODE_THEMES = {
  default: { name: "Default", colors: null },
  category: {
    name: "By Role",
    colors: {
      initial: { fill: "rgba(88,166,255,0.12)", stroke: "#58a6ff" },
      final: { fill: "rgba(63,185,80,0.12)", stroke: "#3fb950" },
      normal: { fill: "rgba(22,27,34,0.9)", stroke: "#8b949e" },
    },
  },
  pastel: {
    name: "Pastel Sequence",
    palette: [
      "#264653", "#2a9d8f", "#e9c46a", "#f4a261", "#e76f51",
      "#606c38", "#283618", "#dda15e", "#bc6c25", "#6d6875",
      "#b5838d", "#e5989b",
    ],
  },
  warm: {
    name: "Warm",
    palette: [
      "#d62828", "#f77f00", "#fcbf49", "#eae2b7", "#003049",
      "#780000", "#c1121f", "#fdf0d5", "#669bbc", "#a4133c",
      "#ff4d6d", "#ff758f",
    ],
  },
  cool: {
    name: "Cool",
    palette: [
      "#03045e", "#0077b6", "#00b4d8", "#90e0ef", "#caf0f8",
      "#023e8a", "#0096c7", "#48cae4", "#ade8f4", "#005f73",
      "#0a9396", "#94d2bd",
    ],
  },
  highContrast: {
    name: "High Contrast",
    palette: [
      "#ff0000", "#00ff00", "#0000ff", "#ffff00", "#ff00ff",
      "#00ffff", "#ff8800", "#8800ff", "#00ff88", "#ff0088",
      "#0088ff", "#88ff00",
    ],
  },
};

// resolve the fill/stroke for a given node, theme, and graph context
export function resolveNodeColors ( node, nodeIndex, theme, opts )
{
  const { initialStateId, finalSet, isSimActive, isSelected,
    isTransSource, isUnreachable, isDead } = opts;
  let sk = "var(--fd)", fk = "rgba(22,27,34,0.9)";

  // theme base
  if ( theme?.colors )
  {
    const role = initialStateId === node.id ? "initial"
      : finalSet.has( node.id ) ? "final" : "normal";
    sk = theme.colors[ role ]?.stroke || sk;
    fk = theme.colors[ role ]?.fill || fk;
  } else if ( theme?.palette )
  {
    const ci = nodeIndex % theme.palette.length;
    sk = theme.palette[ ci ];
    fk = theme.palette[ ci ] + "20";
  }

  // priority overrides
  if ( isSimActive ) { sk = "var(--a2)"; fk = "rgba(63,185,80,0.15)"; }
  else if ( isSelected ) { sk = "var(--ac)"; fk = "rgba(88,166,255,0.08)"; }
  else if ( isTransSource ) { sk = "var(--ac)"; }
  else if ( isUnreachable ) { sk = "#484f58"; fk = "rgba(72,79,88,0.1)"; }
  else if ( isDead ) { sk = "var(--wr)"; }

  return { stroke: sk, fill: fk };
}

// resolve the stroke for a given edge, theme, and graph context
export function resolveEdgeColors ( edge, theme, opts )
{
  const { isSimActive, isSelected, isIncoming, isOutgoing } = opts;

  let sk = "var(--fd)"; // Default edge color

  if ( isSimActive ) return { stroke: "var(--a2)" }; // Simulation active (Green)
  if ( isSelected ) return { stroke: "var(--ac)" };  // Edge directly selected (Blue)

  // Differentiate outgoing and incoming relative to a selected node
  if ( isOutgoing ) return { stroke: "var(--wr)" };  // Outgoing (Orange/Warning)
  if ( isIncoming ) return { stroke: "var(--a3)" };  // Incoming (Purple/Accent 3)

  return { stroke: sk };
}