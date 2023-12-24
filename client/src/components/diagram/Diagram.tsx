/**
 * Assembles and instantiates the diagram; handles diagram-wide display logic.
 *
 * @packageDocumentation
 */

import * as React from "react";
import { useMemo, useState, useEffect, useCallback } from "react";
import ReactFlow from "reactflow";
import { Connection, ConnectionLineType, ConnectionMode } from "reactflow";

import "reactflow/dist/style.css";

import * as Sdf from "../../types/Sdf";
import { useDiagramStore, DiagramState, DiagramAction } from "./Store";
import { useAppContext, makeAppSelector } from "../../app/Store";
import { nodeFactoryMap } from "./Node";
import { edgeFactoryMap } from "./Edge";
import { doLayout } from "./Layout";
import { DiagramContextMenu } from "./ContextMenu";
import { Mutator } from "./../../app/Schema";

import "../../css/node.css";
import "../../css/context-menu.css";

// Present so as not to break imports for now.
export type FocusState = "steps-args" | "steps" | "args" | "none";

interface Props {
  loadDocument: (x: Sdf.Document) => void;
  doc: Sdf.Document;
}

export const highlightPart = (id: Sdf.AnyId) => {
  const { reactFlowInstance, nodeMap } = useDiagramStore.getState();
  if (!reactFlowInstance) return;
  const node = nodeMap.get(id as any);
  if (node && node.height && node.width) {
    const x = node.position.x + node.width / 2;
    const y = node.position.y + node.height / 2;
    reactFlowInstance.setCenter(x, y, { duration: 300 });
  }
  // Suggestion: Add highlighting to centering
};

/** Full validation is handled in {@link connectionHandler}. */
const isValidConnection = (c: Connection) => {
  if (c.source === c.target) return false;
  return true;
};

/**
 * Process and route any potential connection to the correct mutation method.
 */
export const connectionHandler =
  (mutator: Mutator) =>
  ({ source, target, sourceHandle, targetHandle }: Connection) => {
    // Avoid accidental self-linking
    if (source === target) return;

    const { getNode } = useDiagramStore.getState();

    const sourceNode = getNode(source as Sdf.EventId);
    const targetNode = getNode(target as Sdf.EventId);

    const isNewParticipant = (h: string | null): h is string =>
      (h ?? "").split(",")[0] === "new_participant";

    if (
      isNewParticipant(sourceHandle) &&
      ["event", "entity"].includes(targetNode.type ?? "")
    ) {
      const role = sourceHandle.split(",")[1];
      mutator.addParticipant(
        source as Sdf.EventId,
        target as Sdf.EventId | Sdf.EntityId,
        role,
      );
    } else if (isNewParticipant(targetHandle)) {
      alert("Not handled yet.");
    } else if (sourceNode.type === "event" && targetNode.type === "event") {
      if (
        sourceNode.data.parentIds.some((id) =>
          targetNode.data.parentIds.includes(id),
        )
      ) {
        mutator.addBeforeAfter(source as Sdf.EventId, target as Sdf.EventId);
      } else {
        mutator.addParentChild(source as Sdf.EventId, target as Sdf.EventId);
      }
    }
  };

const appSelector = makeAppSelector(["mutator", "schemaEditState"]);

const selector = (s: DiagramState & DiagramAction) => ({
  nodeMap: s.nodeMap,
  edges: s.edges,
  onNodesChange: s.onNodesChange,
  onEdgesChange: s.onEdgesChange,
  setReactFlowInstance: s.setReactFlowInstance,
  updateEdgeVisibility: s.updateEdgeVisibility,
  connectionStartObject: s.connectionStartObject,
  setConnectionStartObject: s.setConnectionStartObject,
  updateDynamicHandles: s.updateDynamicHandles,
});

export const Diagram = (props: Props) => {
  const { doc, loadDocument } = props;
  const {
    nodeMap,
    edges,
    onNodesChange,
    onEdgesChange,
    setReactFlowInstance,
    updateEdgeVisibility,
    connectionStartObject,
    setConnectionStartObject,
    updateDynamicHandles,
  } = useDiagramStore(selector);
  const [prevDoc, setPrevDoc] = useState<Sdf.Document | null>(null);
  const [docKey, setDocKey] = useState(0);
  const { mutator, schemaEditState } = useAppContext(appSelector);

  const nodeTypes = useMemo(() => nodeFactoryMap, []);
  const edgeTypes = useMemo(() => edgeFactoryMap, []);

  // Regenerate all nodes if the document updates
  useEffect(() => {
    if (doc !== prevDoc && doc) {
      setPrevDoc(doc);
      loadDocument(doc);
      updateDynamicHandles();
      updateEdgeVisibility();
      // If we have an entirely new document, force ReactFlow to remount.
      if (prevDoc && doc["@id"] !== prevDoc["@id"]) setDocKey(Math.random());
    }
  }, [prevDoc, doc, loadDocument, updateEdgeVisibility, updateDynamicHandles]);

  useEffect(doLayout, [nodeMap, edges]);

  const isReadonly = schemaEditState !== "editable";

  // Improvement: This only kicks in when the moust first moves after a right
  // click, so the tooltip is initially positioned incorrectly.
  const adjustToolTip = useCallback(
    (event: MouseEvent) => {
      if (connectionStartObject) {
        document.querySelectorAll("#diagramToolTip").forEach((el) => {
          (el as HTMLElement).style.left = `${event.x + 5}px`;
          (el as HTMLElement).style.top = `${event.y + 5}px`;
        });
      }
    },
    [connectionStartObject],
  );

  useEffect(() => {
    window.addEventListener("mousemove", adjustToolTip);
    return () => {
      window.removeEventListener("mousemove", adjustToolTip);
    };
  }, [adjustToolTip]);

  const toolTip =
    connectionStartObject === null ? null : (
      <div id="diagramToolTip">Click on connection target</div>
    );

  if (!doc) return null;
  return (
    <DiagramContextMenu>
      {toolTip}
      <div
        id="diagramContainer"
        style={{ width: "100%", height: "100%" }}
        onClick={() => {}}
      >
        <ReactFlow
          key={docKey}
          nodes={Array.from(nodeMap.values())}
          edges={edges}
          nodeTypes={
            nodeTypes as any /* I don't know how to get this type to work. */
          }
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodesDraggable={false}
          onInit={setReactFlowInstance}
          connectOnClick={false /* Temporary while it doesn't work well. */}
          onConnect={connectionHandler(mutator)}
          connectionLineType={ConnectionLineType.Straight}
          connectionMode={ConnectionMode.Loose}
          connectionRadius={100}
          isValidConnection={(c) => isValidConnection(c) && !isReadonly}
          nodesConnectable={!isReadonly}
          minZoom={0.1}
          maxZoom={4}
          onClick={() => setConnectionStartObject(null)}
          defaultViewport={{
            x: 0,
            y: 0,
            zoom: 0.8,
          }}
        />
      </div>
    </DiagramContextMenu>
  );
};
