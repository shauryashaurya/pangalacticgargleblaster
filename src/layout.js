// layout.js
// Graph layout algorithms for Typestate FSM editor.
// Three algorithms: force-directed (Fruchterman-Reingold), hierarchical (Sugiyama-style), circular.
// Auto-detection picks the best algorithm based on graph structure.

const DEFAULT_OPTS = {
  width: 620,
  height: 440,
  padding: 60,
  nodeRadius: 32,
  idealEdgeLen: 120,
};

// -- Utility --

function buildAdj ( nodes, edges )
{
  const fwd = {},
    rev = {};
  nodes.forEach( ( n ) =>
  {
    fwd[ n.id ] = [];
    rev[ n.id ] = [];
  } );
  edges.forEach( ( e ) =>
  {
    if ( fwd[ e.from ] ) fwd[ e.from ].push( e.to );
    if ( rev[ e.to ] ) rev[ e.to ].push( e.from );
  } );
  return { fwd, rev };
}

function hasCycle ( nodes, edges )
{
  const { fwd } = buildAdj( nodes, edges );
  const white = new Set( nodes.map( ( n ) => n.id ) );
  const grey = new Set();
  const dfs = ( u ) =>
  {
    white.delete( u );
    grey.add( u );
    for ( const v of fwd[ u ] || [] )
    {
      if ( grey.has( v ) ) return true;
      if ( white.has( v ) && dfs( v ) ) return true;
    }
    grey.delete( u );
    return false;
  };
  for ( const n of nodes )
  {
    if ( white.has( n.id ) && dfs( n.id ) ) return true;
  }
  return false;
}

function detectGraphType ( nodes, edges, initialStateId )
{
  if ( nodes.length <= 3 ) return "circular";
  if ( nodes.length <= 5 && edges.length <= nodes.length + 1 ) return "circular";
  const selfLoops = edges.filter( ( e ) => e.from === e.to );
  const nonSelfEdges = edges.filter( ( e ) => e.from !== e.to );
  if ( !hasCycle( nodes, nonSelfEdges ) ) return "dag";
  const ratio = nonSelfEdges.length / Math.max( nodes.length, 1 );
  if ( ratio > 2.5 ) return "force";
  return "force";
}

// -- Force-Directed Layout (Fruchterman-Reingold) --

function forceDirectedLayout ( nodes, edges, opts )
{
  const o = { ...DEFAULT_OPTS, ...opts };
  const w = o.width - 2 * o.padding;
  const h = o.height - 2 * o.padding;
  const area = w * h;
  const k = Math.sqrt( area / Math.max( nodes.length, 1 ) );
  const iterations = 80;
  let temp = w / 4;
  const cooling = temp / ( iterations + 1 );

  const pos = {};
  nodes.forEach( ( n, i ) =>
  {
    const angle = ( 2 * Math.PI * i ) / nodes.length;
    const cx = w / 2,
      cy = h / 2;
    const r = Math.min( w, h ) / 3;
    pos[ n.id ] = { x: cx + r * Math.cos( angle ), y: cy + r * Math.sin( angle ) };
  } );

  const nonSelfEdges = edges.filter( ( e ) => e.from !== e.to );

  for ( let iter = 0; iter < iterations; iter++ )
  {
    const disp = {};
    nodes.forEach( ( n ) =>
    {
      disp[ n.id ] = { x: 0, y: 0 };
    } );

    // repulsive forces between all pairs
    for ( let i = 0; i < nodes.length; i++ )
    {
      for ( let j = i + 1; j < nodes.length; j++ )
      {
        const u = nodes[ i ].id,
          v = nodes[ j ].id;
        let dx = pos[ u ].x - pos[ v ].x;
        let dy = pos[ u ].y - pos[ v ].y;
        const dist = Math.max( Math.sqrt( dx * dx + dy * dy ), 0.01 );
        const force = ( k * k ) / dist;
        const fx = ( dx / dist ) * force;
        const fy = ( dy / dist ) * force;
        disp[ u ].x += fx;
        disp[ u ].y += fy;
        disp[ v ].x -= fx;
        disp[ v ].y -= fy;
      }
    }

    // attractive forces along edges
    nonSelfEdges.forEach( ( e ) =>
    {
      if ( !pos[ e.from ] || !pos[ e.to ] ) return;
      let dx = pos[ e.from ].x - pos[ e.to ].x;
      let dy = pos[ e.from ].y - pos[ e.to ].y;
      const dist = Math.max( Math.sqrt( dx * dx + dy * dy ), 0.01 );
      const force = ( dist * dist ) / k;
      const fx = ( dx / dist ) * force;
      const fy = ( dy / dist ) * force;
      disp[ e.from ].x -= fx;
      disp[ e.from ].y -= fy;
      disp[ e.to ].x += fx;
      disp[ e.to ].y += fy;
    } );

    // apply displacements with temperature
    nodes.forEach( ( n ) =>
    {
      const d = disp[ n.id ];
      const dist = Math.max( Math.sqrt( d.x * d.x + d.y * d.y ), 0.01 );
      const scale = Math.min( dist, temp ) / dist;
      pos[ n.id ].x += d.x * scale;
      pos[ n.id ].y += d.y * scale;
      pos[ n.id ].x = Math.max( 0, Math.min( w, pos[ n.id ].x ) );
      pos[ n.id ].y = Math.max( 0, Math.min( h, pos[ n.id ].y ) );
    } );

    temp -= cooling;
  }

  // resolve overlaps with a final pass
  resolveOverlaps( nodes, pos, o.nodeRadius );

  return nodes.map( ( n ) => ( {
    ...n,
    x: Math.round( pos[ n.id ].x + o.padding ),
    y: Math.round( pos[ n.id ].y + o.padding ),
  } ) );
}

// -- Hierarchical Layout (Sugiyama-style) --

function hierarchicalLayout ( nodes, edges, opts )
{
  const o = { ...DEFAULT_OPTS, ...opts };
  const w = o.width - 2 * o.padding;
  const h = o.height - 2 * o.padding;
  const { fwd } = buildAdj( nodes, edges );
  const nonSelfEdges = edges.filter( ( e ) => e.from !== e.to );

  // layer assignment by longest path from sources
  const layers = {};
  const nodeIds = nodes.map( ( n ) => n.id );
  const inDeg = {};
  nodeIds.forEach( ( id ) =>
  {
    inDeg[ id ] = 0;
  } );
  nonSelfEdges.forEach( ( e ) =>
  {
    if ( inDeg[ e.to ] !== undefined ) inDeg[ e.to ]++;
  } );

  // find sources (in-degree 0 among non-self edges, or initialStateId)
  let sources = nodeIds.filter( ( id ) => inDeg[ id ] === 0 );
  if ( o.initialStateId && !sources.includes( o.initialStateId ) )
  {
    sources = [
      o.initialStateId,
      ...sources.filter( ( s ) => s !== o.initialStateId ),
    ];
  }
  if ( sources.length === 0 ) sources = [ nodeIds[ 0 ] ];

  // BFS layer assignment
  const visited = new Set();
  const queue = sources.map( ( s ) => ( { id: s, layer: 0 } ) );
  sources.forEach( ( s ) =>
  {
    visited.add( s );
    layers[ s ] = 0;
  } );

  // while ( queue.length > 0 )
  // {
  //   const { id, layer } = queue.shift();
  //   layers[ id ] = Math.max( layers[ id ] || 0, layer );
  //   ( fwd[ id ] || [] ).forEach( ( nb ) =>
  //   {
  //     if ( !visited.has( nb ) )
  //     {
  //       visited.add( nb );
  //       layers[ nb ] = layer + 1;
  //       queue.push( { id: nb, layer: layer + 1 } );
  //     } else
  //     {
  //       // push deeper if needed for proper layering
  //       if ( ( layers[ nb ] || 0 ) <= layer )
  //       {
  //         layers[ nb ] = layer + 1;
  //         queue.push( { id: nb, layer: layer + 1 } );
  //       }
  //     }
  //   } );
  // }
  let bfsLimit = nodes.length * nodes.length + 100;
  while ( queue.length > 0 && bfsLimit > 0 )
  {
    bfsLimit--;
    const { id, layer } = queue.shift();
    if ( layer > nodes.length ) continue;
    layers[ id ] = Math.max( layers[ id ] || 0, layer );
    ( fwd[ id ] || [] ).forEach( ( nb ) =>
    {
      if ( !visited.has( nb ) )
      {
        visited.add( nb );
        layers[ nb ] = layer + 1;
        queue.push( { id: nb, layer: layer + 1 } );
      }
    } );
  }

  // assign unvisited nodes to the last layer
  const maxLayer = Math.max( 0, ...Object.values( layers ) );
  nodeIds.forEach( ( id ) =>
  {
    if ( layers[ id ] === undefined ) layers[ id ] = maxLayer + 1;
  } );

  // group by layer
  const layerGroups = {};
  const finalMaxLayer = Math.max( 0, ...Object.values( layers ) );
  for ( let i = 0; i <= finalMaxLayer; i++ ) layerGroups[ i ] = [];
  nodeIds.forEach( ( id ) =>
  {
    layerGroups[ layers[ id ] ].push( id );
  } );

  // crossing reduction: barycenter heuristic within each layer
  for ( let pass = 0; pass < 4; pass++ )
  {
    for ( let l = 1; l <= finalMaxLayer; l++ )
    {
      const group = layerGroups[ l ];
      const prevGroup = layerGroups[ l - 1 ];
      if ( !prevGroup || prevGroup.length === 0 ) continue;
      const bary = {};
      group.forEach( ( id ) =>
      {
        const parents = nonSelfEdges
          .filter( ( e ) => e.to === id && prevGroup.includes( e.from ) )
          .map( ( e ) => prevGroup.indexOf( e.from ) );
        bary[ id ] =
          parents.length > 0
            ? parents.reduce( ( a, b ) => a + b, 0 ) / parents.length
            : 0;
      } );
      group.sort( ( a, b ) => bary[ a ] - bary[ b ] );
      layerGroups[ l ] = group;
    }
  }

  // position nodes
  const numLayers = finalMaxLayer + 1;
  const layerSpacing = numLayers > 1 ? w / ( numLayers - 1 ) : w / 2;
  const pos = {};

  for ( let l = 0; l <= finalMaxLayer; l++ )
  {
    const group = layerGroups[ l ];
    const count = group.length;
    const nodeSpacing = count > 1 ? h / ( count - 1 ) : h / 2;
    group.forEach( ( id, i ) =>
    {
      pos[ id ] = {
        x: numLayers > 1 ? l * layerSpacing : w / 2,
        y: count > 1 ? i * nodeSpacing : h / 2,
      };
    } );
  }

  resolveOverlaps( nodes, pos, o.nodeRadius );

  return nodes.map( ( n ) => ( {
    ...n,
    x: Math.round( pos[ n.id ].x + o.padding ),
    y: Math.round( pos[ n.id ].y + o.padding ),
  } ) );
}

// -- Circular Layout --

function circularLayout ( nodes, edges, opts )
{
  const o = { ...DEFAULT_OPTS, ...opts };
  const cx = ( o.width - 2 * o.padding ) / 2;
  const cy = ( o.height - 2 * o.padding ) / 2;
  const r = Math.min( cx, cy ) - o.nodeRadius;

  // order: initial state first, then BFS order
  const ordered = [];
  const visited = new Set();
  const { fwd } = buildAdj( nodes, edges );

  const start = o.initialStateId || ( nodes[ 0 ] && nodes[ 0 ].id );
  if ( start )
  {
    const q = [ start ];
    visited.add( start );
    while ( q.length > 0 )
    {
      const cur = q.shift();
      ordered.push( cur );
      ( fwd[ cur ] || [] ).forEach( ( nb ) =>
      {
        if ( !visited.has( nb ) )
        {
          visited.add( nb );
          q.push( nb );
        }
      } );
    }
  }
  // add any remaining
  nodes.forEach( ( n ) =>
  {
    if ( !visited.has( n.id ) ) ordered.push( n.id );
  } );

  const posMap = {};
  ordered.forEach( ( id, i ) =>
  {
    const angle = ( 2 * Math.PI * i ) / ordered.length - Math.PI / 2;
    posMap[ id ] = {
      x: cx + r * Math.cos( angle ),
      y: cy + r * Math.sin( angle ),
    };
  } );

  return nodes.map( ( n ) => ( {
    ...n,
    x: Math.round( posMap[ n.id ].x + o.padding ),
    y: Math.round( posMap[ n.id ].y + o.padding ),
  } ) );
}

// -- Overlap Resolution --

function resolveOverlaps ( nodes, pos, radius )
{
  const minDist = radius * 2.5;
  for ( let pass = 0; pass < 20; pass++ )
  {
    let moved = false;
    for ( let i = 0; i < nodes.length; i++ )
    {
      for ( let j = i + 1; j < nodes.length; j++ )
      {
        const a = pos[ nodes[ i ].id ],
          b = pos[ nodes[ j ].id ];
        const dx = b.x - a.x,
          dy = b.y - a.y;
        const dist = Math.sqrt( dx * dx + dy * dy );
        if ( dist < minDist && dist > 0 )
        {
          const push = ( minDist - dist ) / 2;
          const ux = dx / dist,
            uy = dy / dist;
          a.x -= ux * push;
          a.y -= uy * push;
          b.x += ux * push;
          b.y += uy * push;
          moved = true;
        } else if ( dist === 0 )
        {
          a.x -= minDist / 2;
          b.x += minDist / 2;
          moved = true;
        }
      }
    }
    if ( !moved ) break;
  }
}

// -- Auto Layout (public API) --

export function autoLayout ( nodes, edges, opts )
{
  if ( !nodes || nodes.length === 0 ) return nodes;
  if ( nodes.length === 1 )
  {
    const o = { ...DEFAULT_OPTS, ...opts };
    return [ { ...nodes[ 0 ], x: o.width / 2, y: o.height / 2 } ];
  }
  const graphType = detectGraphType( nodes, edges, opts?.initialStateId );
  switch ( graphType )
  {
    case "dag":
      return hierarchicalLayout( nodes, edges, opts );
    case "circular":
      return circularLayout( nodes, edges, opts );
    default:
      return forceDirectedLayout( nodes, edges, opts );
  }
}

export function layoutWithAlgorithm ( nodes, edges, algorithm, opts )
{
  if ( !nodes || nodes.length === 0 ) return nodes;
  switch ( algorithm )
  {
    case "hierarchical":
      return hierarchicalLayout( nodes, edges, opts );
    case "circular":
      return circularLayout( nodes, edges, opts );
    case "force":
      return forceDirectedLayout( nodes, edges, opts );
    default:
      return autoLayout( nodes, edges, opts );
  }
}

export function detectOverlaps ( nodes, radius )
{
  const minDist = ( radius || 32 ) * 2.2;
  const overlaps = [];
  for ( let i = 0; i < nodes.length; i++ )
  {
    for ( let j = i + 1; j < nodes.length; j++ )
    {
      const dx = nodes[ j ].x - nodes[ i ].x;
      const dy = nodes[ j ].y - nodes[ i ].y;
      const dist = Math.sqrt( dx * dx + dy * dy );
      if ( dist < minDist )
      {
        overlaps.push( {
          a: nodes[ i ].id,
          b: nodes[ j ].id,
          dist: Math.round( dist ),
        } );
      }
    }
  }
  return overlaps;
}
