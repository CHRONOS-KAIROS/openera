/**
 * Functions for loading an SDF JSON document into ReactFlow state.
 *
 * This file is responsible from translating the SDF JSON into internal state
 * of the ReactFlow diagram.  Thus, it defines the interface between the data
 * format and the display logic.
 *
 * @packageDocumentation
 */
import { Node, Edge, MarkerType } from "reactflow";

import { useDiagramStore, NodeData } from "./Store";
import * as Sdf from "../../types/Sdf";
import * as Types from "../../types/Types";
import { forceArray } from "../../app/Util";
import { DEFAULT_POS, EVENT_GRAPH_ORIGIN, nodeBgPadding } from "./Layout";
import {
  getNodeFromMap,
  NodeKey,
  EventNodeFieldData,
  EventNodeData,
  EntityNodeData,
  EdgeData,
} from "./Store";

export type LinkType = "parentChild" | "participant" | "beforeAfter";

// Suggestion: Better type for edge key
export type EdgeKey = string;

export const makeParentChildLinkId = (
  sourceId: Sdf.EventEntityId,
  targetId: Sdf.EventEntityId,
): EdgeKey => `${sourceId}__parent-of__${targetId}`;

const getTa2EventType = (event: Sdf.Event): Types.EventStatus => {
  if (event.ta1ref === "none") return "graphg";
  if (event.provenance) return "matched";
  if (event.predictionProvenance && (event.confidence || 0) > 0.01)
    return "predicted";
  return "not-predicted";
};

const getTa2EntityType = (
  entity: Sdf.Entity,
  matchedEntities: Set<Sdf.EventEntityId>,
  predictedEntities: Set<Sdf.EventEntityId>,
): Types.EventStatus => {
  if (entity.ta2wd_node) return "graphg";
  if (matchedEntities.has(entity["@id"])) return "matched";
  if (predictedEntities.has(entity["@id"])) return "predicted";
  return "not-predicted";
};

const makeNodeFromEvent = (
  schemaSummary: Types.SchemaSummary,
  eventPrimitives: Map<string, Sdf.EventPrimitive>,
  schemaSummaries: Map<Sdf.DocumentId, Types.SchemaSummary>,
  event: Sdf.Event,
  importance: number | null,
  optional: boolean,
  repeatable: boolean,
  ta2: boolean,
): Node<EventNodeData> => {
  let name = event.name;
  const warnings: Array<string> = [];
  const stripWikiPrefix = (s: string) => s.match(/(wdt?:)?(.*)/)![2];
  if (
    event.wd_node &&
    !eventPrimitives.has(stripWikiPrefix(`${event.wd_node}`))
  )
    warnings.push("event type not found");

  const isSubschema = Boolean(forceArray(event.wd_node)[0]?.match(/^cmu:/));
  const referredSummary = schemaSummaries.get(
    ("" + event.wd_node) as Sdf.DocumentId,
  );
  const rTags = forceArray(referredSummary?.tags);
  const tagsAreSubset = schemaSummary.tags.every((t) => rTags.includes(t));
  if (isSubschema && referredSummary && !tagsAreSubset) {
    warnings.push("referenced schema outside of tagged set");
  }

  if (!isSubschema && !event.description) warnings.push("description empty");
  if (!isSubschema && !event.ta1explanation)
    warnings.push("ta1explanation empty");

  if (optional) name += " (optional)";

  const ta2EventType = ta2 ? getTa2EventType(event) : null;
  return {
    id: event["@id"],
    position: { x: DEFAULT_POS, y: DEFAULT_POS },
    data: {
      name,
      ta2Type: ta2EventType,
      event,
      group: ta2EventType === "graphg" ? "event-graphg" : "event-schema",
      participants: [],
      expanded: false,
      hovered: false,
      collapseChildren: false,
      isRoot: false,
      parentIds: [],
      warnings,
    },
    type: "event",
  };
};

const makeOutlink = (relation: Sdf.Relation): Edge<EdgeData> => ({
  id: relation["@id"],
  source: relation.relationSubject,
  target: forceArray(relation.relationObject)[0]!,
  sourceHandle: "before",
  targetHandle: "after",
  data: {
    relation,
  },
  style: {
    stroke: "gray",
  },
  markerEnd: {
    type: MarkerType.ArrowClosed,
    width: 15,
    height: 15,
  },
  type: "beforeAfter",
});

const makeSchemaGraphGEventLinks = (
  events: Array<Sdf.Event>,
): Array<Edge<EdgeData>> => {
  const pdToEvents = new Map<Sdf.ProvenanceDatumId, Set<Sdf.EventId>>();
  events.forEach((e) =>
    forceArray(e.provenance).forEach((p) => {
      if (!pdToEvents.has(p)) pdToEvents.set(p, new Set());
      pdToEvents.get(p)!.add(e["@id"]);
    }),
  );
  const linkDrawn = new Set<string>();
  const makeCompleteLinks = (
    pdId: Sdf.ProvenanceDatumId,
    s: Set<Sdf.EventId>,
  ): Array<Edge<EdgeData>> => {
    const ids = [...s.values()].sort();
    return ids
      .flatMap((x, idx) =>
        ids.slice(idx + 1).map((y) => {
          const id = `${x}/${y}`;
          if (linkDrawn.has(id)) return null;
          linkDrawn.add(id);
          return {
            id,
            data: {
              schemaObjectId: pdId,
            },
            type: "ta2Coref",
            source: x,
            sourceHandle: "parent",
            target: y,
            targetHandle: "child",
          };
        }),
      )
      .filter((x) => x)
      .map((x) => x!);
  };

  return [...pdToEvents.entries()].flatMap(([pdId, s]) =>
    makeCompleteLinks(pdId, s),
  );
};

const addStructureNodes = (nodeMap: Map<NodeKey, Node<NodeData>>): void => {
  const commonVals = {
    zIndex: -1000,
    type: "nodeBackground",
    selectable: false,
  };
  const makeData = (which: "event" | "entity", isTa2: boolean) => ({
    data: {
      which,
      height: 0,
      width: 0,
      isTa2,
    },
  });
  nodeMap.set("eventBackground", {
    id: "eventBackground",
    position: EVENT_GRAPH_ORIGIN,
    ...makeData("event", false),
    ...commonVals,
  });
  nodeMap.set("entityBackground", {
    id: "entityBackground",
    position: {
      x: EVENT_GRAPH_ORIGIN.x,
      y: EVENT_GRAPH_ORIGIN.y + nodeBgPadding,
    },
    ...makeData("entity", false),
    ...commonVals,
  });
  nodeMap.set("eventGraphgBackground", {
    id: "eventGraphgBackground",
    position: EVENT_GRAPH_ORIGIN,
    ...makeData("event", true),
    ...commonVals,
  });
  nodeMap.set("entityGraphgBackground", {
    id: "entityGraphgBackground",
    position: EVENT_GRAPH_ORIGIN,
    ...makeData("entity", true),
    ...commonVals,
  });
};

const addEvents = (args: {
  doc: Sdf.Document;
  events: Array<Sdf.Event>;
  eventPrimitives: Map<string, Sdf.EventPrimitive>;
  schemaSummaries: Map<Sdf.DocumentId, Types.SchemaSummary>;
  ta2: boolean;
  nodeMap: Map<NodeKey, Node<NodeData>>;
  linkDataArray: Array<Edge<EdgeData>>;
  eventEntityMap: Map<Sdf.EventId | Sdf.EntityId, Sdf.Event | Sdf.Entity>;
}): void => {
  const {
    doc,
    events,
    eventPrimitives,
    schemaSummaries,
    ta2,
    nodeMap,
    linkDataArray,
    eventEntityMap,
  } = args;
  const allChildren: Sdf.Child[] = events
    .flatMap((e) => e.children)
    .filter((c) => c)
    .map((c) => c!);
  const childMap = new Map(allChildren.map((c) => [c.child, c]));

  for (const event of events) {
    const wd_nodeMatch = `${event.wd_node}`.match(/(wdt?:)?(.*)/);
    const wd_node = wd_nodeMatch ? wd_nodeMatch[2] : null;
    const eventPrimitive = wd_node ? eventPrimitives.get(wd_node) : null;

    const importance = allChildren
      .filter((c) => c!.child === event["@id"])
      .map((c) => c!.importance)
      .reduce((x, y) => (x! > y! ? x : y), NaN)!;

    const schemaSummary = schemaSummaries.get(doc["@id"])!;
    const node = makeNodeFromEvent(
      schemaSummary,
      eventPrimitives,
      schemaSummaries,
      event,
      isNaN(importance) ? null : importance,
      Boolean(childMap.get(event["@id"])?.optional),
      Boolean(childMap.get(event["@id"])?.repeatable),
      ta2,
    );
    nodeMap.set(event["@id"], node);
    // Links are handled differently in TA1 and TA2.

    const children = ta2
      ? forceArray(event.subgroup_events).map(
          (child) => ({ child }) as Sdf.Child,
        )
      : forceArray(event.children);
    children.forEach((child) => {
      let childId: Sdf.EventId;
      if (typeof child === "string") {
        childId = child;
      } else {
        childId = child.child;
      }
      const importance = child.importance ?? null;
      linkDataArray.push({
        type: "parentChild",
        id: `${event["@id"]}/${childId}`,
        source: event["@id"],
        sourceHandle: "parent",
        target: childId,
        targetHandle: "child",
        label: importance !== null ? importance.toFixed(1) : undefined,
        labelStyle: {
          fontSize: "6pt",
        },
        labelBgStyle: {
          fill: "rgba(255, 255, 255, 0.9)",
        },
        labelBgPadding: [1, 0],
        data: {
          importance: importance,
          event,
          childId,
        },
      });
    });
    const args = eventPrimitive ? eventPrimitive.args : [];

    const getFullName = (sn: string) => {
      const arg = forceArray(args).filter((a) => a.name === sn)[0];
      if (!arg) node.data.warnings.push(`role "${sn}" not in ontology`);
      return arg ? arg.fullName : sn;
    };

    const eventFields = getNodeFromMap(nodeMap, event["@id"]).data
      .participants as Array<EventNodeFieldData>;
    forceArray(event.participants).forEach((participant) => {
      if (!eventFields.map((f: any) => f.role).includes(participant.roleName)) {
        eventFields.push({
          name: getFullName(participant.roleName),
          role: participant.roleName,
          portType: "role",
          fillers: [],
        });
      }
      const fillers = eventFields.filter(
        (f) => f.role === participant.roleName,
      )[0].fillers;

      const entity = eventEntityMap.get(participant.entity)!;
      if (entity) {
        fillers.push({ entity, linker: participant, ta2Type: null });
      }

      linkDataArray.push({
        id: `${event["@id"]}/${participant["@id"]}`,
        data: {
          ta2Type: "ta1",
          schemaObjectId: participant["@id"],
        },
        type: "participant",
        hidden: true,
        source: event["@id"],
        sourceHandle: "participant",
        target: participant.entity,
        targetHandle: "participant",
      });
      forceArray(participant.values).forEach((value) => {
        const ta2EntityId = value.ta2entity;
        if (ta2EntityId) {
          linkDataArray.push({
            id: `${event["@id"]}/${value["@id"]}/ta2`,
            source: event["@id"],
            sourceHandle: "participant",
            hidden: true,
            data: {
              ta2Type: "ta2",
              schemaObjectId: value["@id"],
            },
            type: "participant",
            target: ta2EntityId,
          });
          linkDataArray.push({
            id: `${value["@id"]}__coref__${ta2EntityId}`,
            data: {
              schemaObjectId: value["@id"],
            },
            type: "ta2Coref",
            hidden: true,
            source: participant.entity,
            sourceHandle: "ta2Coref",
            target: ta2EntityId,
            targetHandle: "ta2Coref",
          });
          fillers.push({
            linker: value,
            entity: eventEntityMap.get(ta2EntityId)!,
            ta2Type: null,
          });
        }
      });
    });

    // Insert step slots into the graph which were not saved; this mimics
    // the behavior of when the user first assigns a primitive to a schema
    // step.
    const includedRoles = eventFields.map((f: EventNodeFieldData) => f.name);
    forceArray(args)
      .filter((a) => !includedRoles.includes(a.fullName))
      .forEach((a) =>
        eventFields.push({
          name: a.fullName,
          role: a.name,
          portType: "role",
          fillers: [],
        }),
      );
    eventFields.sort((x: any, y: any) => x.role.localeCompare(y.role));
  }
};

const setFillerTa2Type = (nodeMap: Map<string, Node<NodeData>>): void => {
  [...nodeMap.values()]
    .flatMap((node) => forceArray((node.data as EventNodeData).participants))
    .flatMap((p) => forceArray(p.fillers))
    .forEach(
      (
        filler, // Suggestion: Use type parameter so we don't have to cast data all the time.
      ) =>
        (filler.ta2Type = (
          nodeMap.get(filler.entity["@id"])!.data as EntityNodeData
        ).ta2Type),
    );
};

const addDuplicateEntityWarnings = (
  nodeMap: Map<NodeKey, Node<NodeData>>,
): void => {
  const wdMap: Map<Sdf.WdNode, Array<EntityNodeData>> = new Map();
  const nameMap: Map<string, Array<EntityNodeData>> = new Map();

  const append = <K, V>(map: Map<K, Array<V>>, k: K, v: V): void => {
    if (!map.has(k)) map.set(k, [v]);
    else map.get(k)!.push(v);
  };

  [...nodeMap.values()]
    .filter(
      (n) =>
        n.type === "entity" && (n.data as EntityNodeData).ta2Type !== "graphg",
    )
    .map((n) => n as Node<EntityNodeData>)
    .forEach((n) => {
      append(wdMap, n.data.entity.wd_node, n.data);
      append(nameMap, n.data.entity.name, n.data);
    });

  [...wdMap.values()]
    .filter((nds) => nds.length > 1)
    .forEach((nds) =>
      nds.forEach((nd) => nd.warnings.push("duplicate entity wd_node")),
    );

  [...nameMap.values()]
    .filter((nds) => nds.length > 1)
    .forEach((nds) =>
      nds.forEach((nd) => nd.warnings.push("duplicate entity name")),
    );
};

/**
 * Translate an SDF document into ReactFlow nodes and edges.
 *
 * This function runs every time the schem is updated to ensure that the
 * display is always synchronized with the application data.
 */
export const loadDocument = (
  doc: Sdf.Document,
  eventPrimitives: Map<string, Sdf.EventPrimitive>,
  schemaSummaries: Map<Sdf.DocumentId, Types.SchemaSummary>,
): void => {
  let nodeMap = new Map<NodeKey, Node<NodeData>>();
  const linkDataArray: Array<Edge<EdgeData>> = [];

  const ta2 = doc.ta2 !== false && forceArray(doc.instances).length > 0;
  const instance = ta2 ? forceArray(doc.instances)[0] : null;

  const events = forceArray(ta2 ? instance!.events : doc.events);
  const entities = forceArray(ta2 ? instance!.entities : doc.entities);
  const eventEntityMap = new Map(
    [...events, ...entities].map((x) => [x["@id"], x]),
  );

  addEvents({
    doc,
    events,
    ta2,
    eventEntityMap,
    eventPrimitives,
    linkDataArray,
    nodeMap,
    schemaSummaries,
  });

  linkDataArray.push(...makeSchemaGraphGEventLinks(events));

  events.forEach(
    (e) => ((nodeMap.get(e["@id"])!.data as EventNodeData).isRoot = true),
  );
  events
    .flatMap((e) => forceArray(e.children))
    .forEach(
      (c) => ((nodeMap.get(c.child)!.data as EventNodeData).isRoot = false),
    );
  // Suggestion: Sort root nodes alphabetically

  events.forEach((event) =>
    forceArray(event.children).forEach((child, idx) => {
      const childId = typeof child === "string" ? child : child.child;
      const maybeNode = nodeMap.get(childId)!;
      if (!maybeNode) return;
      const d = maybeNode.data as EventNodeData;
      d.parentIds.push(event["@id"]);
    }),
  );

  const matchedEntities = new Set<Sdf.EventEntityId>();
  const predictedEntities = new Set<Sdf.EventEntityId>();
  events.forEach((e) => {
    let s: Set<Sdf.EventEntityId>;
    switch (getTa2EventType(e)) {
      case "matched":
        s = matchedEntities;
        break;
      case "predicted":
        s = predictedEntities;
        break;
      default:
        return;
    }
    forceArray(e.participants).forEach((p) => s.add(p.entity));
  });

  entities.forEach((entity) => {
    const ta2wd_s = {
      wd_node: entity.ta2wd_node,
      wd_label: entity.ta2wd_label,
    };
    const ta2Type = ta2
      ? getTa2EntityType(entity, matchedEntities, predictedEntities)
      : null;
    const group = (
      {
        matched: "entity-schema",
        "not-predicted": "entity-schema",
        predicted: "entity-schema",
        graphg: "entity-graphg",
        null: "entity-schema",
      } as { [x: string]: EntityNodeData["group"] }
    )[ta2Type as string];
    nodeMap.set(entity["@id"], {
      id: entity["@id"],
      data: {
        name: entity.name || entity.wd_node + "",
        entity: { ...ta2wd_s, ...entity },
        group,
        ta2Type,
        ta2wd_node: entity.ta2wd_node,
        isSchemaArg: entity.privateData?.isSchemaArg === true,
        expanded: false,
        hovered: false,
        warnings: [],
      },
      type: "entity",
      position: { x: DEFAULT_POS, y: DEFAULT_POS },
    });
  });

  const allRelations = forceArray(doc.relations).concat(
    forceArray(doc.events).flatMap((e) => forceArray(e.relations)),
  );

  // Suggestion: Handle multi-object correctly.
  allRelations.forEach((r) => {
    if (r.wd_node === "wd:Q79030196") linkDataArray.push(makeOutlink(r));
    // Suggestion: Implement Entity link display not implemented
    // else
    //   linkDataArray.push({
    //     id: r["@id"],
    //     source: r.relationSubject,
    //     target: forceArray(r.relationObject)[0],
    //     data: {
    //       relation: r,
    //     },
    //     type: "entityRelation",
    //   });
  });

  addDuplicateEntityWarnings(nodeMap);

  setFillerTa2Type(nodeMap);
  addStructureNodes(nodeMap);

  useDiagramStore.getState().updateDocument(nodeMap, linkDataArray, ta2);
};
