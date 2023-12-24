/**
 * Handle all state specifically relating the diagram.
 *
 * This state relates solely to the diagram and handles many low-level details
 * about the visualization and, as a result, is updated for most user
 * interactions with the diagram (the only exceptions here would be panning and
 * zooming).
 *
 * @packageDocumentation
 */
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import {
  Connection,
  Edge,
  EdgeChange,
  Node,
  NodeChange,
  addEdge,
  OnNodesChange,
  OnEdgesChange,
  OnConnect,
  applyNodeChanges,
  applyEdgeChanges,
  ReactFlowInstance,
} from "reactflow";

import * as Sdf from "../../types/Sdf";
import * as Types from "../../types/Types";
import { forceArray } from "../../app/Util";

export type DiagramState = {
  // Suggestion: Specify node type further so we have Node<NodeData, NodeType>
  nodeMap: Map<NodeKey, Node<NodeData>>;
  edges: Edge<EdgeData>[];
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  layoutHash: number;
  reactFlowInstance: ReactFlowInstance | null;
  isTa2: boolean;
  showWarnings: boolean;
  connectionStartObject: {
    source: Sdf.EventId | Sdf.EntityId;
    sourceHandle: string | null;
  } | null;
};

export type RectanglePosition = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type LayoutSpec = {
  events: Array<PositionWithId<Sdf.EventId>>;
  entities: Array<PositionWithId<Sdf.EntityId>>;
  backgrounds: {
    events: RectanglePosition;
    eventsGraphg: RectanglePosition;
    entities: RectanglePosition;
    entitiesGraphg: RectanglePosition;
  };
  layoutHash: number;
};

export type DiagramAction = {
  getNode: <K extends NodeKey>(k: K) => Node<NodeKeyToNodeData<K>>;
  updateDocument: (
    nm: DiagramState["nodeMap"],
    ea: Array<Edge<EdgeData>>,
    isTa2: boolean,
  ) => void;
  setLayout: (x: LayoutSpec) => void;
  setHoverState: (x: Sdf.EventEntityId, y: boolean) => void;
  toggleExpanded: (x: Sdf.EventEntityId) => void;
  updateEdgeVisibility: (s?: DiagramStore) => void;
  toggleCollapseChildren: (x: Sdf.EventId) => void;
  setReactFlowInstance: (x: ReactFlowInstance) => void;
  setConnectionStartObject: (x: DiagramStore["connectionStartObject"]) => void;
  updateDynamicHandles: () => void;
  setShowWarnings: (x: boolean) => void;
};

export type DiagramStore = DiagramState & DiagramAction;

export type PositionWithId<IdType> = {
  id: IdType;
  x: number;
  y: number;
};

export type EventNodeData = {
  event: Sdf.Event;
  parentIds: Array<Sdf.EventId>;
  name: string;
  expanded: boolean;
  hovered: boolean;
  collapseChildren: boolean;
  participants: EventNodeFieldData[];
  group: "event-graphg" | "event-schema";
  ta2Type: Types.EventStatus | null;
  isRoot: boolean;
  warnings: Array<string>;
};

export type EventNodeFieldData = {
  name: string;
  role: string;
  portType: string;
  fillers: Array<EventFieldFillerData>;
};

export type EventFieldFillerData = {
  entity: Sdf.Entity | Sdf.Event;
  linker: Sdf.Participant | Sdf.Value;
  ta2Type: Types.EventStatus | null;
};

export type EntityNodeData = {
  name: string;
  entity: Sdf.Entity;
  expanded: boolean;
  hovered: boolean;
  ta2Type: Types.EventStatus | null;
  group: "entity-graphg" | "entity-schema";
  ta2wd_node: Sdf.WdNode | Sdf.WdNode[] | undefined;
  isSchemaArg: boolean;
  warnings: Array<string>;
};

export type BgNodeData = {
  which: "event" | "entity";
  isTa2: boolean;
  width: number;
  height: number;
};

export type NodeData = EventNodeData | EntityNodeData | BgNodeData;
export type BgNodeKey =
  | "eventBackground"
  | "entityBackground"
  | "eventGraphgBackground"
  | "entityGraphgBackground";
export type NodeKey = Sdf.EventId | Sdf.EntityId | BgNodeKey;

/** Determine the type of the node based on the type of the key. */
type NodeKeyToNodeData<K extends NodeKey> = K extends Sdf.EventId
  ? EventNodeData
  : K extends Sdf.EntityId
    ? EntityNodeData
    : K extends BgNodeKey
      ? BgNodeData
      : never;

export type ParticipantEdgeData = {
  schemaObjectId: Sdf.ParticipantId | Sdf.ProvenanceDatumId | Sdf.ValueId;
  // Suggestion: Type better
  ta2Type?: string;
};

export type Ta2CorefEdgeData = {
  schemaObjectId: Sdf.ValueId | Sdf.ProvenanceDatumId;
};

export type BeforeAfterEdgeData = {
  relation: Sdf.Relation;
};

export type ParentChildEdgeData = {
  importance: number | null;
  event: Sdf.Event;
  childId: Sdf.EventId;
};

export type EdgeData =
  | ParticipantEdgeData
  | BeforeAfterEdgeData
  | Ta2CorefEdgeData
  | ParentChildEdgeData;

export const getNodeFromMap = <K extends NodeKey>(
  map: Map<NodeKey, Node<NodeData>>,
  key: K,
): Node<NodeKeyToNodeData<K>> => {
  const value = map.get(key);
  if (!value) throw new Error(`Could not find node for key "${key}".`);
  return value as any;
};

/**
 * Logic governing whether a given edge should be displayed given the state of
 * the diagram.
 */
const showEdge = (
  nodeMap: DiagramState["nodeMap"],
  e: Edge<EdgeData>,
): boolean => {
  const s = getNodeFromMap(nodeMap, e.source as Sdf.EventEntityId);
  const t = getNodeFromMap(nodeMap, e.target as Sdf.EventEntityId);
  if (!s.hidden && !t.hidden) {
    if (e.type === "beforeAfter") return true;
    if (e.type === "parentChild") {
      if (t.data.group === "event-graphg")
        return t.data.hovered || t.data.expanded;
      return true;
    }

    if (e.type === "participant" || e.type === "ta2Coref") {
      if (
        s.data.hovered ||
        t.data.hovered ||
        s.data.expanded ||
        t.data.expanded
      )
        return true;
    }
  }
  return false;
};

/**
 * We do not need a context manager for this store because the logic of the
 * diagram can operate on an empty diagram without any issue.  Thus, it is
 * accpetable to initialize the diagram in an empty state without burdening the
 * rest of the implmentation.
 */
export const useDiagramStore = create(
  immer<DiagramStore>((set, get) => ({
    nodeMap: new Map(),
    reactFlowInstance: null,
    isTa2: false,
    setReactFlowInstance: (rfi) =>
      set((d) => {
        d.reactFlowInstance = rfi;
      }),

    // Do not use `getNode` from inside of a `set` since it will grab an
    // immutable node instead of the one from the draft.  Use `getNodeFromMap`
    // directly.
    getNode: (key) => getNodeFromMap(get().nodeMap, key),

    edges: [],

    layoutHash: -1,

    showWarnings: false,
    setShowWarnings: (x) =>
      set((s) => {
        s.showWarnings = x;
      }),

    connectionStartObject: null,
    setConnectionStartObject: (cso) =>
      set((s) => {
        s.connectionStartObject = cso;
      }),

    onNodesChange: (changes: NodeChange[]) =>
      set((state) => {
        state.nodeMap = new Map(
          applyNodeChanges(changes, [...state.nodeMap.values()]).map((n) => [
            n.id as NodeKey,
            n,
          ]),
        );
      }),

    onEdgesChange: (changes: EdgeChange[]) => {
      set({
        edges: applyEdgeChanges(changes, get().edges),
      });
    },
    onConnect: (connection: Connection) => {
      set({
        edges: addEdge(connection, get().edges),
      });
    },

    updateDocument: (nodeMap, linkDataArray, isTa2) =>
      set((state) => {
        state.isTa2 = isTa2;
        const prevNodeMap = state.nodeMap;
        Array.from(nodeMap.values()).forEach((n) => {
          const pn = prevNodeMap.get(n.id as NodeKey);
          if (!pn) return;
          Object.assign(n, {
            height: pn.height,
            width: pn.width,
            position: pn.position,
          });
          if ((pn.data as any).expanded) (n.data as any).expanded = true;
          if (pn.type === "nodeBackground") {
            (n.data as BgNodeData).width = (pn.data as BgNodeData).width;
            (n.data as BgNodeData).height = (pn.data as BgNodeData).height;
          }
        });

        state.nodeMap = nodeMap;
        state.edges = linkDataArray;
      }),

    setLayout: ({ events, entities, backgrounds, layoutHash }) =>
      set((state) => {
        events.forEach(
          (p) =>
            (getNodeFromMap(state.nodeMap, p.id).position = { x: p.x, y: p.y }),
        );
        entities.forEach(
          (p) =>
            (getNodeFromMap(state.nodeMap, p.id).position = { x: p.x, y: p.y }),
        );

        const bgArray = [
          ["eventBackground", backgrounds.events],
          ["entityBackground", backgrounds.entities],
          ["eventGraphgBackground", backgrounds.eventsGraphg],
          ["entityGraphgBackground", backgrounds.entitiesGraphg],
        ] as any;
        for (let item of bgArray) {
          const node = getNodeFromMap(
            state.nodeMap,
            item[0],
          ) as Node<BgNodeData>;
          node.data.width = item[1].width;
          node.data.height = item[1].height;
          node.position.x = item[1].x;
          node.position.y = item[1].y;
        }

        state.layoutHash = layoutHash;
      }),

    setHoverState: (atId, hoverState) =>
      set((state) => {
        const node = getNodeFromMap(state.nodeMap, atId);
        node.data.hovered = hoverState;
        state.updateEdgeVisibility(state);
      }),

    toggleExpanded: (atId) =>
      set((state) => {
        const data = getNodeFromMap(state.nodeMap, atId).data;
        data.expanded = !data.expanded;
        state.edges
          .filter(
            (e) =>
              e.type === "participant" &&
              (e.source === atId || e.target === atId),
          )
          .forEach((e) => {
            const edgeData = e.data as ParticipantEdgeData;
            const sourceData = getNodeFromMap(
              state.nodeMap,
              e.source as Sdf.EventId,
            ).data;
            if (sourceData.expanded) e.sourceHandle = edgeData.schemaObjectId;
            else e.sourceHandle = "participant";
          });
      }),

    updateDynamicHandles: () =>
      set((state) => {
        state.edges
          .filter((e) => e.type === "participant")
          .forEach((e) => {
            const edgeData = e.data as ParticipantEdgeData;
            const sourceData = getNodeFromMap(
              state.nodeMap,
              e.source as Sdf.EventId,
            ).data;
            if (sourceData.expanded) e.sourceHandle = edgeData.schemaObjectId;
            else e.sourceHandle = "participant";
          });
      }),

    updateEdgeVisibility: (draftState?: ReturnType<typeof get>) => {
      const setter = (state: ReturnType<typeof get>) => {
        state.edges.forEach((e) => (e.hidden = !showEdge(state.nodeMap, e)));
      };
      // Turn this into a higher-order function if we need to repeat this
      // pattern.
      if (draftState) setter(draftState);
      else set(setter);
    },

    toggleCollapseChildren: (atId) =>
      set((state) => {
        const collapseChildren = (id: Sdf.EventId, collapse: boolean) => {
          const node = getNodeFromMap(state.nodeMap, id);
          if (node.data.ta2Type === "graphg") return;
          node.hidden = collapse;
          if (node.data.collapseChildren && !collapse) return;
          forceArray(node.data.event.children).forEach((c) =>
            collapseChildren(c.child, collapse),
          );
        };

        const node = getNodeFromMap(state.nodeMap, atId);
        const collapse = !node.data.collapseChildren;
        node.data.collapseChildren = collapse;
        forceArray(node.data.event.children).forEach((c) =>
          collapseChildren(c.child, collapse),
        );
        state.updateEdgeVisibility(state);
      }),
  })),
);
