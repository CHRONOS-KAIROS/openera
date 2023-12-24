/**
 * Handles all diagram layouting logic.
 *
 * The event tree layout is handled by
 * [dagre](https://github.com/dagrejs/dagre).  Unfortunately this project has
 * long been unmaintained, although it is mostly feature complete.  There are
 * no suitable alternatives as of August 2023 in terms of functionality and
 * simplicity.
 *
 * @packageDocumentation
 */
import { Node, Edge } from "reactflow";
import dagre from "dagre";
import toposort from "toposort";

import {
  useDiagramStore,
  EdgeData,
  NodeData,
  NodeKey,
  PositionWithId,
  EventNodeData,
  EntityNodeData,
  RectanglePosition,
} from "./Store";
import * as Sdf from "../../types/Sdf";

export const DEFAULT_POS = 100.123;
export const EVENT_GRAPH_ORIGIN = { x: 50, y: 50 };
const eventGraphConfig: dagre.GraphLabel = {
  rankdir: "LR",
  nodesep: 20,
  ranksep: 20,
};
export const nodeBgPadding = 20;
const eventEntityMargin = 30;
const interEntityMargin = 20;

/**
 * Calculate an integer representing the inputs to the layouting logic.
 *
 * This needs to be fast since it will run every time any part of the state
 * updates.  Although the "hash" function currently used is extremely simple,
 * it has worked fine in practice.
 */
const getLayoutHash = (
  nodes: Array<Node>,
  edges: Array<Edge<EdgeData>>,
): number =>
  nodes.map((n) => n.height! + n.width!).reduce((x, y) => x + y, 0) +
  edges.length;

const shouldLayoutNode = (n: Node<unknown>) => !n.hidden && n.height && n.width;

const getEdgesToLayout = () =>
  useDiagramStore
    .getState()
    .edges.filter((e) => e.type === "parentChild" || e.type === "beforeAfter");

/**
 * Decide whether or not to do layout.
 *
 * @returns First element is `true` if layout neds to be redone; second element
 * is the layout hash.
 */
export const shouldDoLayout = (): [boolean, number] => {
  const { nodeMap, layoutHash } = useDiagramStore.getState();
  const nodesToLayout = Array.from(nodeMap.values()).filter(
    (n) => shouldLayoutNode(n) && ["event", "entity"].includes(n.type || ""),
  );
  if (nodesToLayout.some((n) => n.position.x === DEFAULT_POS))
    return [true, -1];

  const currentLayoutHash = getLayoutHash(nodesToLayout, getEdgesToLayout());
  return [currentLayoutHash !== layoutHash, currentLayoutHash];
};

// Sometimes you miss Haskell so much you can't help yourself.
const scanl = <T>(arr: Array<T>, f: (x: T, y: T) => T, init: T) =>
  arr.reduce((x, y) => x.concat([f(x[x.length - 1], y)]), [init]).slice(1);

const getEntityLayout = (
  nodes: Array<Node<NodeData>>,
  edges: Array<Edge<EdgeData>>,
  originY: number,
  isTa2: boolean,
  isGraphg: boolean,
): [Array<PositionWithId<Sdf.EntityId>>, RectanglePosition] => {
  const entityNodes = nodes.filter(
    (n) =>
      shouldLayoutNode(n) &&
      n.type === "entity" &&
      isGraphg === ((n.data as any).ta2Type === "graphg"),
  ) as Array<Node<EntityNodeData>>;

  const edgeCounter = new Map(entityNodes.map((n) => [n.id, 0]));
  edges
    .filter((e) => e.type === "participant")
    .filter((e) => edgeCounter.has(e.target))
    .forEach((e) => edgeCounter.set(e.target, edgeCounter.get(e.target)! + 1));

  // Put most "important" entities first; i.e., ones that participate in many
  // events.
  entityNodes.sort((x, y) => {
    const xCount = edgeCounter.get(x.id)!;
    const yCount = edgeCounter.get(y.id)!;
    return yCount - xCount;
  });

  if (isTa2) {
    const sortKey = (n: Node<NodeData>) => {
      switch ((n.data as any).ta2Type || "") {
        case "matched":
          return 0;
        case "predicted":
          return 1;
        case "not-predicted":
          return 2;
        default:
          return 3;
      }
    };
    entityNodes.sort((x, y) => sortKey(x) - sortKey(y));
  } else {
    const key = (x: Node<EntityNodeData>) => -Number(x.data.isSchemaArg);
    entityNodes.sort((x, y) => key(x) - key(y));
  }

  const viewWidth =
    document.getElementById("diagramContainer")?.offsetWidth || 200;
  const entityWidth = viewWidth - EVENT_GRAPH_ORIGIN.x * 2;

  const entityOrigin = [EVENT_GRAPH_ORIGIN.x, originY + nodeBgPadding];

  const entitySizes = entityNodes.map((n) => [n.width!, n.height!]);
  const interiorEntityWidth = entityWidth - nodeBgPadding;
  const nEntityColumns =
    entitySizes
      .map((s) => s[0])
      .sort((x, y) => y - x)
      .reduce(
        (prev, cur) => {
          const total = prev[1] + interEntityMargin + cur;
          return [prev[0] + Number(total < interiorEntityWidth), total];
        },
        [0, 0],
      )[0] || 1;

  const columnSizes = [...Array(nEntityColumns).keys()].map((col) =>
    entitySizes
      .filter((x, i) => i % nEntityColumns === col)
      .map((x) => x[0])
      .reduce((x, y) => Math.max(x, y), 0),
  );
  const columnPositions = [0].concat(
    scanl(columnSizes, (x, y) => x + y + interEntityMargin, 0),
  );

  const nEntityRows = Math.ceil(entitySizes.length / nEntityColumns);
  const rowSizes = [...Array(nEntityRows).keys()].map((row) =>
    entitySizes
      .slice(row * nEntityColumns, (row + 1) * nEntityColumns)
      .map((x) => x[1])
      .reduce((x, y) => Math.max(x, y), 0),
  );
  const rowPositions = [0].concat(
    scanl(rowSizes, (x, y) => x + y + interEntityMargin, 0),
  );

  const entityPositions = entityNodes.map((n, idx) => ({
    id: n.id as Sdf.EntityId,
    x: entityOrigin[0] + nodeBgPadding + columnPositions[idx % nEntityColumns],
    y:
      entityOrigin[1] +
      nodeBgPadding +
      rowPositions[Math.floor(idx / nEntityColumns)],
  }));

  const entityBgHeight =
    rowSizes.reduce((x, y) => x + y, 0) +
    interEntityMargin * (rowSizes.length - 1) +
    2 * nodeBgPadding;

  const entityBgPosition = {
    width: entityNodes.length ? entityWidth : 200,
    height: entityNodes.length ? entityBgHeight : 100,
    x: entityOrigin[0],
    y: entityOrigin[1],
  };

  return [entityPositions, entityBgPosition];
};

const isEventNode = (n: Node<any>): n is Node<EventNodeData> =>
  n.type === "event";

const getSchemaEventLayout = (
  nodeMap: Map<NodeKey, Node<NodeData>>,
  edges: Array<Edge<EdgeData>>,
  layoutGraph: dagre.graphlib.Graph<{}>,
): Array<PositionWithId<Sdf.EventId>> => {
  const nodes = [...nodeMap.values()];
  const sortedNodeIds = toposort.array(
    nodes.map((n) => n.id),
    edges
      .filter((e) => e.type === "beforeAfter")
      .map((e) => [e.source, e.target]),
  ) as Array<NodeKey>;
  const nodeOrderMap = new Map(sortedNodeIds.map((nid, idx) => [nid, idx]));

  const getOrder = (x: any) => nodeOrderMap.get(x.target) ?? 99999999;
  const beforeAfterKey = (x: Edge, y: Edge) => getOrder(x) - getOrder(y);

  const schemaEventNodes = sortedNodeIds
    .map((nid) => nodeMap.get(nid)!)
    .filter(
      (n) =>
        shouldLayoutNode(n) &&
        isEventNode(n) &&
        n.data.group === "event-schema",
    );

  const eventIdSet = new Set(schemaEventNodes.map((n) => n.id));

  schemaEventNodes.forEach((n, idx) => {
    layoutGraph.setNode(n.id, { id: n.id, width: n.width, height: n.height });
  });

  edges
    .filter((e) => e.type === "parentChild")
    .filter((e) => eventIdSet.has(e.source) && eventIdSet.has(e.target))
    .sort(beforeAfterKey)
    .forEach((e) => layoutGraph.setEdge(e.source, e.target));
  dagre.layout(layoutGraph);

  const eventPositions = layoutGraph
    .nodes()
    .map((id) => layoutGraph.node(id))
    .filter((x) => x)
    .map((n) => ({
      id: (n as any).id,
      x: n.x - n.width! / 2 + EVENT_GRAPH_ORIGIN.x + nodeBgPadding,
      y: n.y - n.height! / 2 + EVENT_GRAPH_ORIGIN.y + nodeBgPadding,
    }));

  return eventPositions;
};

const getGraphgEventLayout = (
  nodes: Array<Node<NodeData>>,
  edges: Array<Edge<EdgeData>>,
  originX: number,
): [Array<PositionWithId<Sdf.EventId>>, RectanglePosition] => {
  const eventNodes = nodes.filter(
    (n) =>
      shouldLayoutNode(n) && isEventNode(n) && n.data.group === "event-graphg",
  );
  const eventNodeIds = new Set(eventNodes.map((n) => n.id));
  const layoutEdges = edges.filter(
    (e) => e.type === "beforeAfter" && eventNodeIds.has(e.source),
  );

  const groups: Array<Set<Sdf.EventId>> = [];
  const conMap: Map<Sdf.EventId, Set<Sdf.EventId>> = new Map();
  layoutEdges.forEach((e) => {
    const s = e.source as Sdf.EventId;
    const t = e.target as Sdf.EventId;
    conMap.set(s, (conMap.get(s) || new Set()).add(t));
    conMap.set(t, (conMap.get(t) || new Set()).add(s));
  });

  const groupedNodes: Set<Sdf.EventId> = new Set();
  const addCons = (n: Sdf.EventId, g: Set<Sdf.EventId>) => {
    g.add(n);
    groupedNodes.add(n);
    (conMap.get(n) || []).forEach((m) => {
      if (!g.has(m)) {
        addCons(m, g);
      }
    });
  };

  eventNodes.reverse().forEach((n) => {
    if (groupedNodes.has(n.id as Sdf.EventId)) return;
    const g: Set<Sdf.EventId> = new Set();
    addCons(n.id as Sdf.EventId, g);
    groups.push(g);
  });
  groups.sort((x, y) => y.size - x.size);

  const posArr: Array<Array<Sdf.EventId>> = [];
  // Suggestion: Determine dynamically
  const nColumns = 4;

  const getNextSpot = () => {
    for (let i = 0; i < posArr.length; ++i) {
      for (let j = 0; j < nColumns; ++j) {
        if (posArr[i][j] === undefined) return [i, j];
      }
    }
    return [posArr.length, 0];
  };

  const sortedGroups: Array<Array<Sdf.EventId>> = [];
  const sortedIds = toposort(
    layoutEdges.map((e) => [e.source as Sdf.EventId, e.target as Sdf.EventId]),
  );
  groups.forEach((g, i) => {
    if (g.size === 1) sortedGroups[i] = [...g.values()];
    else sortedGroups[i] = sortedIds.filter((x) => g.has(x));
  });

  sortedGroups.forEach((g) => {
    const [sr, sc] = getNextSpot();
    [...g].forEach((v, i) => {
      if (!posArr[sr + i]) posArr[sr + i] = Array(nColumns);
      posArr[sr + i][sc] = v;
    });
  });

  const origin = [originX, EVENT_GRAPH_ORIGIN.y];

  const nodeMap = new Map(eventNodes.map((n) => [n.id, n]));
  // Suggestion: Use a node size map for entity backgrounds as well.
  const getNodeSize = (id: string) => {
    const n = nodeMap.get(id);
    if (n) return [n.width!, n.height!];
    return [0, 0];
  };
  const columnSizes = [...Array(nColumns).keys()].map((colIdx) =>
    posArr
      .map((row) => getNodeSize(row[colIdx])[0])
      .reduce((x, y) => Math.max(x, y), 0),
  );
  const columnPositions = [0].concat(
    scanl(columnSizes, (x, y) => x + y + interEntityMargin, 0),
  );

  const rowSizes = posArr.map((row) =>
    row.map((nid) => getNodeSize(nid)[1]).reduce((x, y) => Math.max(x, y), 0),
  );

  const rowPositions = [0].concat(
    scanl(rowSizes, (x, y) => x + y + interEntityMargin, 0),
  );

  const positions = posArr.flatMap((row, ridx) =>
    row.map((id, cidx) => ({
      id: id as Sdf.EventId,
      x: origin[0] + nodeBgPadding + columnPositions[cidx],
      y: origin[1] + nodeBgPadding + rowPositions[ridx],
    })),
  );

  const bgWidth =
    columnSizes.reduce((acc, x) => acc + x) +
    2 * nodeBgPadding +
    (nColumns - 1) * interEntityMargin;
  const bgHeight =
    rowSizes.reduce((x, y) => x + y, 0) +
    interEntityMargin * (rowSizes.length - 1) +
    2 * nodeBgPadding;

  const bgPosition = {
    width: bgWidth,
    height: bgHeight,
    x: originX,
    y: EVENT_GRAPH_ORIGIN.y,
  };

  return [positions, bgPosition];
};

/**
 * Layout all of the visible nodes.
 *
 * Currently, this is redoes the whole layout every time; if necessary, it
 * could be possible to layout only as much as necessary with some finer
 * grained logic.
 */
export const doLayout = () => {
  const [shouldDoLayoutVal, layoutHash] = shouldDoLayout();
  if (!shouldDoLayoutVal) return;

  const { nodeMap, edges, setLayout, isTa2 } = useDiagramStore.getState();
  const nodes = Array.from(nodeMap.values());
  const layoutGraph = new dagre.graphlib.Graph();
  layoutGraph.setGraph(eventGraphConfig);
  layoutGraph.setDefaultEdgeLabel(() => ({}));

  const schemaEventPositions = getSchemaEventLayout(
    nodeMap,
    edges,
    layoutGraph,
  );
  const layoutGraphWidth = isFinite(layoutGraph.graph().width!)
    ? layoutGraph.graph().width!
    : 200;
  const layoutGraphHeight = isFinite(layoutGraph.graph().height!)
    ? layoutGraph.graph().height!
    : 40;

  const eventBgPosition = {
    width: layoutGraphWidth + nodeBgPadding * 2,
    height: layoutGraphHeight + nodeBgPadding * 2,
    x: EVENT_GRAPH_ORIGIN.x,
    y: EVENT_GRAPH_ORIGIN.y,
  };

  const graphgOriginX =
    eventBgPosition.x + eventBgPosition.width + eventEntityMargin;
  const [graphgEventPositions, graphgBgPosition] = getGraphgEventLayout(
    nodes,
    edges,
    graphgOriginX,
  );

  const entityOriginY =
    Math.max(
      graphgBgPosition.y + graphgBgPosition.height,
      eventBgPosition.y + eventBgPosition.height,
    ) + eventEntityMargin;

  const [schemaEntityPositions, entityBgPosition] = getEntityLayout(
    nodes,
    edges,
    entityOriginY,
    isTa2,
    false,
  );

  const [graphgEntityPositions, graphgEntityBgPosition] = getEntityLayout(
    nodes,
    edges,
    entityOriginY,
    isTa2,
    true,
  );

  const graphgEntityXShift =
    entityBgPosition.x + entityBgPosition.width + eventEntityMargin;
  graphgEntityPositions.forEach((p) => (p.x += graphgEntityXShift));
  graphgEntityBgPosition.x += graphgEntityXShift;

  const eventPositions = schemaEventPositions.concat(graphgEventPositions);
  const entityPositions = schemaEntityPositions.concat(graphgEntityPositions);

  setLayout({
    events: eventPositions,
    entities: entityPositions,
    backgrounds: {
      events: eventBgPosition,
      entities: entityBgPosition,
      eventsGraphg: graphgBgPosition,
      entitiesGraphg: graphgEntityBgPosition,
    },
    layoutHash,
  });
};
