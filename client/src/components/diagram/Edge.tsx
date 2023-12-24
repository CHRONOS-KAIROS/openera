/**
 * Define custom edges for diagram.
 *
 * @packageDocumentation
 */
import * as React from "react";
import {
  BaseEdgeProps,
  BezierEdgeProps,
  EdgeProps,
  EdgeText,
  Position,
  getBezierPath,
  getStraightPath,
} from "reactflow";

import {
  ParentChildEdgeData,
  BeforeAfterEdgeData,
  Ta2CorefEdgeData,
  ParticipantEdgeData,
} from "./Store";
import * as ContextMenu from "./ContextMenu";

export const isNumeric = (n: any): n is number => !isNaN(n) && isFinite(n);

type PathPropsBaseEdgeProps = {
  pathProps: React.HTMLAttributes<SVGPathElement>;
} & BaseEdgeProps;

/**
 * Redefined edge component to allow fine-grained control over underlying path.
 */
const PathPropsBaseEdge = (props: PathPropsBaseEdgeProps) => {
  const interactionWidth = isNumeric(props.interactionWidth)
    ? props.interactionWidth
    : 20;
  return (
    <>
      <path
        id={props.id}
        style={props.style}
        d={props.path}
        fill="none"
        className="react-flow__edge-path"
        markerEnd={props.markerEnd}
        markerStart={props.markerStart}
        {...props.pathProps}
      />
      {interactionWidth && (
        <path
          d={props.path}
          fill="none"
          strokeOpacity={0}
          strokeWidth={interactionWidth}
          className="react-flow__edge-interaction"
          {...props.pathProps}
        />
      )}
      {props.label && isNumeric(props.labelX) && isNumeric(props.labelY) ? (
        <EdgeText
          x={props.labelX}
          y={props.labelY}
          label={props.label}
          labelStyle={props.labelStyle}
          labelShowBg={props.labelShowBg}
          labelBgStyle={props.labelBgStyle}
          labelBgPadding={props.labelBgPadding}
          labelBgBorderRadius={props.labelBgBorderRadius}
        />
      ) : null}
    </>
  );
};

/** See {@link PathPropsBaseEdge} */
type PathPropsBezierEdgeProps = {
  pathProps: React.HTMLAttributes<SVGPathElement>;
} & BezierEdgeProps;

const PathPropsBezierEdge = React.memo(
  ({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition = Position.Bottom,
    targetPosition = Position.Top,
    label,
    labelStyle,
    labelShowBg,
    labelBgStyle,
    labelBgPadding,
    labelBgBorderRadius,
    style,
    markerEnd,
    markerStart,
    pathOptions,
    interactionWidth,
    pathProps,
  }: PathPropsBezierEdgeProps) => {
    const [path, labelX, labelY] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
      curvature: pathOptions?.curvature,
    });

    return (
      <PathPropsBaseEdge
        path={path}
        labelX={labelX}
        labelY={labelY}
        label={label}
        labelStyle={labelStyle}
        labelShowBg={labelShowBg}
        labelBgStyle={labelBgStyle}
        labelBgPadding={labelBgPadding}
        labelBgBorderRadius={labelBgBorderRadius}
        style={style}
        markerEnd={markerEnd}
        markerStart={markerStart}
        interactionWidth={interactionWidth}
        pathProps={pathProps}
      />
    );
  },
);

type PathPropsStraightEdgeProps = {
  pathProps: React.HTMLAttributes<SVGPathElement>;
} & EdgeProps;

/** See {@link PathPropsBaseEdge} */
const PathPropsStraightEdge = React.memo(
  ({
    sourceX,
    sourceY,
    targetX,
    targetY,
    label,
    labelStyle,
    labelShowBg,
    labelBgStyle,
    labelBgPadding,
    labelBgBorderRadius,
    style,
    markerEnd,
    markerStart,
    interactionWidth,
    pathProps,
  }: PathPropsStraightEdgeProps) => {
    const [path, labelX, labelY] = getStraightPath({
      sourceX,
      sourceY,
      targetX,
      targetY,
    });

    return (
      <PathPropsBaseEdge
        path={path}
        labelX={labelX}
        labelY={labelY}
        label={label}
        labelStyle={labelStyle}
        labelShowBg={labelShowBg}
        labelBgStyle={labelBgStyle}
        labelBgPadding={labelBgPadding}
        labelBgBorderRadius={labelBgBorderRadius}
        style={style}
        markerEnd={markerEnd}
        markerStart={markerStart}
        interactionWidth={interactionWidth}
        pathProps={pathProps}
      />
    );
  },
);

// Improvement: Clicking on the link label does not trigger the context menu.
const makeContextTrigger =
  (triggerId: string) => (e: React.MouseEvent<SVGPathElement>) => {
    const el = document.getElementById(triggerId)!;
    el.dispatchEvent(new MouseEvent(e.nativeEvent.type, e.nativeEvent));
    e.preventDefault();
  };

export const edgeFactoryMap = {
  // Suggestion: Better generic typing
  parentChild: (props: EdgeProps<ParentChildEdgeData>) => {
    const { event, childId, importance } = props.data!;
    const triggerId = `parentChild-trigger__${event["@id"]}__${childId}`;
    const pathProps = {
      onContextMenu: makeContextTrigger(triggerId),
      style: {
        strokeWidth: `${(importance ?? 0.5) * 5 + 1}px`,
        stroke: "rgba(0, 0, 0, 0.3)",
      },
    };
    return (
      <>
        <ContextMenu.ParentChildLink
          parentId={event["@id"]}
          childId={childId}
          triggerId={triggerId}
        />
        <PathPropsBezierEdge pathProps={pathProps} {...props} />;
      </>
    );
  },

  beforeAfter: (props: EdgeProps<BeforeAfterEdgeData>) => {
    const { relation } = props.data!;
    const triggerId = `beforeAfter-trigger__${relation["@id"]}`;
    const pathProps = {
      onContextMenu: makeContextTrigger(triggerId),
      strokeDasharray: "1 2 4 2",
    };
    return (
      <>
        <ContextMenu.BeforeAfterLink
          triggerId={triggerId}
          relationId={relation["@id"]}
        />
        <PathPropsBezierEdge pathProps={pathProps} {...props} />;
      </>
    );
  },

  participant: (props: EdgeProps<ParticipantEdgeData>) => {
    const { schemaObjectId } = props.data!;
    const triggerId = `beforeAfter-trigger__${schemaObjectId}`;
    const pathProps = {
      onContextMenu: makeContextTrigger(triggerId),
      strokeDasharray: "2",
    };
    return (
      <>
        <ContextMenu.ParticipantLink
          triggerId={triggerId}
          participantId={schemaObjectId}
        />
        <PathPropsStraightEdge pathProps={pathProps} {...props} />;
      </>
    );
  },

  ta2Coref: (props: EdgeProps<Ta2CorefEdgeData>) => {
    const { schemaObjectId } = props.data!;
    const triggerId = `ta2Coref-trigger__${props.id}`;
    const pathProps = {
      onContextMenu: makeContextTrigger(triggerId),
      strokeDasharray: "5",
    };
    return (
      <>
        <ContextMenu.Ta2CorefEdge
          triggerId={triggerId}
          schemaObjectId={schemaObjectId}
        />
        <PathPropsStraightEdge pathProps={pathProps} {...props} />;
      </>
    );
  },
};
