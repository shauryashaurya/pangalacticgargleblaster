// App.jsx
import { useState, useCallback, useRef, useEffect, useMemo } from "react";
// import { forceSimulation, forceManyBody, forceCollide, forceX, forceY, forceLink } from "d3-force";
import aboutImage from "./src/assets/pangalacticgargleblaster_01.png";
import { R, ARROW_SIZE, uid, resetIdCounter } from "./constants.js";
import { NODE_THEMES, resolveNodeColors, resolveEdgeColors } from "./themes.js";
import { validateMachine, validatePresetFile } from "./validation.js";
import { getReachable, getDeadStates, checkDeterminism, getUnhandledEvents, hopcroftMinimize, genStrings } from "./algorithms.js";
import { generateCode, highlightTS } from "./codegen.js";
import { computeEdgePaths } from "./geometry.js";
import { autoLayout, layoutWithAlgorithm, detectOverlaps as layoutDetectOverlaps, LAYOUT_ALGORITHMS } from "./layout.js";

// load presets from external JSON (Vite resolves this at build time)
import BUILTIN_PRESETS from "./blasted-gargles-presets.json";
const builtinMachines = BUILTIN_PRESETS.machines || BUILTIN_PRESETS;

// -- Styles --
const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Source+Code+Pro:wght@400;500&display=swap');
  :root{--bg:#0d1117;--sf:#161b22;--s2:#1c2333;--bd:#30363d;--fg:#c9d1d9;--fd:#8b949e;--ac:#58a6ff;--a2:#3fb950;--a3:#d2a8ff;--wr:#d29922;--er:#f85149;--gd:rgba(48,54,61,0.4)}
  *{box-sizing:border-box;margin:0;padding:0}
  ::-webkit-scrollbar{width:6px;height:6px}::-webkit-scrollbar-track{background:var(--sf)}::-webkit-scrollbar-thumb{background:var(--bd)}
  @keyframes pN{0%,100%{stroke-width:2.5}50%{stroke-width:4}}
  select{background:var(--s2);color:var(--fg);border:1px solid var(--bd);padding:2px 4px;font-family:'Source Code Pro',monospace;font-size:11px}
  input{background:var(--s2);color:var(--fg);border:1px solid var(--bd);padding:4px 8px;font-family:'Source Code Pro',monospace;font-size:12px;outline:none}input:focus{border-color:var(--ac)}
`;

export default function App ()
{
  const [ presets, setPresets ] = useState( builtinMachines );
  const [ nodes, setNodes ] = useState( [] );
  const [ edges, setEdges ] = useState( [] );
  const [ initialStateId, setInitialStateId ] = useState( null );
  const [ finalStateIds, setFinalStateIds ] = useState( [] );
  const [ selectedId, setSelectedId ] = useState( null );
  const [ selectedType, setSelectedType ] = useState( null );
  const [ mode, setMode ] = useState( "select" );
  const [ transitionSource, setTransitionSource ] = useState( null );
  const [ activeTab, setActiveTab ] = useState( "table" );
  const [ simState, setSimState ] = useState( null );
  const [ simLog, setSimLog ] = useState( [] );
  const [ simRunning, setSimRunning ] = useState( false );
  const [ seqInput, setSeqInput ] = useState( "" );
  const [ editingName, setEditingName ] = useState( null );
  const [ editValue, setEditValue ] = useState( "" );
  const [ animEdge, setAnimEdge ] = useState( null );
  const [ dragInfo, setDragInfo ] = useState( null );
  const [ mousePos, setMousePos ] = useState( null );

  const [ leftSidebarOpen, setLeftSidebarOpen ] = useState( true );
  const [ rightSidebarOpen, setRightSidebarOpen ] = useState( true );
  const [ expandedCats, setExpandedCats ] = useState( {} );
  const [ isModalOpen, setIsModalOpen ] = useState( false );

  const [ debugLog, setDebugLog ] = useState( [] );
  const [ showDebug, setShowDebug ] = useState( false );
  const [ layoutAlgo, setLayoutAlgo ] = useState( "auto" );
  const [ nodeTheme, setNodeTheme ] = useState( "default" );
  const svgRef = useRef( null );
  const nameInputRef = useRef( null );
  const fileInputRef = useRef( null );
  // const simRef = useRef( null );

  // Boot up the Physics Engine 
  // useEffect( () =>
  // {
  //   const sim = forceSimulation()
  //     .force( "charge", forceManyBody().strength( -100 ) ) // Organic feel, weak push
  //     .force( "collide", forceCollide().radius( R + 20 ).strength( 0.8 ) ) // Move aside on collision
  //     .force( "link", forceLink().id( d => d.id ).strength( 0 ) ) // Strength 0: Don't fight Cytoscape layouts
  //     // Strong pull toward intended targets (either Cytoscape's layout or User's drop spot)
  //     .force( "x", forceX( d => d.targetX ?? d.x ?? 300 ).strength( 0.4 ) )
  //     .force( "y", forceY( d => d.targetY ?? d.y ?? 300 ).strength( 0.4 ) )
  //     .alphaDecay( 0.05 )
  //     .on( "tick", () =>
  //     {
  //       setNodes( prev => [ ...prev ] );
  //     } );

  //   simRef.current = sim;
  //   return () => sim.stop();
  // }, [] );

  // // Sync structural changes (adding/deleting nodes/edges) to the physics engine
  // useEffect( () =>
  // {
  //   if ( !simRef.current ) return;
  //   simRef.current.nodes( nodes );
  //   const mappedLinks = edges
  //     .filter( e => nodes.some( n => n.id === e.from ) && nodes.some( n => n.id === e.to ) )
  //     .map( e => ( { ...e, source: e.from, target: e.to } ) );
  //   simRef.current.force( "link" ).links( mappedLinks );
  //   simRef.current.alpha( 0.5 ).restart(); // Heat up simulation slightly to accommodate new elements
  // }, [ nodes.length, edges ] ); // Changed dependency to 'edges' object to catch topology changes (D3 issue fix)
  // // }, [ nodes.length, edges.length ] );

  // Derived 
  const nodeMap = useMemo( () => { const m = {}; nodes.forEach( ( n ) => ( m[ n.id ] = n ) ); return m; }, [ nodes ] );
  const allEvents = useMemo( () => [ ...new Set( edges.map( ( e ) => e.event ) ) ], [ edges ] );
  const edgePaths = useMemo( () => computeEdgePaths( nodes, edges ), [ nodes, edges ] );
  const finalSet = useMemo( () => new Set( finalStateIds ), [ finalStateIds ] );
  const theme = NODE_THEMES[ nodeTheme ] || null;

  const pushDebug = useCallback( ( entries ) => { setDebugLog( ( p ) => [ ...entries, ...p ].slice( 0, 200 ) ); }, [] );

  // Canvas dimensions helper - EXPAND TO FILL VISIBLE AREA
  const getCanvasOpts = useCallback( () =>
  {
    const parent = svgRef.current?.parentElement;

    // Read the exact unoccluded client dimensions of the flex container
    const width = parent ? parent.clientWidth : 800;
    const height = parent ? parent.clientHeight : 600;

    return { width, height, padding: 60, initialStateId };
  }, [ initialStateId ] );

  // Layout 
  // const applyLayout = useCallback( ( algo ) =>
  // {
  //   if ( nodes.length === 0 ) return;
  //   const opts = getCanvasOpts();
  //   const laid = layoutWithAlgorithm( nodes, edges, algo || layoutAlgo, opts );
  //   setNodes( laid );
  //   const overlaps = layoutDetectOverlaps( laid, 32 );
  //   pushDebug( [ { severity: overlaps > 0 ? "warn" : "ok", msg: `Layout (${ algo || layoutAlgo }). ${ overlaps } overlap(s).` } ] );
  // }, [ nodes, edges, layoutAlgo, getCanvasOpts, pushDebug ] );
  // 
  const applyLayout = useCallback( ( algo ) =>
  {
    if ( nodes.length === 0 ) return;
    const opts = getCanvasOpts();
    const laid = layoutWithAlgorithm( nodes, edges, algo || layoutAlgo, opts );

    setNodes( prev => prev.map( n =>
    {
      const layoutNode = laid.find( l => l.id === n.id );
      if ( layoutNode )
      {
        return { ...n, x: layoutNode.x, y: layoutNode.y };
      }
      return n;
    } ) );

    // Clear manual edge control points so geometry.js recalculates default routes
    setEdges( prev => prev.map( e => 
    {
      const { cx, cy, ...rest } = e;
      return rest;
    } ) );

    const overlaps = layoutDetectOverlaps( laid, 32 );
    pushDebug( [ { severity: overlaps > 0 ? "warn" : "ok", msg: `Layout (${ algo || layoutAlgo }). ${ overlaps } overlap(s).` } ] );
  }, [ nodes, edges, layoutAlgo, getCanvasOpts, pushDebug ] );

  // // Load machine 
  // const loadMachine = useCallback( ( m, label ) =>
  // {
  //   const diags = validateMachine( m, label );
  //   if ( diags.some( ( d ) => d.severity === "error" ) )
  //   {
  //     pushDebug( diags );
  //     setShowDebug( true );
  //     return;
  //   }
  //   pushDebug( diags );
  //   let loadedNodes = m.nodes.map( ( n ) => ( {
  //     ...n,
  //     targetX: n.targetX ?? n.x,
  //     targetY: n.targetY ?? n.y,
  //     fx: n.fx !== undefined ? n.fx : n.x, // Pin imported nodes to their saved location
  //     fy: n.fy !== undefined ? n.fy : n.y
  //   } ) );
  //   const loadedEdges = m.edges.map( ( e ) => ( {
  //     ...e
  //   } ) );
  //   const overlaps = layoutDetectOverlaps( loadedNodes, 32 );
  //   if ( overlaps > 0 )
  //   {
  //     const el = svgRef.current;
  //     const rect = el ? el.getBoundingClientRect() : null;
  //     loadedNodes = autoLayout( loadedNodes, loadedEdges, {
  //       width: rect ? rect.width : 620,
  //       height: rect ? rect.height : 440,
  //       padding: 60,
  //       initialStateId: m.initialStateId,
  //     } );
  //     // fix due to D3 strictness - ugly
  //     loadedNodes = loadedNodes.map( n => ( { ...n, targetX: n.x, targetY: n.y, fx: n.x, fy: n.y } ) );
  //     pushDebug( [ {
  //       severity: "info",
  //       msg: `Auto-layout: ${ overlaps } overlap(s) fixed in "${ label }".`
  //     } ] );
  //   }
  //   setNodes( loadedNodes );
  //   setEdges( loadedEdges );
  //   setInitialStateId( m.initialStateId || null );
  //   setFinalStateIds( m.finalStateIds ? [ ...m.finalStateIds ] : [] );
  //   setSelectedId( null );
  //   setSelectedType( null );
  //   setSimState( null );
  //   setSimLog( [] );
  //   setSimRunning( false );
  //   setTransitionSource( null );
  //   setMode( "select" );
  //   resetIdCounter( 200 );
  //   if ( simRef.current ) simRef.current.alpha( 1 ).restart(); // Wake up physics
  // }, [ pushDebug ] );
  const loadMachine = useCallback( ( m, label ) =>
  {
    const diags = validateMachine( m, label );
    if ( diags.some( ( d ) => d.severity === "error" ) ) { pushDebug( diags ); setShowDebug( true ); return; }
    pushDebug( diags );

    const opts = getCanvasOpts();

    let loadedNodes = m.nodes.map( ( n ) =>
    {
      let x = n.x ?? ( opts.width / 2 );
      let y = n.y ?? ( opts.height / 2 );

      x = Math.max( 40, Math.min( opts.width - 40, x ) );
      y = Math.max( 40, Math.min( opts.height - 40, y ) );

      return { ...n, x, y };
    } );

    let loadedEdges = m.edges.map( ( e ) => ( { ...e } ) );
    const overlaps = layoutDetectOverlaps( loadedNodes, 32 );

    if ( overlaps > 0 )
    {
      const laid = autoLayout( loadedNodes, loadedEdges, opts );
      loadedNodes = loadedNodes.map( n =>
      {
        const lNode = laid.find( l => l.id === n.id );
        return { ...n, x: lNode?.x ?? n.x, y: lNode?.y ?? n.y };
      } );

      // Clear manual edge control points because auto-layout altered the geometry
      loadedEdges = loadedEdges.map( e => 
      {
        const { cx, cy, ...rest } = e;
        return rest;
      } );

      pushDebug( [ { severity: "info", msg: `Auto-layout: ${ overlaps } overlap(s) fixed in "${ label }".` } ] );
    }

    setNodes( loadedNodes );
    setEdges( loadedEdges );
    setInitialStateId( m.initialStateId || null );
    setFinalStateIds( m.finalStateIds ? [ ...m.finalStateIds ] : [] );
    setSelectedId( null );
    setSelectedType( null );
    setSimState( null );
    setSimLog( [] );
    setSimRunning( false );
    setTransitionSource( null );
    setMode( "select" );
    resetIdCounter( 200 );
  }, [ pushDebug, getCanvasOpts ] );

  // Export 
  const download = useCallback( ( data, filename ) =>
  {
    const blob = new Blob( [ JSON.stringify( data, null, 2 ) ], { type: "application/json" } );
    const url = URL.createObjectURL( blob );
    const a = document.createElement( "a" ); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL( url );
  }, [] );

  const exportCurrent = useCallback( () =>
  {
    download( { version: "1.0.0", format: "hhgttg-fsm", machines: { exported: { label: "Exported", category: "Custom", nodes, edges, initialStateId, finalStateIds } } }, "blastedgargles-42.json" );
    pushDebug( [ { severity: "info", msg: "Exported current machine." } ] );
  }, [ nodes, edges, initialStateId, finalStateIds, download, pushDebug ] );

  const exportAll = useCallback( () =>
  {
    download( { version: "1.0.0", format: "hhgttg-fsm", machines: presets }, "blasted-gargles-presets.json" );
    pushDebug( [ { severity: "info", msg: `Exported ${ Object.keys( presets ).length } presets.` } ] );
  }, [ presets, download, pushDebug ] );

  // Export
  const exportSVG = useCallback( () =>
  {
    const svg = svgRef.current; if ( !svg ) return;
    const clone = svg.cloneNode( true );
    const rect = svg.getBoundingClientRect();
    clone.setAttribute( "width", rect.width ); clone.setAttribute( "height", rect.height );
    clone.setAttribute( "xmlns", "http://www.w3.org/2000/svg" );
    const s = document.createElement( "style" );

    // Inject the complete set of CSS variables and font rules
    s.textContent = `:root{--bg:#0d1117;--sf:#161b22;--s2:#1c2333;--bd:#30363d;--fg:#c9d1d9;--fd:#8b949e;--ac:#58a6ff;--a2:#3fb950;--a3:#d2a8ff;--wr:#d29922;--er:#f85149;--gd:rgba(48,54,61,0.4)} text{font-family:'Source Code Pro',monospace}`;

    clone.insertBefore( s, clone.firstChild );
    const blob = new Blob( [ new XMLSerializer().serializeToString( clone ) ], { type: "image/svg+xml" } );
    const url = URL.createObjectURL( blob );
    const a = document.createElement( "a" ); a.href = url; a.download = "gargle-blaster.svg"; a.click();
    URL.revokeObjectURL( url );
  }, [] );

  const exportPNG = useCallback( () =>
  {
    const svg = svgRef.current; if ( !svg ) return;
    const rect = svg.getBoundingClientRect(); const scale = 2;
    const clone = svg.cloneNode( true );
    clone.setAttribute( "width", rect.width ); clone.setAttribute( "height", rect.height );
    clone.setAttribute( "xmlns", "http://www.w3.org/2000/svg" );
    const s = document.createElement( "style" );

    // Inject the complete set of CSS variables and font rules
    s.textContent = `:root{--bg:#0d1117;--sf:#161b22;--s2:#1c2333;--bd:#30363d;--fg:#c9d1d9;--fd:#8b949e;--ac:#58a6ff;--a2:#3fb950;--a3:#d2a8ff;--wr:#d29922;--er:#f85149;--gd:rgba(48,54,61,0.4)} text{font-family:'Source Code Pro',monospace}`;

    clone.insertBefore( s, clone.firstChild );
    const data = new XMLSerializer().serializeToString( clone );
    const img = new Image();
    img.onload = () =>
    {
      const c = document.createElement( "canvas" ); c.width = rect.width * scale; c.height = rect.height * scale;
      const ctx = c.getContext( "2d" ); ctx.scale( scale, scale );
      ctx.fillStyle = "#0d1117"; ctx.fillRect( 0, 0, rect.width, rect.height );
      ctx.drawImage( img, 0, 0, rect.width, rect.height );
      c.toBlob( ( blob ) => { const url = URL.createObjectURL( blob ); const a = document.createElement( "a" ); a.href = url; a.download = "gargle-blaster.png"; a.click(); URL.revokeObjectURL( url ); }, "image/png" );
    };
    img.src = "data:image/svg+xml;base64," + btoa( unescape( encodeURIComponent( data ) ) );
  }, [] );

  // Import 
  const handleImport = useCallback( ( e ) =>
  {
    const file = e.target.files?.[ 0 ]; if ( !file ) return;
    const reader = new FileReader();
    reader.onload = ( ev ) =>
    {
      let data; try { data = JSON.parse( ev.target.result ); } catch ( err ) { pushDebug( [ { severity: "error", msg: `JSON: ${ err.message }` } ] ); setShowDebug( true ); return; }
      const { diags, machines } = validatePresetFile( data ); pushDebug( diags );
      const cnt = Object.keys( machines ).length;
      if ( cnt === 0 ) { pushDebug( [ { severity: "error", msg: "No valid machines." } ] ); setShowDebug( true ); return; }
      setPresets( ( p ) => ( { ...p, ...machines } ) );
      pushDebug( [ { severity: "ok", msg: `Imported ${ cnt } from "${ file.name }".` } ] );
      if ( cnt === 1 ) { const k = Object.keys( machines )[ 0 ]; loadMachine( machines[ k ], machines[ k ].label || k ); }
      setShowDebug( true );
    };
    reader.onerror = () => { pushDebug( [ { severity: "error", msg: "File read failed." } ] ); setShowDebug( true ); };
    reader.readAsText( file ); e.target.value = "";
  }, [ pushDebug, loadMachine ] );

  // Validation 
  const currentDiags = useMemo( () => nodes.length === 0 ? [] : validateMachine( { nodes, edges, initialStateId, finalStateIds }, "editor" ), [ nodes, edges, initialStateId, finalStateIds ] );

  // Canvas interactions 
  const handleSvgClick = useCallback( ( e ) =>
  {
    if ( e.target !== svgRef.current && e.target.tagName !== "rect" ) return;
    const r = svgRef.current.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;

    if ( mode === "addState" )
    {
      const id = uid();
      setNodes( ( p ) => [ ...p, { id, name: `s${ nodes.length }`, x, y } ] );
      if ( nodes.length === 0 ) setInitialStateId( id );
      setSelectedId( id );
      setSelectedType( "node" );
      return;
    }
    if ( mode === "select" )
    {
      setSelectedId( null );
      setSelectedType( null );
    }
  }, [ mode, nodes.length ] );
  const handleNodeClick = useCallback( ( e, nid ) => { e.stopPropagation(); if ( mode === "addTransition" ) { if ( !transitionSource ) setTransitionSource( nid ); else { const id = uid(); setEdges( ( p ) => [ ...p, { id, from: transitionSource, to: nid, event: `E${ edges.length }` } ] ); setTransitionSource( null ); setSelectedId( id ); setSelectedType( "edge" ); } return; } setSelectedId( nid ); setSelectedType( "node" ); }, [ mode, transitionSource, edges.length ] );
  const handleEdgeClick = useCallback( ( e, eid ) => { e.stopPropagation(); if ( mode === "select" ) { setSelectedId( eid ); setSelectedType( "edge" ); } }, [ mode ] );
  // const handleMouseDown = useCallback( ( e, nid ) => { if ( mode !== "select" ) return; e.stopPropagation(); e.preventDefault(); const r = svgRef.current.getBoundingClientRect(); setDragInfo( { nid, sx: e.clientX - r.left, sy: e.clientY - r.top, ox: nodeMap[ nid ]?.x || 0, oy: nodeMap[ nid ]?.y || 0 } ); }, [ mode, nodeMap ] );

  // useEffect( () => { if ( !dragInfo ) return; const hm = ( e ) => { const r = svgRef.current.getBoundingClientRect(); setNodes( ( p ) => p.map( ( n ) => n.id === dragInfo.nid ? { ...n, x: dragInfo.ox + e.clientX - r.left - dragInfo.sx, y: dragInfo.oy + e.clientY - r.top - dragInfo.sy } : n ) ); }; const hu = () => setDragInfo( null ); window.addEventListener( "mousemove", hm ); window.addEventListener( "mouseup", hu ); return () => { window.removeEventListener( "mousemove", hm ); window.removeEventListener( "mouseup", hu ); }; }, [ dragInfo ] );

  // const handleMouseDown = useCallback( ( e, nid ) =>
  // {
  //   if ( mode !== "select" ) return;
  //   e.stopPropagation(); e.preventDefault();
  //   const r = svgRef.current.getBoundingClientRect();
  //   const node = nodeMap[ nid ];
  //   setDragInfo( { nid, sx: e.clientX - r.left, sy: e.clientY - r.top, ox: node?.x || 0, oy: node?.y || 0 } );
  // }, [ mode, nodeMap ] );

  // Node interaction hook
  const handleMouseDown = useCallback( ( e, nid ) =>
  {
    if ( mode !== "select" ) return;
    e.stopPropagation(); e.preventDefault();
    const r = svgRef.current.getBoundingClientRect();
    const node = nodeMap[ nid ];
    setDragInfo( { type: "node", id: nid, sx: e.clientX - r.left, sy: e.clientY - r.top, ox: node?.x || 0, oy: node?.y || 0 } );
  }, [ mode, nodeMap ] );

  // Edge handle interaction hook
  const handleEdgeHandleMouseDown = useCallback( ( e, eid ) =>
  {
    if ( mode !== "select" ) return;
    e.stopPropagation(); e.preventDefault();
    setDragInfo( { type: "edge", id: eid } );
  }, [ mode ] );

  // UPDATED: Dragging useEffect
  // useEffect( () =>
  // {
  //   if ( !dragInfo ) return;
  //   const hm = ( e ) =>
  //   {
  //     const r = svgRef.current.getBoundingClientRect();
  //     const newX = dragInfo.ox + e.clientX - r.left - dragInfo.sx;
  //     const newY = dragInfo.oy + e.clientY - r.top - dragInfo.sy;

  //     setNodes( ( p ) => p.map( ( n ) =>
  //     {
  //       if ( n.id === dragInfo.nid )
  //       {
  //         n.fx = newX; n.fy = newY;          // Force physics position
  //         n.targetX = newX; n.targetY = newY; // Update target so it stays when dropped
  //         n.x = newX; n.y = newY;
  //       }
  //       return n;
  //     } ) );
  //   };
  //   const hu = () =>
  //   {
  //     setNodes( ( p ) => p.map( ( n ) =>
  //     {
  //       if ( n.id === dragInfo.nid ) { n.fx = null; n.fy = null; } // Release to physics engine
  //       return n;
  //     } ) );
  //     if ( simRef.current ) simRef.current.alphaTarget( 0 ); // Let it cool down
  //     setDragInfo( null );
  //   };
  //   window.addEventListener( "mousemove", hm ); window.addEventListener( "mouseup", hu );
  //   return () => { window.removeEventListener( "mousemove", hm ); window.removeEventListener( "mouseup", hu ); };
  // }, [ dragInfo ] );

  // UPDATED: Dragging useEffect v3
  // Track Drag Moves & Update Intended Targets
  // useEffect( () =>
  // {
  //   if ( !dragInfo ) return;

  //   const hm = ( e ) =>
  //   {
  //     const r = svgRef.current.getBoundingClientRect();
  //     const newX = dragInfo.ox + e.clientX - r.left - dragInfo.sx;
  //     const newY = dragInfo.oy + e.clientY - r.top - dragInfo.sy;

  //     setNodes( ( p ) => p.map( ( n ) =>
  //     {
  //       if ( n.id === dragInfo.nid )
  //       {
  //         n.fx = newX; n.fy = newY; // Hold it to the cursor
  //         n.targetX = newX; n.targetY = newY; // Make this the new sacrosanct position
  //       }
  //       return n;
  //     } ) );
  //   };

  //   const hu = () =>
  //   {
  //     setNodes( ( p ) => p.map( ( n ) =>
  //     {
  //       if ( n.id === dragInfo.nid )
  //       {
  //         n.fx = null; n.fy = null; // Release back to physics...
  //         // ...but because we updated targetX/Y, forceX/Y will hold it right here.
  //       }
  //       return n;
  //     } ) );
  //     if ( simRef.current ) simRef.current.alphaTarget( 0 );
  //     setDragInfo( null );
  //   };

  //   window.addEventListener( "mousemove", hm ); window.addEventListener( "mouseup", hu );
  //   return () => { window.removeEventListener( "mousemove", hm ); window.removeEventListener( "mouseup", hu ); };
  // }, [ dragInfo ] );
  // useEffect( () =>
  // {
  //   if ( !dragInfo ) return;

  //   const hm = ( e ) =>
  //   {
  //     const r = svgRef.current.getBoundingClientRect();
  //     const newX = dragInfo.ox + e.clientX - r.left - dragInfo.sx;
  //     const newY = dragInfo.oy + e.clientY - r.top - dragInfo.sy;

  //     setNodes( ( p ) => p.map( ( n ) =>
  //     {
  //       if ( n.id === dragInfo.nid )
  //       {
  //         return { ...n, x: newX, y: newY };
  //       }
  //       return n;
  //     } ) );
  //   };

  //   const hu = () => setDragInfo( null );

  //   window.addEventListener( "mousemove", hm );
  //   window.addEventListener( "mouseup", hu );
  //   return () =>
  //   {
  //     window.removeEventListener( "mousemove", hm );
  //     window.removeEventListener( "mouseup", hu );
  //   };
  // }, [ dragInfo ] );

  // Universal drag tracking hook
  useEffect( () =>
  {
    if ( !dragInfo ) return;
    const hm = ( e ) =>
    {
      const r = svgRef.current.getBoundingClientRect();
      const mouseX = e.clientX - r.left;
      const mouseY = e.clientY - r.top;

      if ( dragInfo.type === "node" )
      {
        const newX = dragInfo.ox + mouseX - dragInfo.sx;
        const newY = dragInfo.oy + mouseY - dragInfo.sy;
        setNodes( ( p ) => p.map( ( n ) => n.id === dragInfo.id ? { ...n, x: newX, y: newY } : n ) );
      }
      else if ( dragInfo.type === "edge" )
      {
        setEdges( ( p ) => p.map( ( ed ) => ed.id === dragInfo.id ? { ...ed, cx: mouseX, cy: mouseY } : ed ) );
      }
    };

    const hu = () => setDragInfo( null );
    window.addEventListener( "mousemove", hm );
    window.addEventListener( "mouseup", hu );
    return () =>
    {
      window.removeEventListener( "mousemove", hm );
      window.removeEventListener( "mouseup", hu );
    };
  }, [ dragInfo ] );


  useEffect( () => { if ( mode !== "addTransition" || !transitionSource ) return; const hm = ( e ) => { const r = svgRef.current?.getBoundingClientRect(); if ( r ) setMousePos( { x: e.clientX - r.left, y: e.clientY - r.top } ); }; window.addEventListener( "mousemove", hm ); return () => window.removeEventListener( "mousemove", hm ); }, [ mode, transitionSource ] );

  // Node/Edge operations 
  const deleteNode = useCallback( ( id ) => { setNodes( ( p ) => p.filter( ( n ) => n.id !== id ) ); setEdges( ( p ) => p.filter( ( e ) => e.from !== id && e.to !== id ) ); if ( initialStateId === id ) setInitialStateId( null ); setFinalStateIds( ( p ) => p.filter( ( f ) => f !== id ) ); setSelectedId( null ); setSelectedType( null ); }, [ initialStateId ] );
  const deleteEdge = useCallback( ( id ) => { setEdges( ( p ) => p.filter( ( e ) => e.id !== id ) ); setSelectedId( null ); setSelectedType( null ); }, [] );
  const renameNode = useCallback( ( id, name ) => { setNodes( ( p ) => p.map( ( n ) => ( n.id === id ? { ...n, name } : n ) ) ); }, [] );
  const renameEdge = useCallback( ( id, event ) => { setEdges( ( p ) => p.map( ( e ) => ( e.id === id ? { ...e, event } : e ) ) ); }, [] );
  const toggleFinal = useCallback( ( id ) => { setFinalStateIds( ( p ) => p.includes( id ) ? p.filter( ( f ) => f !== id ) : [ ...p, id ] ); }, [] );
  const startEditing = useCallback( () => { if ( selectedType === "node" ) { const n = nodeMap[ selectedId ]; if ( n ) { setEditingName( { t: "node", id: selectedId } ); setEditValue( n.name ); } } else if ( selectedType === "edge" ) { const e = edges.find( ( e ) => e.id === selectedId ); if ( e ) { setEditingName( { t: "edge", id: selectedId } ); setEditValue( e.event ); } } }, [ selectedType, selectedId, nodeMap, edges ] );
  const commitEdit = useCallback( () => { if ( !editingName || !editValue.trim() ) { setEditingName( null ); return; } if ( editingName.t === "node" ) renameNode( editingName.id, editValue.trim() ); else renameEdge( editingName.id, editValue.trim() ); setEditingName( null ); }, [ editingName, editValue, renameNode, renameEdge ] );
  useEffect( () => { if ( editingName && nameInputRef.current ) nameInputRef.current.focus(); }, [ editingName ] );
  const addTransFromTable = useCallback( ( fid, ev, tid ) => { const ex = edges.find( ( e ) => e.from === fid && e.event === ev ); if ( ex ) setEdges( ( p ) => p.map( ( e ) => ( e.id === ex.id ? { ...e, to: tid } : e ) ) ); else setEdges( ( p ) => [ ...p, { id: uid(), from: fid, to: tid, event: ev } ] ); }, [ edges ] );
  const scaleAll = useCallback( ( delta ) =>
  {
    setNodes( ( p ) => p.map( ( n ) => ( { ...n, r: Math.max( 10, ( n.r || R ) + delta * 2 ), fontSize: Math.max( 6, ( n.fontSize || 11 ) + delta ) } ) ) );
    setEdges( ( p ) => p.map( ( e ) => ( { ...e, fontSize: Math.max( 6, ( e.fontSize || 11 ) + delta ) } ) ) );
  }, [] );

  const scaleSelected = useCallback( ( delta ) =>
  {
    if ( selectedType === "node" && selectedId )
    {
      setNodes( ( p ) => p.map( ( n ) => n.id === selectedId ? { ...n, r: Math.max( 10, ( n.r || R ) + delta * 2 ), fontSize: Math.max( 6, ( n.fontSize || 11 ) + delta ) } : n ) );
    } else if ( selectedType === "edge" && selectedId )
    {
      setEdges( ( p ) => p.map( ( e ) => e.id === selectedId ? { ...e, fontSize: Math.max( 6, ( e.fontSize || 11 ) + delta ) } : e ) );
    }
  }, [ selectedType, selectedId ] );
  // Simulation 
  const simStep = useCallback( ( ev ) => { if ( !simState ) return; const edge = edges.find( ( e ) => e.from === simState && e.event === ev ); if ( !edge ) return; setAnimEdge( edge.id ); setTimeout( () => { setSimState( edge.to ); setSimLog( ( p ) => [ ...p, { event: ev, from: nodeMap[ edge.from ]?.name || edge.from, to: nodeMap[ edge.to ]?.name || edge.to } ] ); setAnimEdge( null ); }, 350 ); }, [ simState, edges, nodeMap ] );
  const simReset = useCallback( () => { setSimState( initialStateId ); setSimLog( [] ); setAnimEdge( null ); }, [ initialStateId ] );
  const startSim = useCallback( () => { setSimRunning( true ); setSimState( initialStateId ); setSimLog( [] ); setActiveTab( "simulate" ); }, [ initialStateId ] );
  const stopSim = useCallback( () => { setSimRunning( false ); setSimState( null ); setSimLog( [] ); setAnimEdge( null ); }, [] );
  const runSequence = useCallback( () => { if ( !simState ) return; const evs = seqInput.split( "," ).map( ( s ) => s.trim() ).filter( Boolean ); let cur = simState; const log = []; for ( const ev of evs ) { const edge = edges.find( ( e ) => e.from === cur && e.event === ev ); if ( !edge ) { log.push( { event: ev, from: nodeMap[ cur ]?.name || cur, to: "[UNDEF]" } ); break; } log.push( { event: ev, from: nodeMap[ edge.from ]?.name || edge.from, to: nodeMap[ edge.to ]?.name || edge.to } ); cur = edge.to; } setSimState( cur ); setSimLog( ( p ) => [ ...p, ...log ] ); }, [ simState, seqInput, edges, nodeMap ] );

  // Analysis 
  const analysis = useMemo( () => ( { reachable: getReachable( nodes, edges, initialStateId ), dead: getDeadStates( nodes, edges, finalStateIds ), nondet: checkDeterminism( edges ), unhandled: getUnhandledEvents( nodes, edges ), minimized: hopcroftMinimize( nodes, edges, initialStateId, finalStateIds ), strings: genStrings( nodes, edges, initialStateId, finalStateIds, 6 ) } ), [ nodes, edges, initialStateId, finalStateIds ] );
  const generatedCode = useMemo( () => generateCode( nodes, edges, initialStateId, finalStateIds ), [ nodes, edges, initialStateId, finalStateIds ] );
  const selectedNode = selectedType === "node" ? nodeMap[ selectedId ] : null;
  const selectedEdge = selectedType === "edge" ? edges.find( ( e ) => e.id === selectedId ) : null;
  const availableEvents = useMemo( () => simState ? [ ...new Set( edges.filter( ( e ) => e.from === simState ).map( ( e ) => e.event ) ) ] : [], [ simState, edges ] );

  // Tree Presets Hierarchy 
  const presetsByCat = useMemo( () => { const c = {}; Object.entries( presets ).forEach( ( [ k, p ] ) => { const cat = p.category || "Other"; if ( !c[ cat ] ) c[ cat ] = []; c[ cat ].push( { key: k, ...p } ); } ); return c; }, [ presets ] );
  const toggleCat = useCallback( ( cat ) => { setExpandedCats( ( prev ) => ( { ...prev, [ cat ]: !prev[ cat ] } ) ); }, [] );

  // Style helpers 
  const tb = ( t ) => ( { padding: "7px 12px", background: activeTab === t ? "var(--sf)" : "transparent", color: activeTab === t ? "var(--fg)" : "var(--fd)", border: "none", borderBottom: activeTab === t ? "2px solid var(--ac)" : "2px solid transparent", cursor: "pointer", fontFamily: "'Barlow',sans-serif", fontSize: "12px", fontWeight: activeTab === t ? 600 : 400, textTransform: "uppercase", letterSpacing: "0.02em" } );
  const bt = ( a ) => ( { padding: "5px 12px", background: a ? "var(--ac)" : "var(--sf)", color: a ? "#0d1117" : "var(--fd)", border: "1px solid " + ( a ? "var(--ac)" : "var(--bd)" ), cursor: "pointer", fontFamily: "'Barlow',sans-serif", fontSize: "12px", fontWeight: 500 } );
  const sb = { padding: "3px 10px", background: "var(--sf)", color: "var(--fd)", border: "1px solid var(--bd)", cursor: "pointer", fontFamily: "'Barlow',sans-serif", fontSize: "11px" };
  const db = { ...sb, color: "#f85149", borderColor: "#f85149" };
  const sc = { error: "#f85149", warn: "#d29922", info: "#8b949e", ok: "#3fb950" };
  const selStyle = { background: "var(--s2)", color: "var(--fg)", border: "1px solid var(--bd)", padding: "4px 6px", fontFamily: "'Barlow',sans-serif", fontSize: "11px" };

  // Render 
  return (
    <div style={ { width: "100vw", height: "100vh", display: "flex", flexDirection: "column", fontFamily: "'Barlow',sans-serif", background: "var(--bg)", color: "var(--fg)", overflow: "hidden", position: "absolute", top: 0, left: 0 } }>
      <style>{ STYLES }</style>

      {/* Toolbar */ }
      <div style={ { display: "flex", alignItems: "center", gap: "8px", padding: "6px 12px", borderBottom: "1px solid var(--bd)", background: "var(--sf)", flexShrink: 0, flexWrap: "wrap" } }>
        <span
          style={ { fontFamily: "'Source Code Pro',monospace", fontSize: "24px", fontWeight: 600, color: "var(--ac)", letterSpacing: "0.05em", marginLeft: "4px", cursor: "pointer" } }
          onClick={ () => setIsModalOpen( true ) }>Pan Galactic Gargle Blaster</span>
        <span style={ { fontSize: "10px", color: "var(--fd)" } }>.    FSMs FTW!    .</span>

        <div style={ { display: "flex", gap: "3px", marginLeft: "6px" } }>
          <button style={ bt( mode === "select" ) } onClick={ () => { setMode( "select" ); setTransitionSource( null ); } }>Select</button>
          <button style={ bt( mode === "addState" ) } onClick={ () => { setMode( "addState" ); setTransitionSource( null ); } }>+ State</button>
          <button style={ bt( mode === "addTransition" ) } onClick={ () => { setMode( "addTransition" ); setTransitionSource( null ); } }>+ Edge</button>
        </div>
        { mode === "addTransition" && transitionSource && <span style={ { fontSize: "11px", color: "var(--ac)" } }>From: { nodeMap[ transitionSource ]?.name }</span> }

        <div style={ { marginLeft: "auto", display: "flex", gap: "3px", alignItems: "center", flexWrap: "wrap" } }>
          {/* Toggles the Left Sidebar instead of a dropdown */ }

          <button style={ bt( leftSidebarOpen ) } onClick={ () => setLeftSidebarOpen( !leftSidebarOpen ) }>
            { leftSidebarOpen ? "◀ Presets" : "▶ Presets" } ({ Object.keys( presets ).length })
          </button>
          {/* Global Scaling Controls */ }
          <button style={ bt( false ) } onClick={ () => scaleAll( 1 ) }>A+</button>
          <button style={ bt( false ) } onClick={ () => scaleAll( -1 ) }>A-</button>

          <input ref={ fileInputRef } type="file" accept=".json" onChange={ handleImport } style={ { display: "none" } } />
          <button style={ bt( false ) } onClick={ () => fileInputRef.current?.click() }>Import</button>
          <button style={ bt( false ) } onClick={ exportCurrent }>Export</button>
          <button style={ bt( false ) } onClick={ exportAll }>All</button>
          <button style={ bt( false ) } onClick={ exportSVG } disabled={ nodes.length === 0 }>SVG</button>
          <button style={ bt( false ) } onClick={ exportPNG } disabled={ nodes.length === 0 }>PNG</button>
          <select value={ layoutAlgo } onChange={ ( e ) => setLayoutAlgo( e.target.value ) } style={ selStyle }>
            { Object.entries( LAYOUT_ALGORITHMS ).map( ( [ k, v ] ) => <option key={ k } value={ k }>{ v.name }</option> ) }
          </select>
          <button style={ bt( false ) } onClick={ () => applyLayout( layoutAlgo ) } disabled={ nodes.length === 0 }>Layout</button>
          <select value={ nodeTheme } onChange={ ( e ) => setNodeTheme( e.target.value ) } style={ selStyle }>
            { Object.entries( NODE_THEMES ).map( ( [ k, t ] ) => <option key={ k } value={ k }>{ t.name }</option> ) }
          </select>

          <button style={ { ...bt( showDebug ), fontSize: "11px", padding: "5px 8px", color: currentDiags.some( ( d ) => d.severity === "error" ) ? "var(--er)" : currentDiags.some( ( d ) => d.severity === "warn" ) ? "var(--wr)" : "var(--fd)" } } onClick={ () => setShowDebug( !showDebug ) }>Debug{ currentDiags.filter( ( d ) => d.severity === "error" ).length > 0 ? ` (${ currentDiags.filter( ( d ) => d.severity === "error" ).length })` : "" }</button>
          { simRunning ? <button style={ { ...bt( false ), borderColor: "var(--er)", color: "var(--er)" } } onClick={ stopSim }>Stop</button> : <button style={ { ...bt( false ), borderColor: "var(--a2)", color: "var(--a2)" } } onClick={ startSim } disabled={ !initialStateId }>Sim</button> }
          <button style={ bt( rightSidebarOpen ) } onClick={ () => setRightSidebarOpen( !rightSidebarOpen ) }>
            { rightSidebarOpen ? "Analysis ▶" : "◀ Analysis" }
          </button>
        </div>
      </div>

      {/* Debug panel */ }
      { showDebug && <div style={ { background: "var(--s2)", borderBottom: "1px solid var(--bd)", padding: "8px 12px", maxHeight: "160px", overflow: "auto", flexShrink: 0 } }>
        <div style={ { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" } }><span style={ { fontSize: "10px", color: "var(--fd)", textTransform: "uppercase", letterSpacing: "0.08em" } }>Diagnostics</span><button style={ { ...sb, fontSize: "10px" } } onClick={ () => setDebugLog( [] ) }>Clear</button></div>
        { currentDiags.length > 0 && <div style={ { marginBottom: "4px" } }>{ currentDiags.map( ( d, i ) => <div key={ `c${ i }` } style={ { fontFamily: "'Source Code Pro',monospace", fontSize: "11px", color: sc[ d.severity ] || "var(--fd)", lineHeight: 1.5 } }>[{ d.severity.toUpperCase() }] { d.msg }</div> ) }</div> }
        { debugLog.length > 0 && <div>{ debugLog.slice( 0, 40 ).map( ( d, i ) => <div key={ `d${ i }` } style={ { fontFamily: "'Source Code Pro',monospace", fontSize: "11px", color: sc[ d.severity ] || "var(--fd)", lineHeight: 1.5 } }>[{ d.severity.toUpperCase() }] { d.msg }</div> ) }</div> }
      </div> }

      {/* Main area */ }
      <div style={ { display: "flex", flex: 1, overflow: "hidden" } }>

        {/* Left Sidebar: Collapsible Preset Tree */ }
        { leftSidebarOpen && (
          <div style={ { flex: "0 0 240px", borderRight: "1px solid var(--bd)", background: "var(--sf)", display: "flex", flexDirection: "column", overflow: "hidden" } }>
            <div style={ { padding: "8px 12px", borderBottom: "1px solid var(--bd)", fontSize: "12px", fontWeight: 600, color: "var(--fg)" } }>
              Preset Library
            </div>
            <div style={ { flex: 1, overflowY: "auto", padding: "8px 0" } }>
              { Object.entries( presetsByCat ).map( ( [ cat, items ] ) => (
                <div key={ cat }>
                  <div
                    style={ { padding: "6px 12px", fontSize: "11px", color: "var(--a3)", textTransform: "uppercase", letterSpacing: "0.05em", cursor: "pointer", display: "flex", alignItems: "center", userSelect: "none" } }
                    onClick={ () => toggleCat( cat ) }
                  >
                    <span style={ { width: "16px", display: "inline-block", fontSize: "9px" } }>{ expandedCats[ cat ] ? "▼" : "▶" }</span>
                    { cat } ({ items.length })
                  </div>
                  { expandedCats[ cat ] && items.map( ( p ) => (
                    <div
                      key={ p.key }
                      style={ { padding: "6px 12px 6px 32px", cursor: "pointer", fontSize: "12px", borderLeft: "2px solid transparent" } }
                      onMouseEnter={ ( e ) => { e.currentTarget.style.background = "var(--s2)"; e.currentTarget.style.borderLeftColor = "var(--ac)"; } }
                      onMouseLeave={ ( e ) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderLeftColor = "transparent"; } }
                      onClick={ () => loadMachine( p, p.label ) }
                    >
                      <div style={ { color: "var(--fg)" } }>{ p.label }</div>
                      { p.description && <div style={ { fontSize: "10px", color: "var(--fd)", marginTop: "2px", lineHeight: 1.2 } }>{ p.description.slice( 0, 60 ) }{ p.description.length > 60 ? "..." : "" }</div> }
                    </div>
                  ) ) }
                </div>
              ) ) }
            </div>
          </div>
        ) }

        {/* Canvas */ }
        {/* <div style={ { flex: 1, position: "relative", borderRight: "1px solid var(--bd)", minWidth: 0 } }>
          <svg ref={ svgRef } width="100%" height="100%" style={ { background: "var(--bg)", cursor: mode === "addState" ? "crosshair" : mode === "addTransition" ? "pointer" : "default" } } onClick={ handleSvgClick }> */}
        {/* Canvas */ }
        <div style={ { flex: 1, position: "relative", borderRight: "1px solid var(--bd)", minWidth: 0, overflow: "hidden" } }>
          <svg ref={ svgRef } width="100%" height="100%" style={ { display: "block", background: "var(--bg)", cursor: mode === "addState" ? "crosshair" : mode === "addTransition" ? "pointer" : "default" } } onClick={ handleSvgClick }>
            <defs>
              <marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth={ ARROW_SIZE } markerHeight={ ARROW_SIZE } orient="auto-start-reverse"><path d="M 0 1 L 10 5 L 0 9 z" fill="var(--fd)" /></marker>
              <marker id="ahs" viewBox="0 0 10 10" refX="9" refY="5" markerWidth={ ARROW_SIZE } markerHeight={ ARROW_SIZE } orient="auto-start-reverse"><path d="M 0 1 L 10 5 L 0 9 z" fill="var(--ac)" /></marker>
              <marker id="ahg" viewBox="0 0 10 10" refX="9" refY="5" markerWidth={ ARROW_SIZE } markerHeight={ ARROW_SIZE } orient="auto-start-reverse"><path d="M 0 1 L 10 5 L 0 9 z" fill="var(--a2)" /></marker>
              <marker id="aho" viewBox="0 0 10 10" refX="9" refY="5" markerWidth={ ARROW_SIZE } markerHeight={ ARROW_SIZE } orient="auto-start-reverse"><path d="M 0 1 L 10 5 L 0 9 z" fill="var(--wr)" /></marker>
              <marker id="ahi" viewBox="0 0 10 10" refX="9" refY="5" markerWidth={ ARROW_SIZE } markerHeight={ ARROW_SIZE } orient="auto-start-reverse"><path d="M 0 1 L 10 5 L 0 9 z" fill="var(--a3)" /></marker>
              <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M 24 0 L 0 0 0 24" fill="none" stroke="var(--gd)" strokeWidth="0.5" /></pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
            { mode === "addTransition" && transitionSource && mousePos && nodeMap[ transitionSource ] && <line x1={ nodeMap[ transitionSource ].x } y1={ nodeMap[ transitionSource ].y } x2={ mousePos.x } y2={ mousePos.y } stroke="var(--ac)" strokeWidth="1.5" strokeDasharray="6 4" opacity="0.6" /> }
            { edgePaths.map( ( ep ) =>
            {
              const iS = selectedId === ep.id;
              const iA = animEdge === ep.id;
              const isOutgoing = selectedType === "node" && ep.from === selectedId;
              const isIncoming = selectedType === "node" && ep.to === selectedId;

              const { stroke } = resolveEdgeColors( ep, theme, { isSimActive: iA, isSelected: iS, isOutgoing, isIncoming } );

              let markerEnd = "url(#ah)";
              if ( iA ) markerEnd = "url(#ahg)";
              else if ( iS ) markerEnd = "url(#ahs)";
              else if ( isOutgoing ) markerEnd = "url(#aho)";
              else if ( isIncoming ) markerEnd = "url(#ahi)";

              return (
                <g key={ ep.id }>
                  <path d={ ep.d } fill="none" stroke="transparent" strokeWidth="14" style={ { cursor: "pointer" } } onClick={ ( e ) => handleEdgeClick( e, ep.id ) } />
                  <path d={ ep.d } fill="none" stroke={ stroke } strokeWidth={ iS || iA ? 2.5 : 1.5 } markerEnd={ markerEnd } style={ { pointerEvents: "none" } } />
                  {/* Edge Loop Inner Text Update */ }
                  <text x={ ep.labelX } y={ ep.labelY } textAnchor="middle" fill={ iS ? "var(--ac)" : isOutgoing ? "var(--wr)" : isIncoming ? "var(--a3)" : "var(--fg)" } fontSize={ ep.fontSize || 11 } fontFamily="'Source Code Pro',monospace" fontWeight="500" style={ { cursor: "pointer", userSelect: "none" } } onClick={ ( e ) => handleEdgeClick( e, ep.id ) }>{ ep.event }</text>
                  {/* <text x={ ep.labelX } y={ ep.labelY } textAnchor="middle" fill={ iS ? "var(--ac)" : isOutgoing ? "var(--wr)" : isIncoming ? "var(--a3)" : "var(--fg)" } fontSize="11" fontFamily="'Source Code Pro',monospace" fontWeight="500" style={ { cursor: "pointer", userSelect: "none" } } onClick={ ( e ) => handleEdgeClick( e, ep.id ) }>{ ep.event }</text> */ }

                  { iS && (
                    <>
                      <line x1={ nodeMap[ ep.from ]?.x } y1={ nodeMap[ ep.from ]?.y } x2={ ep.ctrlX } y2={ ep.ctrlY } stroke="var(--bd)" strokeDasharray="3 3" opacity="0.4" pointerEvents="none" />
                      <line x1={ nodeMap[ ep.to ]?.x } y1={ nodeMap[ ep.to ]?.y } x2={ ep.ctrlX } y2={ ep.ctrlY } stroke="var(--bd)" strokeDasharray="3 3" opacity="0.4" pointerEvents="none" />
                      <circle cx={ ep.ctrlX } cy={ ep.ctrlY } r={ 8 } fill="var(--bg)" stroke="var(--ac)" strokeWidth="1.5" style={ { cursor: "crosshair" } } onMouseDown={ ( e ) => handleEdgeHandleMouseDown( e, ep.id ) } />
                    </>
                  ) }
                </g>
              );
            } ) }
            {/* Initial State Indicator Update */ }
            { initialStateId && nodeMap[ initialStateId ] && <line x1={ nodeMap[ initialStateId ].x - ( nodeMap[ initialStateId ].r || R ) - 30 } y1={ nodeMap[ initialStateId ].y } x2={ nodeMap[ initialStateId ].x - ( nodeMap[ initialStateId ].r || R ) - 2 } y2={ nodeMap[ initialStateId ].y } stroke="var(--ac)" strokeWidth="2" markerEnd="url(#ahs)" /> }
            {/* { initialStateId && nodeMap[ initialStateId ] && <line x1={ nodeMap[ initialStateId ].x - R - 30 } y1={ nodeMap[ initialStateId ].y } x2={ nodeMap[ initialStateId ].x - R - 2 } y2={ nodeMap[ initialStateId ].y } stroke="var(--ac)" strokeWidth="2" markerEnd="url(#ahs)" /> } */ }
            { nodes.map( ( n, idx ) =>
            {
              // const iS = selectedId === n.id, iSm = simRunning && simState === n.id, iF = finalSet.has( n.id );
              // const iU = initialStateId && !analysis.reachable.has( n.id ), iD = analysis.dead.has( n.id );
              // const { stroke: sk, fill: fk } = resolveNodeColors( n, idx, theme, { initialStateId, finalSet, isSimActive: iSm, isSelected: iS, isTransSource: transitionSource === n.id, isUnreachable: iU, isDead: iD } );
              // return <g key={ n.id } style={ { cursor: mode === "select" ? "grab" : "pointer" } } onClick={ ( e ) => handleNodeClick( e, n.id ) } onMouseDown={ ( e ) => handleMouseDown( e, n.id ) }>
              //   <circle cx={ n.x } cy={ n.y } r={ R } fill={ fk } stroke={ sk } strokeWidth={ iS || iSm ? 2.5 : 1.5 } style={ iSm ? { animation: "pN 1.5s ease-in-out infinite" } : {} } />
              //   { iF && <circle cx={ n.x } cy={ n.y } r={ R - 4 } fill="none" stroke={ sk } strokeWidth="1.5" style={ { pointerEvents: "none" } } /> }
              const iS = selectedId === n.id, iSm = simRunning && simState === n.id, iF = finalSet.has( n.id );
              const iU = initialStateId && !analysis.reachable.has( n.id ), iD = analysis.dead.has( n.id );
              const { stroke: sk, fill: fk } = resolveNodeColors( n, idx, theme, { initialStateId, finalSet, isSimActive: iSm, isSelected: iS, isTransSource: transitionSource === n.id, isUnreachable: iU, isDead: iD } );
              return <g key={ n.id } style={ { cursor: mode === "select" ? "grab" : "pointer" } } onClick={ ( e ) => handleNodeClick( e, n.id ) } onMouseDown={ ( e ) => handleMouseDown( e, n.id ) }>
                <circle cx={ n.x } cy={ n.y } r={ n.r || R } fill={ fk } stroke={ sk } strokeWidth={ iS || iSm ? 2.5 : 1.5 } style={ iSm ? { animation: "pN 1.5s ease-in-out infinite" } : {} } />
                { iF && <circle cx={ n.x } cy={ n.y } r={ ( n.r || R ) - 4 } fill="none" stroke={ sk } strokeWidth="1.5" style={ { pointerEvents: "none" } } /> }
                <text x={ n.x } y={ n.y + 1 } textAnchor="middle" dominantBaseline="central" fill={ iSm ? "var(--a2)" : iS ? "var(--ac)" : iU ? "#484f58" : "var(--fg)" } fontSize={ n.fontSize || 11 } fontFamily="'Source Code Pro',monospace" fontWeight="500" style={ { pointerEvents: "none", userSelect: "none" } }>{ n.name }</text>
              </g>;
            } ) }
          </svg>
          { nodes.length === 0 && <div style={ { position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", color: "var(--fd)", fontSize: "13px", textAlign: "center", lineHeight: 1.8, pointerEvents: "none" } }><div style={ { fontFamily: "'Source Code Pro',monospace", fontSize: "14px", color: "var(--ac)", marginBottom: "8px" } }>(state, event) =&gt; newState</div>Click "+ State" or load a preset.<br />Use "Import" to load a .json file.</div> }
          {/* { ( selectedNode || selectedEdge ) && <div style={ { position: "absolute", bottom: "12px", left: "12px", background: "var(--s2)", border: "1px solid var(--bd)", padding: "10px 14px", display: "flex", flexDirection: "column", gap: "6px", fontSize: "12px", minWidth: "180px" } }>
            { selectedNode && <><div style={ { color: "var(--fd)", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em" } }>State</div>{ editingName?.t === "node" && editingName?.id === selectedNode.id ? <input ref={ nameInputRef } value={ editValue } onChange={ ( e ) => setEditValue( e.target.value ) } onBlur={ commitEdit } onKeyDown={ ( e ) => { if ( e.key === "Enter" ) commitEdit(); if ( e.key === "Escape" ) setEditingName( null ); } } style={ { width: "120px" } } /> : <div style={ { fontFamily: "'Source Code Pro',monospace", color: "var(--ac)", cursor: "pointer" } } onClick={ startEditing }>{ selectedNode.name }</div> }<div style={ { display: "flex", gap: "4px", flexWrap: "wrap" } }><button style={ sb } onClick={ startEditing }>Rename</button><button style={ sb } onClick={ () => setInitialStateId( selectedNode.id ) }>{ initialStateId === selectedNode.id ? "Initial *" : "Set Initial" }</button><button style={ sb } onClick={ () => toggleFinal( selectedNode.id ) }>{ finalSet.has( selectedNode.id ) ? "Final *" : "Toggle Final" }</button><button style={ db } onClick={ () => deleteNode( selectedNode.id ) }>Delete</button></div></> }
            { selectedEdge && <><div style={ { color: "var(--fd)", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em" } }>Transition</div><div style={ { fontFamily: "'Source Code Pro',monospace", fontSize: "12px" } }>{ nodeMap[ selectedEdge.from ]?.name } --[{ editingName?.t === "edge" && editingName?.id === selectedEdge.id ? <input ref={ nameInputRef } value={ editValue } onChange={ ( e ) => setEditValue( e.target.value ) } onBlur={ commitEdit } onKeyDown={ ( e ) => { if ( e.key === "Enter" ) commitEdit(); if ( e.key === "Escape" ) setEditingName( null ); } } style={ { width: "80px", display: "inline" } } /> : <span style={ { color: "var(--ac)", cursor: "pointer" } } onClick={ startEditing }>{ selectedEdge.event }</span> }]--&gt; { nodeMap[ selectedEdge.to ]?.name }</div><div style={ { display: "flex", gap: "4px" } }><button style={ sb } onClick={ startEditing }>Rename</button><button style={ db } onClick={ () => deleteEdge( selectedEdge.id ) }>Delete</button></div></> } */}
          { ( selectedNode || selectedEdge ) && <div style={ { position: "absolute", bottom: "12px", left: "12px", background: "var(--s2)", border: "1px solid var(--bd)", padding: "10px 14px", display: "flex", flexDirection: "column", gap: "6px", fontSize: "12px", minWidth: "180px" } }>
            { selectedNode && <><div style={ { color: "var(--fd)", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em" } }>State</div>{ editingName?.t === "node" && editingName?.id === selectedNode.id ? <input ref={ nameInputRef } value={ editValue } onChange={ ( e ) => setEditValue( e.target.value ) } onBlur={ commitEdit } onKeyDown={ ( e ) => { if ( e.key === "Enter" ) commitEdit(); if ( e.key === "Escape" ) setEditingName( null ); } } style={ { width: "120px" } } /> : <div style={ { fontFamily: "'Source Code Pro',monospace", color: "var(--ac)", cursor: "pointer" } } onClick={ startEditing }>{ selectedNode.name }</div> }<div style={ { display: "flex", gap: "4px", flexWrap: "wrap" } }><button style={ sb } onClick={ startEditing }>Rename</button><button style={ sb } onClick={ () => scaleSelected( 1 ) }>A+</button><button style={ sb } onClick={ () => scaleSelected( -1 ) }>A-</button><button style={ sb } onClick={ () => setInitialStateId( selectedNode.id ) }>{ initialStateId === selectedNode.id ? "Initial *" : "Set Initial" }</button><button style={ sb } onClick={ () => toggleFinal( selectedNode.id ) }>{ finalSet.has( selectedNode.id ) ? "Final *" : "Toggle Final" }</button><button style={ db } onClick={ () => deleteNode( selectedNode.id ) }>Delete</button></div></> }
            { selectedEdge && <><div style={ { color: "var(--fd)", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em" } }>Transition</div><div style={ { fontFamily: "'Source Code Pro',monospace", fontSize: "12px" } }>{ nodeMap[ selectedEdge.from ]?.name } --[{ editingName?.t === "edge" && editingName?.id === selectedEdge.id ? <input ref={ nameInputRef } value={ editValue } onChange={ ( e ) => setEditValue( e.target.value ) } onBlur={ commitEdit } onKeyDown={ ( e ) => { if ( e.key === "Enter" ) commitEdit(); if ( e.key === "Escape" ) setEditingName( null ); } } style={ { width: "80px", display: "inline" } } /> : <span style={ { color: "var(--ac)", cursor: "pointer" } } onClick={ startEditing }>{ selectedEdge.event }</span> }]--&gt; { nodeMap[ selectedEdge.to ]?.name }</div><div style={ { display: "flex", gap: "4px" } }><button style={ sb } onClick={ startEditing }>Rename</button><button style={ sb } onClick={ () => scaleSelected( 1 ) }>A+</button><button style={ sb } onClick={ () => scaleSelected( -1 ) }>A-</button><button style={ db } onClick={ () => deleteEdge( selectedEdge.id ) }>Delete</button></div></> }
          </div> }

        </div>

        {/* Right Side panel */ }
        { rightSidebarOpen && (
          <div style={ { flex: "0 0 50%", maxWidth: "25vw", minWidth: "10vw", display: "flex", flexDirection: "column", background: "var(--sf)", overflow: "hidden" } }>
            <div style={ { display: "flex", borderBottom: "1px solid var(--bd)", flexShrink: 0 } }>{ [ "table", "simulate", "code", "analysis" ].map( ( t ) => <button key={ t } style={ tb( t ) } onClick={ () => setActiveTab( t ) }>{ t }</button> ) }</div>
            <div style={ { flex: 1, overflow: "auto", padding: "12px" } }>
              { activeTab === "table" && <div><div style={ { fontSize: "10px", color: "var(--fd)", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.08em" } }>Transition Table</div>{ nodes.length === 0 ? <div style={ { color: "var(--fd)", fontSize: "12px" } }>No states.</div> : <div style={ { overflowX: "auto" } }><table style={ { borderCollapse: "collapse", fontFamily: "'Source Code Pro',monospace", fontSize: "11px", width: "100%" } }><thead><tr><th style={ { padding: "6px 8px", borderBottom: "1px solid var(--bd)", textAlign: "left", color: "var(--fd)", fontWeight: 500 } }>State</th>{ allEvents.map( ( ev ) => <th key={ ev } style={ { padding: "6px 8px", borderBottom: "1px solid var(--bd)", textAlign: "center", color: "var(--a3)", fontWeight: 500 } }>{ ev }</th> ) }</tr></thead><tbody>{ nodes.map( ( n ) => <tr key={ n.id }><td style={ { padding: "6px 8px", borderBottom: "1px solid var(--bd)", color: initialStateId === n.id ? "var(--ac)" : "var(--fg)", fontWeight: initialStateId === n.id ? 600 : 400 } }>{ n.name }{ initialStateId === n.id ? " *" : "" }{ finalSet.has( n.id ) ? " (F)" : "" }</td>{ allEvents.map( ( ev ) => { const edge = edges.find( ( e ) => e.from === n.id && e.event === ev ); return <td key={ ev } style={ { padding: "4px 6px", borderBottom: "1px solid var(--bd)", textAlign: "center" } }><select value={ edge ? edge.to : "" } onChange={ ( e ) => { if ( e.target.value === "" && edge ) deleteEdge( edge.id ); else if ( e.target.value ) addTransFromTable( n.id, ev, e.target.value ); } }><option value="">--</option>{ nodes.map( ( t ) => <option key={ t.id } value={ t.id }>{ t.name }</option> ) }</select></td>; } ) }</tr> ) }</tbody></table></div> }</div> }
              { activeTab === "simulate" && <div><div style={ { fontSize: "10px", color: "var(--fd)", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.08em" } }>Simulator</div>{ !simRunning ? <div style={ { fontSize: "12px", color: "var(--fd)" } }>Press "Sim" to start.{ !initialStateId && " Set an initial state first." }</div> : <div style={ { display: "flex", flexDirection: "column", gap: "12px" } }><div><span style={ { fontSize: "11px", color: "var(--fd)" } }>Current: </span><span style={ { fontFamily: "'Source Code Pro',monospace", color: "var(--a2)", fontWeight: 600 } }>{ nodeMap[ simState ]?.name || "--" }</span>{ simState && finalSet.has( simState ) && <span style={ { marginLeft: "8px", fontSize: "10px", color: "var(--a2)", border: "1px solid var(--a2)", padding: "1px 6px" } }>ACCEPTING</span> }</div><div><div style={ { fontSize: "10px", color: "var(--fd)", marginBottom: "4px", textTransform: "uppercase" } }>Fire Event</div><div style={ { display: "flex", gap: "4px", flexWrap: "wrap" } }>{ allEvents.map( ( ev ) => { const c = availableEvents.includes( ev ); return <button key={ ev } disabled={ !c } onClick={ () => simStep( ev ) } style={ { ...sb, fontFamily: "'Source Code Pro',monospace", opacity: c ? 1 : 0.3, cursor: c ? "pointer" : "not-allowed", borderColor: c ? "var(--ac)" : "var(--bd)", color: c ? "var(--ac)" : "var(--fd)" } }>{ ev }</button>; } ) }</div></div><div><div style={ { fontSize: "10px", color: "var(--fd)", marginBottom: "4px", textTransform: "uppercase" } }>Sequence</div><div style={ { display: "flex", gap: "4px" } }><input value={ seqInput } onChange={ ( e ) => setSeqInput( e.target.value ) } placeholder="FETCH, RESOLVE, ..." style={ { flex: 1 } } /><button style={ sb } onClick={ runSequence }>Run</button></div><div style={ { fontSize: "10px", color: "var(--fd)", marginTop: "2px" } }>events.reduce(transition, init)</div></div><button style={ { ...sb, alignSelf: "flex-start" } } onClick={ simReset }>Reset</button><div><div style={ { fontSize: "10px", color: "var(--fd)", marginBottom: "4px", textTransform: "uppercase" } }>Log</div><div style={ { maxHeight: "200px", overflow: "auto", fontFamily: "'Source Code Pro',monospace", fontSize: "11px", lineHeight: 1.7 } }>{ simLog.length === 0 && <span style={ { color: "var(--fd)" } }>No events.</span> }{ simLog.map( ( e, i ) => <div key={ i }><span style={ { color: "var(--fd)" } }>{ i + 1 }.</span> { e.from } <span style={ { color: "var(--a3)" } }>--[{ e.event }]--&gt;</span> <span style={ { color: e.to === "[UNDEF]" ? "var(--er)" : "var(--a2)" } }>{ e.to }</span></div> ) }</div></div></div> }</div> }
              { activeTab === "code" && <div><div style={ { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" } }><div style={ { fontSize: "10px", color: "var(--fd)", textTransform: "uppercase", letterSpacing: "0.08em" } }>Generated TypeScript</div><button style={ sb } onClick={ () => navigator.clipboard?.writeText( generatedCode ) }>Copy</button></div><pre style={ { fontFamily: "'Source Code Pro',monospace", fontSize: "11.5px", lineHeight: 1.65, background: "var(--bg)", border: "1px solid var(--bd)", padding: "12px", overflow: "auto", maxHeight: "calc(100vh - 180px)", whiteSpace: "pre", tabSize: 2 } } dangerouslySetInnerHTML={ { __html: highlightTS( generatedCode ) } } /></div> }
              { activeTab === "analysis" && <div style={ { display: "flex", flexDirection: "column", gap: "14px", fontSize: "12px" } }><div style={ { fontSize: "10px", color: "var(--fd)", textTransform: "uppercase", letterSpacing: "0.08em" } }>Analysis</div>{ nodes.length === 0 ? <div style={ { color: "var(--fd)" } }>No machine.</div> : <><div><div style={ { fontWeight: 600, marginBottom: "4px", color: "var(--ac)" } }>Reachability</div>{ !initialStateId ? <div style={ { color: "var(--fd)" } }>No initial state.</div> : <div style={ { fontFamily: "'Source Code Pro',monospace", fontSize: "11px", lineHeight: 1.6 } }>{ nodes.map( ( n ) => <div key={ n.id }><span style={ { color: analysis.reachable.has( n.id ) ? "var(--a2)" : "#484f58" } }>{ analysis.reachable.has( n.id ) ? "[ok]" : "[unreachable]" }</span> { n.name }</div> ) }</div> }</div><div><div style={ { fontWeight: 600, marginBottom: "4px", color: "var(--ac)" } }>Determinism</div>{ analysis.nondet.length === 0 ? <div style={ { color: "var(--a2)" } }>Deterministic.</div> : <div style={ { fontFamily: "'Source Code Pro',monospace", fontSize: "11px", lineHeight: 1.6, color: "var(--er)" } }>{ analysis.nondet.map( ( d, i ) => <div key={ i }>({ nodeMap[ d.state ]?.name }, { d.event }) multi</div> ) }</div> }</div><div><div style={ { fontWeight: 600, marginBottom: "4px", color: "var(--ac)" } }>Dead States</div>{ finalStateIds.length === 0 ? <div style={ { color: "var(--fd)" } }>No final states.</div> : analysis.dead.size === 0 ? <div style={ { color: "var(--a2)" } }>None.</div> : <div style={ { fontFamily: "'Source Code Pro',monospace", fontSize: "11px" } }>{ [ ...analysis.dead ].map( ( id ) => <div key={ id } style={ { color: "var(--wr)" } }>{ nodeMap[ id ]?.name }</div> ) }</div> }</div><div><div style={ { fontWeight: 600, marginBottom: "4px", color: "var(--ac)" } }>Completeness</div>{ Object.keys( analysis.unhandled ).length === 0 ? <div style={ { color: "var(--a2)" } }>Complete.</div> : <div style={ { fontFamily: "'Source Code Pro',monospace", fontSize: "11px", lineHeight: 1.6 } }>{ Object.entries( analysis.unhandled ).map( ( [ n, e ] ) => <div key={ n }>{ n }: <span style={ { color: "var(--wr)" } }>{ e.join( ", " ) }</span></div> ) }</div> }</div><div><div style={ { fontWeight: 600, marginBottom: "4px", color: "var(--ac)" } }>Minimization (Hopcroft)</div>{ !analysis.minimized ? <div style={ { color: "var(--fd)" } }>Cannot minimize.</div> : <div><div style={ { fontSize: "11px" } }>{ nodes.length }S/{ edges.length }E -&gt; { analysis.minimized.nodes.length }S/{ analysis.minimized.edges.length }E</div>{ analysis.minimized.nodes.length < nodes.length ? <div style={ { fontFamily: "'Source Code Pro',monospace", fontSize: "11px", lineHeight: 1.6, background: "var(--bg)", padding: "6px", border: "1px solid var(--bd)", marginTop: "4px" } }>{ analysis.minimized.nodes.map( ( mn ) => <div key={ mn.id }>{ mn.name.includes( "/" ) ? `{${ mn.name }}` : mn.name }{ analysis.minimized.initialStateId === mn.id ? " (init)" : "" }{ analysis.minimized.finalStateIds.includes( mn.id ) ? " (final)" : "" }</div> ) }</div> : <div style={ { color: "var(--a2)", fontSize: "11px", marginTop: "2px" } }>Already minimal.</div> }</div> }</div><div><div style={ { fontWeight: 600, marginBottom: "4px", color: "var(--ac)" } }>Language Examples</div>{ finalStateIds.length === 0 ? <div style={ { color: "var(--fd)" } }>No final states.</div> : <div style={ { fontFamily: "'Source Code Pro',monospace", fontSize: "11px", lineHeight: 1.6 } }>{ analysis.strings.accepted.length > 0 && <div style={ { marginBottom: "4px" } }><div style={ { color: "var(--a2)" } }>Accepted:</div>{ analysis.strings.accepted.map( ( s, i ) => <div key={ i }>[{ s }]</div> ) }</div> }{ analysis.strings.rejected.length > 0 && <div><div style={ { color: "var(--er)" } }>Rejected:</div>{ analysis.strings.rejected.map( ( s, i ) => <div key={ i }>[{ s }]</div> ) }</div> }</div> }</div></> }</div> }
            </div>
          </div>
        ) }
      </div>
      {/* About Modal */ }
      { isModalOpen && (
        <div
          style={ { position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", background: "rgba(0,0,0,0.7)", zIndex: 9999, display: "flex", justifyContent: "center", alignItems: "center" } }
          onClick={ () => setIsModalOpen( false ) }
        >
          <div
            style={ { width: "50vw", height: "60vh", background: "var(--sf)", border: "1px solid var(--bd)", borderRadius: "12px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "32px", cursor: "pointer", overflow: "hidden" } }
            onClick={ () => setIsModalOpen( false ) }
          >
            <img
              src={ aboutImage }
              alt="Pan Galactic Gargle Blaster: Finite State Machines across the space-time continuum, by Shaurya Agarwal, © 2026, https://github.com/shauryashaurya"
              style={ { width: "50vw", height: "50vh", borderRadius: "1px", objectFit: "CONTAIN", marginBottom: "24px", border: "0px solid var(--ac)" } }
            />
            <div style={ { fontFamily: "'Barlow',sans-serif", fontSize: "28px", fontWeight: 700, color: "var(--fg)", marginBottom: "8px" } }>
              THE PAN GALACTIC GARGLE BLASTER
            </div>
            <div style={ { fontFamily: "'Source Code Pro',monospace", fontSize: "14px", color: "var(--fd)" } }>
              design Finite State Machines across the space-time continuum <br /> Shaurya Agarwal, © 2026, https://github.com/shauryashaurya
            </div>
          </div>
        </div>
      ) }
    </div>
  );
}
