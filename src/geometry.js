// // geometry.js
// import { R } from "./constants.js";

// function vecLen ( dx, dy ) { return Math.sqrt( dx * dx + dy * dy ); }

// function edgePoints ( ax, ay, bx, by, r )
// {
//   const dx = bx - ax, dy = by - ay, l = vecLen( dx, dy );
//   if ( l === 0 ) return { x1: ax, y1: ay, x2: bx, y2: by };
//   return { x1: ax + dx / l * r, y1: ay + dy / l * r, x2: bx - dx / l * r, y2: by - dy / l * r };
// }

// function selfLoopPath ( cx, cy, r, idx )
// {
//   const o = 50 + ( idx || 0 ) * 14, s = 22, t = cy - r;
//   return {
//     d: `M ${ cx - s } ${ t } C ${ cx - s - 10 } ${ t - o }, ${ cx + s + 10 } ${ t - o }, ${ cx + s } ${ t }`,
//     labelX: cx,
//     labelY: t - o + 5,
//   };
// }

// // function curvedPath(ax, ay, bx, by, r, offset) {
// //   const dx = bx - ax, dy = by - ay, l = vecLen(dx, dy);
// //   if (l === 0) return { d: "", labelX: ax, labelY: ay };
// //   const ux = dx / l, uy = dy / l, px = -uy, py = ux;
// //   const mx = (ax + bx) / 2 + px * offset, my = (ay + by) / 2 + py * offset;
// //   const sa = Math.atan2(my - ay, mx - ax), ea = Math.atan2(my - by, mx - bx);
// //   const x1 = ax + Math.cos(sa) * r, y1 = ay + Math.sin(sa) * r;
// //   const x2 = bx + Math.cos(ea) * r, y2 = by + Math.sin(ea) * r;
// //   return {
// //     d: `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`,
// //     labelX: (x1 + 2 * mx + x2) / 4,
// //     labelY: (y1 + 2 * my + y2) / 4,
// //   };
// // }
// // v2
// function curvedPath ( ax, ay, bx, by, r, offset )
// {
//   const dx = bx - ax, dy = by - ay, l = vecLen( dx, dy );
//   if ( l === 0 ) return { d: "", labelX: ax, labelY: ay };
//   const ux = dx / l, uy = dy / l, px = -uy, py = ux;
//   const mx = ( ax + bx ) / 2 + px * offset, my = ( ay + by ) / 2 + py * offset;
//   const sa = Math.atan2( my - ay, mx - ax ), ea = Math.atan2( my - by, mx - bx );
//   const x1 = ax + Math.cos( sa ) * r, y1 = ay + Math.sin( sa ) * r;
//   const x2 = bx + Math.cos( ea ) * r, y2 = by + Math.sin( ea ) * r;
//   return {
//     d: `M ${ x1 } ${ y1 } Q ${ mx } ${ my } ${ x2 } ${ y2 }`,
//     labelX: ( x1 + 2 * mx + x2 ) / 4,
//     labelY: ( y1 + 2 * my + y2 ) / 4,
//     ctrlX: mx,
//     ctrlY: my
//   };
// }

// // export function computeEdgePaths ( nodes, edges )
// // {
// //   const nm = {};
// //   nodes.forEach( ( n ) => ( nm[ n.id ] = n ) );
// //   const pc = {};
// //   edges.forEach( ( e ) =>
// //   {
// //     const pk = e.from === e.to ? `s::${ e.from }` : [ e.from, e.to ].sort().join( "::" );
// //     pc[ pk ] = ( pc[ pk ] || 0 ) + 1;
// //   } );
// //   const pi = {};
// //   return edges.map( ( e ) =>
// //   {
// //     const fn = nm[ e.from ], tn = nm[ e.to ];
// //     if ( !fn || !tn ) return null;

// //     if ( e.from === e.to )
// //     {
// //       const pk = `s::${ e.from }`, i = pi[ pk ] || 0;
// //       pi[ pk ] = i + 1;
// //       const sl = selfLoopPath( fn.x, fn.y, R, i );
// //       sl.labelY = sl.labelY - i * 12;
// //       return { ...e, ...sl, isSelf: true };
// //     }

// //     const pk = [ e.from, e.to ].sort().join( "::" );
// //     const tot = pc[ pk ] || 1, i = pi[ pk ] || 0;
// //     pi[ pk ] = i + 1;

// //     if ( tot === 1 )
// //     {
// //       const p = edgePoints( fn.x, fn.y, tn.x, tn.y, R );
// //       return {
// //         ...e,
// //         d: `M ${ p.x1 } ${ p.y1 } L ${ p.x2 } ${ p.y2 }`,
// //         labelX: ( p.x1 + p.x2 ) / 2,
// //         labelY: ( p.y1 + p.y2 ) / 2 - 10,
// //         isSelf: false,
// //       };
// //     }

// //     const off = ( i - ( tot - 1 ) / 2 ) * 35;
// //     const cp = curvedPath( fn.x, fn.y, tn.x, tn.y, R, off );
// //     cp.labelY = cp.labelY + ( off > 0 ? -10 : off < 0 ? 10 : 0 );
// //     return { ...e, ...cp, isSelf: false };
// //   } ).filter( Boolean );
// // }

// // v2
// // geometry.js
// export function computeEdgePaths ( nodes, edges )
// {
//   const nm = {};
//   nodes.forEach( ( n ) => ( nm[ n.id ] = n ) );
//   const pc = {};
//   edges.forEach( ( e ) =>
//   {
//     const pk = e.from === e.to ? `s::${ e.from }` : [ e.from, e.to ].sort().join( "::" );
//     pc[ pk ] = ( pc[ pk ] || 0 ) + 1;
//   } );
//   const pi = {};

//   return edges.map( ( e ) =>
//   {
//     const fn = nm[ e.from ], tn = nm[ e.to ];
//     if ( !fn || !tn ) return null;

//     const hasControl = e.cx !== undefined && e.cy !== undefined;
//     if ( hasControl )
//     {
//       const mx = e.cx, my = e.cy;
//       const isSelf = e.from === e.to;

//       let sa, ea;
//       if ( isSelf )
//       {
//         // Offset angles by 30 degrees to create a teardrop base
//         const angleToCtrl = Math.atan2( my - fn.y, mx - fn.x );
//         const spread = Math.PI / 6;
//         sa = angleToCtrl - spread;
//         ea = angleToCtrl + spread;
//       } else
//       {
//         sa = Math.atan2( my - fn.y, mx - fn.x );
//         ea = Math.atan2( my - tn.y, mx - tn.x );
//       }

//       const x1 = fn.x + Math.cos( sa ) * R;
//       const y1 = fn.y + Math.sin( sa ) * R;
//       const x2 = ( isSelf ? fn.x : tn.x ) + Math.cos( ea ) * R;
//       const y2 = ( isSelf ? fn.y : tn.y ) + Math.sin( ea ) * R;

//       // Geometrically expand control point so curve intersects exactly at mx, my
//       const qx = 2 * mx - 0.5 * ( x1 + x2 );
//       const qy = 2 * my - 0.5 * ( y1 + y2 );

//       return {
//         ...e,
//         d: `M ${ x1 } ${ y1 } Q ${ qx } ${ qy } ${ x2 } ${ y2 }`,
//         labelX: mx,
//         labelY: my - 8,
//         ctrlX: mx,
//         ctrlY: my,
//         isSelf
//       };
//     }

//     if ( e.from === e.to )
//     {
//       const pk = `s::${ e.from }`, i = pi[ pk ] || 0;
//       pi[ pk ] = i + 1;
//       const sl = selfLoopPath( fn.x, fn.y, R, i );
//       sl.labelY = sl.labelY - i * 12;
//       return { ...e, ...sl, ctrlX: sl.labelX, ctrlY: sl.labelY - 20, isSelf: true };
//     }

//     const pk = [ e.from, e.to ].sort().join( "::" );
//     const tot = pc[ pk ] || 1, i = pi[ pk ] || 0;
//     pi[ pk ] = i + 1;

//     if ( tot === 1 )
//     {
//       const p = edgePoints( fn.x, fn.y, tn.x, tn.y, R );
//       return {
//         ...e,
//         d: `M ${ p.x1 } ${ p.y1 } L ${ p.x2 } ${ p.y2 }`,
//         labelX: ( p.x1 + p.x2 ) / 2,
//         labelY: ( p.y1 + p.y2 ) / 2 - 10,
//         ctrlX: ( p.x1 + p.x2 ) / 2,
//         ctrlY: ( p.y1 + p.y2 ) / 2,
//         isSelf: false,
//       };
//     }

//     const off = ( i - ( tot - 1 ) / 2 ) * 35;
//     const cp = curvedPath( fn.x, fn.y, tn.x, tn.y, R, off );
//     cp.labelY = cp.labelY + ( off > 0 ? -10 : off < 0 ? 10 : 0 );
//     return { ...e, ...cp, isSelf: false };
//   } ).filter( Boolean );
// }

// geometry.js
import { R } from "./constants.js";

function vecLen ( dx, dy ) { return Math.sqrt( dx * dx + dy * dy ); }

function edgePoints ( ax, ay, bx, by, sr, tr )
{
  const dx = bx - ax, dy = by - ay, l = vecLen( dx, dy );
  if ( l === 0 ) return { x1: ax, y1: ay, x2: bx, y2: by };
  return { x1: ax + dx / l * sr, y1: ay + dy / l * sr, x2: bx - dx / l * tr, y2: by - dy / l * tr };
}

function selfLoopPath ( cx, cy, r, idx )
{
  const o = 50 + ( idx || 0 ) * 14, s = r * 0.7, t = cy - r;
  return {
    d: `M ${ cx - s } ${ t } C ${ cx - s - 10 } ${ t - o }, ${ cx + s + 10 } ${ t - o }, ${ cx + s } ${ t }`,
    labelX: cx,
    labelY: t - o + 5,
  };
}

function curvedPath ( ax, ay, bx, by, sr, tr, offset )
{
  const dx = bx - ax, dy = by - ay, l = vecLen( dx, dy );
  if ( l === 0 ) return { d: "", labelX: ax, labelY: ay };
  const ux = dx / l, uy = dy / l, px = -uy, py = ux;
  const mx = ( ax + bx ) / 2 + px * offset, my = ( ay + by ) / 2 + py * offset;
  const sa = Math.atan2( my - ay, mx - ax ), ea = Math.atan2( my - by, mx - bx );
  const x1 = ax + Math.cos( sa ) * sr, y1 = ay + Math.sin( sa ) * sr;
  const x2 = bx + Math.cos( ea ) * tr, y2 = by + Math.sin( ea ) * tr;
  return {
    d: `M ${ x1 } ${ y1 } Q ${ mx } ${ my } ${ x2 } ${ y2 }`,
    labelX: ( x1 + 2 * mx + x2 ) / 4,
    labelY: ( y1 + 2 * my + y2 ) / 4,
    ctrlX: mx,
    ctrlY: my
  };
}

export function computeEdgePaths ( nodes, edges )
{
  const nm = {};
  nodes.forEach( ( n ) => ( nm[ n.id ] = n ) );
  const pc = {};
  edges.forEach( ( e ) =>
  {
    const pk = e.from === e.to ? `s::${ e.from }` : [ e.from, e.to ].sort().join( "::" );
    pc[ pk ] = ( pc[ pk ] || 0 ) + 1;
  } );
  const pi = {};

  return edges.map( ( e ) =>
  {
    const fn = nm[ e.from ], tn = nm[ e.to ];
    if ( !fn || !tn ) return null;

    const sr = fn.r || R;
    const tr = tn.r || R;

    const hasControl = e.cx !== undefined && e.cy !== undefined;
    if ( hasControl )
    {
      const mx = e.cx, my = e.cy;
      const isSelf = e.from === e.to;

      let sa, ea;
      if ( isSelf )
      {
        const angleToCtrl = Math.atan2( my - fn.y, mx - fn.x );
        const spread = Math.PI / 6;
        sa = angleToCtrl - spread;
        ea = angleToCtrl + spread;
      } else
      {
        sa = Math.atan2( my - fn.y, mx - fn.x );
        ea = Math.atan2( my - tn.y, mx - tn.x );
      }

      const x1 = fn.x + Math.cos( sa ) * sr;
      const y1 = fn.y + Math.sin( sa ) * sr;
      const x2 = ( isSelf ? fn.x : tn.x ) + Math.cos( ea ) * tr;
      const y2 = ( isSelf ? fn.y : tn.y ) + Math.sin( ea ) * tr;

      const qx = 2 * mx - 0.5 * ( x1 + x2 );
      const qy = 2 * my - 0.5 * ( y1 + y2 );

      return {
        ...e,
        d: `M ${ x1 } ${ y1 } Q ${ qx } ${ qy } ${ x2 } ${ y2 }`,
        labelX: mx,
        labelY: my - 8,
        ctrlX: mx,
        ctrlY: my,
        isSelf,
        fontSize: e.fontSize || 11
      };
    }

    if ( e.from === e.to )
    {
      const pk = `s::${ e.from }`, i = pi[ pk ] || 0;
      pi[ pk ] = i + 1;
      const sl = selfLoopPath( fn.x, fn.y, sr, i );
      sl.labelY = sl.labelY - i * 12;
      return { ...e, ...sl, ctrlX: sl.labelX, ctrlY: sl.labelY - 20, isSelf: true, fontSize: e.fontSize || 11 };
    }

    const pk = [ e.from, e.to ].sort().join( "::" );
    const tot = pc[ pk ] || 1, i = pi[ pk ] || 0;
    pi[ pk ] = i + 1;

    if ( tot === 1 )
    {
      const p = edgePoints( fn.x, fn.y, tn.x, tn.y, sr, tr );
      return {
        ...e,
        d: `M ${ p.x1 } ${ p.y1 } L ${ p.x2 } ${ p.y2 }`,
        labelX: ( p.x1 + p.x2 ) / 2,
        labelY: ( p.y1 + p.y2 ) / 2 - 10,
        ctrlX: ( p.x1 + p.x2 ) / 2,
        ctrlY: ( p.y1 + p.y2 ) / 2,
        isSelf: false,
        fontSize: e.fontSize || 11
      };
    }

    const off = ( i - ( tot - 1 ) / 2 ) * 35;
    const cp = curvedPath( fn.x, fn.y, tn.x, tn.y, sr, tr, off );
    cp.labelY = cp.labelY + ( off > 0 ? -10 : off < 0 ? 10 : 0 );
    return { ...e, ...cp, isSelf: false, fontSize: e.fontSize || 11 };
  } ).filter( Boolean );
}