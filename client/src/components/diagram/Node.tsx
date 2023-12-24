/**
 * Define custom nodes for diagram.
 *
 * @packageDocumentation
 */
import * as React from "react";
import { FaPlus, FaMinus, FaExternalLinkAlt } from "react-icons/fa";
import { Handle, Position } from "reactflow";

import {
  EventNodeData,
  EntityNodeData,
  BgNodeData,
  useDiagramStore,
  EventFieldFillerData,
  EventNodeFieldData,
} from "./Store";
import { connectionHandler } from "./Diagram";
import * as Sdf from "../../types/Sdf";
import * as ContextMenu from "./ContextMenu";
import { useAppContext, makeAppSelector } from "../../app/Store";
import { forceArray } from "../../app/Util";
import { EventStatus } from "../../types/Types";

const CG_COLORS = {
  and: "#ffbbbb",
  or: "#bbffbb",
  xor: "#ffffbb",
};

const readOnlySelector = makeAppSelector(["schemaEditState"]);

const ta2NodeInfoMap = {
  matched: ["nodeMatched", "matched"],
  predicted: ["nodePredicted", "predicted"], // Treat it like a regular schema node.
  "not-predicted": ["nodeNotPredicted", "not predicted"],
  graphg: ["nodeGraphg", "Graph G"],
} as const;

const getTa2NodeInfo = (
  ta2Type: EventStatus | null,
): readonly [string, string] => {
  if (!ta2Type) return ["", ""];
  return ta2NodeInfoMap[ta2Type];
};

/**
 * Utility component which hooks into the application store and automatically
 * hides all subcomponents when the diagram is not in an editable state.
 */
export const HideReadOnly = (props: React.PropsWithChildren<{}>) => {
  const { schemaEditState } = useAppContext(readOnlySelector);
  return <>{schemaEditState === "editable" ? props.children : null}</>;
};

export const isNumeric = (n: any): n is number => !isNaN(n) && isFinite(n);

const getColorClass = (
  data: EventFieldFillerData | EventNodeData | EntityNodeData,
): string => {
  const referent =
    (data as EventFieldFillerData).entity ?? (data as EventNodeData).event;
  const isSchemaArg = Boolean(referent.privateData?.isSchemaArg);

  if (isSchemaArg) return "schemaArg";
  const ta2TypeClass = getTa2NodeInfo(data.ta2Type)[0];
  if (ta2TypeClass) return ta2TypeClass;
  const isSusbschema = !forceArray(referent.wd_node ?? "")[0].match(
    /^wd(t)?:Q/,
  );
  if (isSusbschema) return "subschemaNode";
  if (
    referent.hasOwnProperty("participants") ||
    referent.hasOwnProperty("children_gate")
  )
    return "eventNode";

  return "";
};

/**
 * Generic component that is used for all click-and-drag connection events.
 *
 * Although the UI for this type of component adds a bit of visual noise, there
 * many small problem associated with using click-and-drag mechanics on the
 * whole node (e.g., the connection origin showing up in the wrong place, the
 * underlying node being unclickable, the link starting to connect on every
 * click).
 */
const StartConnectionHandle = (props: { handleId: string }) => (
  <div className="newEdgeButton">
    <FaExternalLinkAlt size="1.2em" />
    <Handle
      className="fillToParent"
      position={Position.Bottom}
      type="source"
      id={props.handleId}
    />
  </div>
);

const EventNode = ({ id, data }: { id: Sdf.EventId; data: EventNodeData }) => {
  const {
    setHoverState,
    toggleCollapseChildren,
    toggleExpanded,
    connectionStartObject,
    setConnectionStartObject,
    showWarnings,
  } = useDiagramStore((s) => ({
    setHoverState: s.setHoverState,
    toggleCollapseChildren: s.toggleCollapseChildren,
    toggleExpanded: s.toggleExpanded,
    connectionStartObject: s.connectionStartObject,
    setConnectionStartObject: s.setConnectionStartObject,
    showWarnings: s.showWarnings,
  }));
  const mutator = useAppContext((s) => s.mutator);

  const name = <span>{data.name}</span>;

  const makeHandle = (id: string) => (
    <Handle
      className="fillToParent"
      position={Position.Bottom}
      type="source"
      isConnectable={false}
      id={id}
    />
  );

  const makeFiller = (filler: EventFieldFillerData) => {
    const triggerId = `beforeAfter-trigger__${filler.linker["@id"]}`;
    const colorClass = getColorClass(filler);

    return (
      <ContextMenu.ParticipantLink
        triggerId={triggerId}
        participantId={filler.linker["@id"]}
        key={filler.linker["@id"]}
      >
        <div className={`participantFiller ${colorClass}`}>
          {filler.entity.name}
          {makeHandle(filler.linker["@id"])}
        </div>
      </ContextMenu.ParticipantLink>
    );
  };

  const makeRole = (p: EventNodeFieldData) => {
    const fillers = p.fillers.map(makeFiller);

    const addFiller = (
      <HideReadOnly>
        <ContextMenu.NewParticipant
          triggerId={`new_participant-trigger__${p.role}`}
          role={p.role}
          eventId={id}
        >
          <StartConnectionHandle handleId={`new_participant,${p.role}`} />
        </ContextMenu.NewParticipant>
      </HideReadOnly>
    );

    return (
      <tr key={p.name}>
        <td>
          {fillers}
          {addFiller}
        </td>
        <td>{p.name}</td>
      </tr>
    );
  };

  const wdString = (
    <div>
      <b>WD Description:</b> {data.event.wd_label || data.event.ta2wd_label}:{" "}
      {data.event.wd_description || data.event.ta2wd_description} (
      {data.event.wd_node || data.event.ta2wd_node})
    </div>
  );

  const expandedInfo = (
    <div
      className="eventExpandedInfo"
      style={{
        display: data.expanded ? undefined : "none",
      }}
    >
      {wdString}
      <div style={{ paddingTop: "0.5em" }}>
        <b>Description:</b> {data.event.description}
      </div>
      <div style={{ paddingTop: "0.5em" }}>
        <b>TA1Explanation:</b> {data.event.ta1explanation}
      </div>
      <div style={{ paddingTop: "0.5em" }}>
        <div>
          <b>Participants</b>
        </div>
        <table className="particpantTable">
          <tbody>{data.participants.map(makeRole)}</tbody>
        </table>
      </div>
    </div>
  );

  const childrenGate =
    data.event.children_gate && !data.collapseChildren ? (
      <span
        className="childrenGate"
        style={{ backgroundColor: CG_COLORS[data.event.children_gate] }}
      >
        {data.event.children_gate}
      </span>
    ) : null;

  const collapseButton = forceArray(data.event.children).length ? (
    <span
      className="collapseButton clickable"
      onClick={() => toggleCollapseChildren(id)}
    >
      {data.collapseChildren ? (
        <FaPlus size="0.5em" />
      ) : (
        <FaMinus size="0.5em" />
      )}
    </span>
  ) : null;

  const prettyTa2Type = getTa2NodeInfo(data.ta2Type)[1];

  const ta2TypeBadge = data.ta2Type ? (
    <span className="nodeBadge ta2TypeBadge">{prettyTa2Type}</span>
  ) : null;

  const warningString = "⚠ " + data.warnings.join("; ");
  const warningBadge = data.warnings.length ? (
    <span
      className="nodeBadge warningBadge"
      style={{ display: showWarnings ? undefined : "none" }}
    >
      {warningString}
    </span>
  ) : null;

  const colorClass = getColorClass(data);
  const clickable = data.expanded ? "" : "clickable";

  return (
    <ContextMenu.Event event={data.event}>
      <Handle
        isConnectable={false}
        type="target"
        position={Position.Left}
        id="child"
      />
      <Handle
        isConnectable={false}
        type="target"
        position={Position.Top}
        id="participant"
      />
      <Handle
        type="target"
        position={Position.Top}
        id="after"
        isConnectable={false}
        style={{
          right: data.group === "event-graphg" ? "10px" : undefined,
        }}
      />
      <div className="eventNodeContainer">
        <span
          className={`eventNode nodeBody ${clickable} ${colorClass}`}
          onMouseEnter={() => setHoverState(id, true)}
          onMouseLeave={() => setHoverState(id, false)}
          onClick={() => {
            if (connectionStartObject) {
              connectionHandler(mutator)({
                ...connectionStartObject,
                target: data.event["@id"],
                targetHandle: null,
              });
              setConnectionStartObject(null);
            } else toggleExpanded(id);
          }}
        >
          {ta2TypeBadge}
          {warningBadge}
          {name}
          <HideReadOnly>
            <StartConnectionHandle handleId={""} />
          </HideReadOnly>
          {expandedInfo}
          <Handle
            className="fillToParent"
            position={Position.Top}
            type="target"
            isConnectableStart={false}
          ></Handle>
        </span>
        {childrenGate}
        {collapseButton}
      </div>
      <Handle
        isConnectable={false}
        type="source"
        position={Position.Right}
        id="parent"
      />
      <Handle
        isConnectable={false}
        type="source"
        position={Position.Bottom}
        id="participant"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="before"
        isConnectable={false}
        style={{
          left: data.group === "event-graphg" ? "10px" : undefined,
          transform:
            data.group === "event-graphg" ? undefined : "translateX(-20px)",
        }}
      />
    </ContextMenu.Event>
  );
};

const EntityNode = ({
  id,
  data,
}: {
  id: Sdf.EntityId;
  data: EntityNodeData;
}) => {
  const {
    setHoverState,
    toggleExpanded,
    connectionStartObject,
    setConnectionStartObject,
    showWarnings,
  } = useDiagramStore((s) => ({
    setHoverState: s.setHoverState,
    toggleCollapseChildren: s.toggleCollapseChildren,
    toggleExpanded: s.toggleExpanded,
    connectionStartObject: s.connectionStartObject,
    setConnectionStartObject: s.setConnectionStartObject,
    showWarnings: s.showWarnings,
  }));
  const mutator = useAppContext((s) => s.mutator);
  const isSchemaArg = Boolean(data.entity.privateData?.isSchemaArg);
  const expandedInfo = data.expanded ? (
    <>
      {data.entity.wd_label}: {data.entity.wd_description} (
      {data.entity.wd_node})
    </>
  ) : null;

  const prettyTa2Type = getTa2NodeInfo(data.ta2Type)[1];

  const warningString = "⚠ " + data.warnings.join("; ");
  const warningBadge = data.warnings.length ? (
    <span
      className="nodeBadge warningBadge"
      style={{ display: showWarnings ? undefined : "none" }}
    >
      {warningString}
    </span>
  ) : null;

  const ta2TypeBadge = data.ta2Type ? (
    <span className="nodeBadge ta2TypeBadge">{prettyTa2Type}</span>
  ) : null;

  const colorClass = getColorClass(data);

  return (
    <ContextMenu.Entity entity={data.entity}>
      <Handle
        isConnectable={false}
        type="target"
        id="participant"
        position={Position.Top}
      />
      <Handle
        isConnectable={false}
        type="source"
        id="ta2Coref"
        position={Position.Right}
      />
      <Handle
        isConnectable={false}
        type="target"
        id="ta2Coref"
        position={Position.Left}
      />
      <div
        className={`entityNode nodeBody clickable ${colorClass}`}
        onMouseEnter={() => setHoverState(id, true)}
        onMouseLeave={() => setHoverState(id, false)}
        onClick={() => {
          if (connectionStartObject) {
            connectionHandler(mutator)({
              target: id,
              targetHandle: null,
              ...connectionStartObject,
            });
            setConnectionStartObject(null);
          } else toggleExpanded(id);
        }}
      >
        <Handle
          className="fillToParent"
          position={Position.Top}
          type="target"
          isConnectableStart={false}
        />
        {ta2TypeBadge}
        {warningBadge}
        <div>
          {data.entity.name}
          {isSchemaArg ? "*" : ""}
        </div>
        <div
          style={{
            color: "#444444",
            paddingLeft: "0.5em",
            fontSize: "9pt",
          }}
        >
          {expandedInfo}
        </div>
      </div>
    </ContextMenu.Entity>
  );
};

export const nodeFactoryMap = {
  nodeBackground: ({ data }: { data: BgNodeData }) => {
    const { nodeMap, isTa2 } = useDiagramStore.getState();
    if (!isTa2 && data.isTa2) return null;
    const noNodes = Array.from(nodeMap.values()).every(
      (n) => n.type !== data.which,
    );
    const text = data.which === "event" ? "Events" : "Entities";
    return (
      <div
        className="nodeBackground"
        style={{
          width: data.width,
          height: data.height,
        }}
      >
        {noNodes ? `No ${text}` : null}
      </div>
    );
  },
  entity: EntityNode,
  event: EventNode,
};
