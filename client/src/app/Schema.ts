/**
 * Defines _all_ SDF JSON modification on the frontend
 *
 * @packageDocumentation
 */
import { produce } from "immer";
import { forceArray, getLastIri, makeRandomKey } from "./Util";
import { Server, WikidataValues } from "./Server";
import * as Sdf from "../types/Sdf";

const _makeId = (doc: Sdf.Document, category: string, name: string): string =>
  `${doc["@id"]}/${category}/${makeRandomKey()}/${name}`;

export const makeRelationId = (doc: Sdf.Document, name: string) =>
  _makeId(doc, "Relation", name) as Sdf.RelationId;

export const makeEventId = (doc: Sdf.Document, name: string) =>
  _makeId(doc, "Event", name) as Sdf.EventId;

export const makeEntityId = (doc: Sdf.Document, name: string) =>
  _makeId(doc, "Entity", name) as Sdf.EntityId;

export const makeParticipantId = (doc: Sdf.Document, name: string) =>
  _makeId(doc, "Participant", name) as Sdf.ParticipantId;

export const makeProvenanceDatumId = (doc: Sdf.Document, name: string) =>
  _makeId(doc, "ProvenanceDatum", name) as Sdf.ProvenanceDatumId;

export const replaceSpaces = (s: string) => s.replace(/ /g, "-");

const WD_NODE_BEFORE = "wd:Q79030196" as Sdf.WdNode;

const getEvents = (doc: Sdf.Document): Array<Sdf.Event> =>
  forceArray(doc.instances ? forceArray(doc.instances)[0].events : doc.events);

const getEntities = (doc: Sdf.Document): Array<Sdf.Entity> =>
  forceArray(
    doc.instances ? forceArray(doc.instances)[0].entities : doc.entities,
  );

type HasAtId = { "@id": string };

const findByAtId = <T extends HasAtId>(
  items: undefined | T | Array<T>,
  atId: string,
): T | undefined => forceArray(items).filter((x) => x["@id"] === atId)[0];

/** Handles all mutations to schemas on the frontend. */
export class Mutator {
  private update: (m: (d: Sdf.Document) => void) => void;
  private server: Server;
  private eventPrimitives: Map<string, Sdf.EventPrimitive>;

  /**
   * @param update - Function performs a given mutation; comes from the "owner"
   * of the schema data (i.e., the application store).
   */
  constructor(
    update: (mutation: (doc: Sdf.Document) => void) => void,
    server: Server,
    eventPrimitives: Map<string, Sdf.EventPrimitive>,
  ) {
    this.eventPrimitives = eventPrimitives;
    this.server = server;
    this.update = (mutate) =>
      update((doc) => {
        mutate(doc);
        this.postprocessSchema(doc);
      });
  }

  /**
   * Prepare SDF JSON to be displayed by OpenEra.
   *
   * This function can be used to fix noncompliant JSON files loaded into
   * OpenEra.  While we should not make a habit of fixing others' mistakes, it
   * is sometimes a reality of the project. This also the place to make
   * compliant schemas easier to work with so that the same patterns do not
   * have to be repeated across the codebase.
   *
   * @public
   */
  private _preprocessSchema = (schemaFile: Sdf.Document): void => {
    const schema = schemaFile;
    if (schema === undefined) return;

    schema.ta2 =
      schema.ta2 === undefined ? Boolean(schema.instances) : schema.ta2;

    // Force jsonld non-array singletons to be singleton arrrays.
    const events = forceArray(
      schema.instances ? forceArray(schema.instances)[0].events : schema.events,
    );
    events.forEach((e) => (e.participants = forceArray(e.participants)));
    events
      .filter((e) => `${e.wd_node}`.match(/^cmu:/))
      .forEach((e) => (e.wd_label = getLastIri(e.wd_node as string)));
    schema.entities = forceArray(schema.entities);
    schema.provenanceData = forceArray(schema.provenanceData);

    // Ensure children_gate's on non-leaf events.
    events
      .filter((e) => e.children && forceArray(e.children).length === 0)
      .forEach((e) => {
        e.children = undefined;
      });
    events
      .filter((e) => e.children && e.children_gate === undefined)
      .forEach((e) => (e.children_gate = "and"));
    events
      .filter((e) => !e.children && !e.subgroup_events)
      .forEach((e) => (e.children_gate = undefined));

    if (forceArray(schema.instances)[0])
      forceArray(forceArray(schema.instances)[0].events)
        .filter((e) => e.subgroup_events)
        .forEach(
          (e) =>
            (e.children = forceArray(e.subgroup_events).map((child) => ({
              child,
            }))),
        );

    // Fix event confidence
    events
      .filter((e) => e.confidence)
      .forEach((e) => {
        e.confidence = forceArray(e.confidence)[0];
      });
    events
      .filter((e) => e.predictionProvenance)
      .forEach((e) => {
        e.predictionProvenance = forceArray(e.predictionProvenance)[0];
      });

    // Remove arguments which do not exist on event primitve
    events.forEach((e) => {
      const primitive = this.eventPrimitives.get(`${e.wd_node}`);
      if (primitive === undefined) return;
      const roles = forceArray(primitive.args).map((a) => a.name);
      e.participants = forceArray(e.participants).filter((p) =>
        roles.includes(p.roleName),
      );
    });

    // Remove duplicate particiapnts: same role, same entity
    events.forEach((e) => {
      const s = new Set<string>();
      e.participants = forceArray(e.participants).filter((p) => {
        const key = p.roleName + "::" + p.entity;
        const present = s.has(key);
        s.add(key);
        return !present;
      });
    });

    // Remove relations with invalid subjects
    const eventEntityIds = new Set([
      ...events.map((e) => e["@id"]),
      ...getEntities(schema).map((e) => e["@id"]),
    ]);
    schema.relations = forceArray(schema.relations).filter(
      (r) =>
        eventEntityIds.has(r.relationSubject) &&
        forceArray(r.relationObject).every((o) => eventEntityIds.has(o)),
    );

    // Ensure proper prefix for wikidata wd_nodes
    const ensureWikidataPrefix = (s: string) => {
      const stripped = s
        .toUpperCase()
        .match(/[QP][0-9]+/)
        ?.at(0);
      if (stripped === undefined) return s as Sdf.WdNode;
      if (stripped[0] === "Q") return ("wd:" + stripped) as Sdf.WdNode;
      else return ("wdt:" + stripped) as Sdf.WdNode;
    };
    getQnodeObjects(schema)
      .filter((x) => x.wd_node && !Array.isArray(x.wd_node))
      .forEach(
        (x) =>
          ((x.wd_node as Sdf.WdNode) = ensureWikidataPrefix(`${x.wd_node}`)),
      );

    // Remove extra ProvenanceDatum fields
    forceArray(schema.provenanceData).forEach((pd) => {
      const mt = pd.mediaType.match(/([a-z]+)\//)?.at(1);
      let fields: string[] = [];
      switch (mt) {
        case "video":
          fields = ["length", "offset"];
          break;
        case "audio":
          fields = ["length", "offset", "boundingBox"];
          break;
        case "text":
          fields = ["startTime", "endTime", "boundingBox"];
          break;
        case "image":
          fields = ["length", "offset", "starTime", "endTime"];
          break;
      }
      fields.forEach((f) => delete (pd as any)[f]);
    });

    this.pruneReferences(schema);
    schema.privateData = schema.privateData || {};
    schema.privateData!.eratosthenesLastModified = new Date().toISOString();
  };

  /**
   * See {@link _preprocessSchema}.
   */
  public preprocessSchema = produce(this._preprocessSchema);

  /** Remove provenance data which are no longer referred to. */
  private pruneProvenanceData = (schema: Sdf.Document): void => {
    getEvents(schema).forEach((x) => {
      const provs = forceArray(x.provenance);
      if (provs.length > 1) x.provenance = provs.filter((y) => y !== "n/a");
    });
    const allPdIds = getEvents(schema).flatMap((s) => forceArray(s.provenance));
    const keep = (pd: Sdf.ProvenanceDatum) =>
      allPdIds.includes(pd.provenanceID);
    schema.provenanceData = forceArray(schema.provenanceData).filter(keep);
  };

  /** Perform any cleanup work that is needed after edits. */
  public postprocessSchema = (schema: Sdf.Document): void => {
    this.pruneReferences(schema);
    this.roundImportances(schema);
    this.pruneProvenanceData(schema);
    this._preprocessSchema(schema);
    schema.privateData!.eratosthenesLastModified = new Date().toISOString();
  };

  private roundImportances = (schema: Sdf.Document) =>
    getEvents(schema)
      .flatMap((e) => forceArray(e.children))
      .filter((c) => c.importance !== undefined)
      .forEach((c) => (c.importance = Math.round(c.importance! * 1000) / 1000));

  /** Remove any dangling references. */
  private pruneReferences = (schema: Sdf.Document): void => {
    const allEventsIds = getEvents(schema).map((e) => e["@id"]);
    const allEntityIds = getEntities(schema).map((e) => e["@id"]);
    const allEventEntityIds = (
      allEventsIds as Array<Sdf.EventId | Sdf.EntityId>
    ).concat(allEntityIds);
    // Prune children and participants
    getEvents(schema).forEach((e) => {
      if (e.children) {
        e.children = forceArray(e.children).filter((c) =>
          allEventsIds.includes(c.child),
        );
      }
      if (e.participants)
        e.participants = forceArray(e.participants).filter((p) =>
          allEventEntityIds.includes(p.entity),
        );
    });
  };

  public addParentChild = (parentId: Sdf.EventId, childId: Sdf.EventId) =>
    this.update((doc: Sdf.Document): void => {
      const parent = findByAtId(doc.events, parentId)!;
      parent.children = forceArray(parent.children);
      if (!parent.children.some((c) => c.child === childId))
        parent.children.push({ child: childId });
    });

  public addEvent = (
    name: string,
    ta1explanation: string,
    description: string,
    eventPrimitive: Sdf.EventPrimitive,
  ) =>
    this.update((doc: Sdf.Document): void => {
      const event: Sdf.Event = {
        "@id": makeEventId(doc, replaceSpaces(name)),
        name,
        ta1explanation,
        description,
        wd_node: eventPrimitive.wd_node,
        wd_label: eventPrimitive.wd_label,
        wd_description: eventPrimitive.wd_description,
        participants: [],
        children: [],
      };
      doc.events = forceArray(doc.events);
      doc.events.push(event);
    });

  public deleteEvent = (eventId: Sdf.EventId) =>
    this.update((doc: Sdf.Document): void => {
      doc.events = forceArray(doc.events).filter((s) => s["@id"] !== eventId);
    });

  public deleteParentChild = (parentId: Sdf.EventId, childId: Sdf.EventId) =>
    this.update((doc: Sdf.Document): void => {
      forceArray(doc.events)
        .filter((e) => e["@id"] === parentId)
        .forEach((e) => {
          e.children = forceArray(e.children).filter(
            (c) => c.child !== childId,
          );
        });
    });

  public addBeforeAfter = (beforeId: Sdf.EventId, afterId: Sdf.EventId) =>
    this.update((doc: Sdf.Document): void => {
      doc.relations = forceArray(doc.relations);
      const relationId = makeRelationId(doc, "before");
      doc.relations.push({
        "@id": relationId,
        wd_node: WD_NODE_BEFORE,
        wd_label: "before",
        wd_description:
          "qualifies something (inception or end of a thing, event, or date) as happening previously to another thing",
        relationSubject: beforeId,
        relationObject: afterId,
      });
    });

  public deleteBeforeAfter = (relationId: Sdf.RelationId) =>
    this.update((doc: Sdf.Document): void => {
      doc.relations = forceArray(doc.relations).filter(
        (r) => r["@id"] !== relationId,
      );
    });

  public deleteEntity = (entityId: Sdf.EntityId) =>
    this.update((doc: Sdf.Document): void => {
      doc.entities = forceArray(doc.entities).filter(
        (e) => e["@id"] !== entityId,
      );
    });

  public deleteParticipant = (participantId: Sdf.ParticipantId) =>
    this.update((doc: Sdf.Document): void => {
      forceArray(doc.events).forEach((e) => {
        e.participants = forceArray(e.participants).filter(
          (p) => p["@id"] !== participantId,
        );
      });
    });

  public editEntityProp = (
    entityId: Sdf.EntityId,
    propKey: "name" | "wd_node" | "isSchemaArg",
    propValue: string | number | boolean,
  ) =>
    this.update((doc: Sdf.Document): void => {
      const entity = findByAtId(doc.entities, entityId);
      if (!entity)
        throw new Error(`Could not find step with @id "${entityId}"`);
      switch (propKey) {
        case "name":
          entity.name = propValue as string;
          break;
        case "wd_node":
          entity.wd_node = propValue as Sdf.WdNode;
          entity.wd_label = undefined;
          entity.wd_description = undefined;
          break;
        case "isSchemaArg":
          entity.privateData = entity.privateData || {};
          entity.privateData.isSchemaArg = propValue as boolean;
          break;
        default:
          throw new Error(`Could not find property "${propKey}" on step.`);
      }
    });

  public addEntity = (name: string, wd_node: Sdf.WdNode) =>
    this.update((doc: Sdf.Document): void => {
      name = name.replace(" ", "_");
      doc.entities = forceArray(doc.entities);
      doc.entities.push({
        "@id": makeEntityId(doc, name),
        name,
        wd_node,
      });
    });

  public editEventType = (
    eventId: Sdf.EventId,
    wd_node: Sdf.WdNode,
    wd_label: string,
  ) =>
    this.update((doc: Sdf.Document): void => {
      const event = findByAtId(doc.events, eventId);
      if (!event) throw new Error(`Could not find step with @id "${eventId}"`);
      event.wd_node = wd_node;
      event.wd_label = wd_label;
      event.wd_description = "";
      event.participants = [];
    });

  public editEventProp = (
    eventId: Sdf.EventId,
    propKey:
      | "children_gate"
      | "importance"
      | "name"
      | "description"
      | "ta1explanation",
    propValue: string | number | undefined,
  ) =>
    this.update((doc: Sdf.Document): void => {
      const event = findByAtId(doc.events, eventId);
      if (!event) throw new Error(`Could not find step with @id "${eventId}"`);
      switch (propKey) {
        case "children_gate":
          event.children_gate = propValue as "xor" | "or" | "and";
          break;
        case "importance":
          // Not technically a step prop.
          const importance = Math.min(1.0, Math.max(0.0, propValue as number));
          this.getEventAsChildren(doc, eventId).forEach(
            (c) => (c.importance = importance),
          );
          break;
        case "name":
          event.name = propValue as string;
          break;
        case "ta1explanation":
          event.ta1explanation = propValue as string;
          break;
        case "description":
          event.description = propValue as string;
          break;
        default:
          throw new Error(`Could not find property "${propKey}" on step.`);
      }
    });

  private getEventAsChildren = (doc: Sdf.Document, eventId: Sdf.EventId) =>
    forceArray(doc.events)
      .flatMap((e) => forceArray(e.children))
      .filter((c) => c.child === eventId);

  public addParticipant = (
    eventId: Sdf.EventId,
    entityId: Sdf.EntityId | Sdf.EventId,
    role: string,
  ) =>
    this.update((doc: Sdf.Document): void => {
      const event = findByAtId(doc.events, eventId);
      if (!event) return;
      const entityName = getLastIri(entityId);
      event.participants = forceArray(event.participants);
      event.participants.push({
        "@id": makeParticipantId(doc, entityName),
        roleName: role,
        entity: entityId,
      });
    });

  /**
   * Resolve WikiData links and store them in the JSON.
   *
   * This makes the schemas easier to work with in the raw JSON since not all
   * people have WikiData memorized (shocker). The resolved names are stored in
   * privateData which can basically hold any auxiliary necessary.
   */
  public addWdLabels = async (schema: Sdf.Document): Promise<Sdf.Document> => {
    const allQnodes = getQnodeObjects(schema)
      .flatMap((o) => o.wd_node)
      .filter((x) => x)
      .filter((x) => x!.match(/^wdt?:/))
      .map((x) => stripWikiPrefix(x as string))
      .filter((x) => x);

    const wd_nodeSet = new Set<string>();
    // Retrieve all of the labels from WikiData
    const refLabels = await Promise.allSettled(
      allQnodes.map(async (wd_node) => {
        if (typeof wd_node === "string" && !wd_nodeSet.has(wd_node)) {
          wd_nodeSet.add(wd_node);
          return this.server
            .fetchWikidataValues(wd_node)
            .then((v) => [wd_node, v]);
        }
        return Promise.resolve(null);
      }),
    );
    const map = new Map(
      refLabels
        .filter(
          (p) => p.status === "fulfilled" && p.value && p.value[1] !== null,
        )
        .map(
          (p) => (p as PromiseFulfilledResult<[string, WikidataValues]>).value,
        ),
    );
    // Now apply the labels
    return produce(schema, (draft) =>
      getQnodeObjects(draft).forEach((obj) => {
        // Suggestion: Handle wd_node arrays
        if (
          obj.wd_node &&
          !Array.isArray(obj.wd_node) &&
          obj.wd_node.match(/^wdt?:/)
        ) {
          const values = map.get(stripWikiPrefix(obj.wd_node!));
          if (!values) return;
          obj.wd_label = values.label;
          obj.wd_description = values.description;
        }
      }),
    );
  };

  /**
   * Perform all asynchronous post processing on the schema.
   *
   * Since dealing with async function is somewhat cumbersome, they are handled
   * separately from all synchronous operations.
   */
  public doAsyncUpdates = async (
    schemaFile: Sdf.Document,
  ): Promise<Sdf.Document> => {
    let newSchemaFile = schemaFile;
    return await this.addWdLabels(newSchemaFile);
  };
}

const getQnodeObjects = (s: Sdf.Document) => [
  ...forceArray(s.relations),
  ...getEntities(s),
  ...getEvents(s),
  ...getEvents(s).flatMap((e) => forceArray(e.participants)),
];

export const stripWikiPrefix = (q: string) => q.match(/Q[0-9]+$/)?.at(0) || "";
