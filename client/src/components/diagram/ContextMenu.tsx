/**
 * Defines all context menus for diagram elements.
 *
 * Context menus items are one of the easiest ways to add functionalities to
 * the diagram since they are intuitive, already handle selecting a unique
 * element, and do not cause visual clutter.
 *
 * @packageDocumentation
 */

import * as React from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { FaChevronRight } from "react-icons/fa";

import { dialogManagerRef } from "../DialogManager";
import * as Sdf from "../../types/Sdf";
import { forceArray } from "../../app/Util";
import { HideReadOnly } from "./Node";
import { useAppContext, makeAppSelector } from "../../app/Store";
import { useDiagramStore } from "./Store";

import "../../css/context-menu.css";

const Sep = () => <ContextMenu.Separator className="ContextMenuSeparator" />;

const RightChevron = () => (
  <span className="RightSlot">
    <FaChevronRight size="1em" />
  </span>
);

const SubMenu = ({
  text,
  children,
  ...rest
}: React.ComponentProps<typeof ContextMenu.Sub> & { text: string }) => (
  <ContextMenu.Sub>
    <ContextMenu.SubTrigger className="ContextMenuSubTrigger">
      {text}
      <RightChevron />
    </ContextMenu.SubTrigger>
    <ContextMenu.Portal>
      <ContextMenu.SubContent className="ContextMenuSubContent">
        {children}
      </ContextMenu.SubContent>
    </ContextMenu.Portal>
  </ContextMenu.Sub>
);

const Item = ({
  children,
  ...rest
}: React.ComponentProps<typeof ContextMenu.Item>) => {
  return (
    <ContextMenu.Item {...rest} className="ContextMenuItem">
      {children}
    </ContextMenu.Item>
  );
};

const GoToJson = ({ id }: { id: Sdf.AnyId }) => {
  const goto = useAppContext((s) => s.goToJson);
  return <Item onSelect={() => goto(id)}>Go to JSON</Item>;
};

const readOnlySelector = makeAppSelector(["schemaEditState"]);

export const DiagramContextMenu = (props: React.PropsWithChildren<{}>) => {
  return (
    <GenericContextMenu triggerContent={props.children} hideReadOnly={true}>
      <Item onSelect={() => dialogManagerRef.promptAddStep()}>Add event</Item>
      <Item onSelect={() => dialogManagerRef.promptAddArg()}>Add entity</Item>
    </GenericContextMenu>
  );
};

const eventContextMenuSelector = makeAppSelector([
  "mutator",
  "doc",
  "loadSchema",
]);

export const Event = (props: React.PropsWithChildren<{ event: Sdf.Event }>) => {
  const { mutator, doc, loadSchema } = useAppContext(eventContextMenuSelector);
  const setConnectionStartObject = useDiagramStore(
    (s) => s.setConnectionStartObject,
  );
  const { event } = props;

  const editEventType = async () => {
    let primitive;
    try {
      primitive = await dialogManagerRef.getEventPrimitive();
    } catch (e) {
      return;
    }
    mutator.editEventType(event["@id"], primitive.wd_node, primitive.wd_label);
  };

  const childrenGateMenu = (
    <SubMenu text="Children gate">
      {["and", "or", "xor"].map((gate) => (
        <Item
          key={gate}
          onSelect={() =>
            mutator.editEventProp(event["@id"], "children_gate", gate)
          }
        >
          {gate}
        </Item>
      ))}
    </SubMenu>
  );

  const generateSubevents = () => {
    if (doc) {
      mutator.generateSubevents(event, doc["@id"]);
      loadSchema();
    }
  };

  return (
    <GenericContextMenu triggerContent={props.children}>
      <HideReadOnly>
        <Item
          onSelect={() =>
            setConnectionStartObject({
              source: event["@id"],
              sourceHandle: null,
            })
          }
        >
          Start connection
        </Item>
        <SubMenu text="Edit...">
          <Item
            onSelect={() =>
              dialogManagerRef.promptEditText("name", event.name, (x) =>
                mutator.editEventProp(event["@id"], "name", x),
              )
            }
          >
            Name
          </Item>
          {childrenGateMenu}
          <Item onSelect={editEventType}>Event type</Item>
          <Item
            onSelect={() =>
              dialogManagerRef.promptEditText("description", event.name, (x) =>
                mutator.editEventProp(event["@id"], "description", x),
              )
            }
          >
            Description
          </Item>
          <Item
            onSelect={() =>
              dialogManagerRef.promptEditText(
                "TA1Explanation",
                event.name,
                (x) => mutator.editEventProp(event["@id"], "ta1explanation", x),
              )
            }
          >
            TA1explanation
          </Item>
        </SubMenu>

        {event.children ? null : (
          <Item onSelect={generateSubevents}>Generate subevents</Item>
        )}

        <Item onSelect={() => mutator.deleteEvent(event["@id"])}>
          Remove event
        </Item>
        <Sep />
      </HideReadOnly>
      <GoToJson id={event["@id"]} />
    </GenericContextMenu>
  );
};

export const Entity = (
  props: React.PropsWithChildren<{ entity: Sdf.Entity }>,
) => {
  const { mutator } = useAppContext(eventContextMenuSelector);
  const { entity } = props;
  const setConnectionStartObject = useDiagramStore(
    (s) => s.setConnectionStartObject,
  );
  const isSchemaArg = Boolean(entity.privateData?.isSchemaArg);
  return (
    <GenericContextMenu triggerContent={props.children}>
      <HideReadOnly>
        <Item
          onSelect={() =>
            setConnectionStartObject({
              source: entity["@id"],
              sourceHandle: null,
            })
          }
        >
          Start connection
        </Item>
        <SubMenu text="Edit...">
          <Item
            onSelect={() =>
              dialogManagerRef.promptEditText("name", entity.name, (x) =>
                mutator.editEntityProp(entity["@id"], "name", x),
              )
            }
          >
            Name
          </Item>
          <Item
            onSelect={() =>
              dialogManagerRef.promptEditText(
                "WikiData node",
                forceArray(entity.wd_node)[0] || "",
                (x) => mutator.editEntityProp(entity["@id"], "wd_node", x),
              )
            }
          >
            WikiData node
          </Item>
          <Item
            onSelect={() =>
              mutator.editEntityProp(entity["@id"], "isSchemaArg", !isSchemaArg)
            }
          >
            {isSchemaArg ? "Unset" : "Set"} as schema arg
          </Item>
        </SubMenu>
        <Item
          onSelect={(e) => {
            mutator.deleteEntity(entity["@id"]);
            // Note1: Since the above delete mutation will cause this component
            // to unmount, we need to prevent any further state updates from
            // happening to component lest React complain about state updates on
            // an unmounted component.
            e.preventDefault();
          }}
        >
          Delete entity
        </Item>
        <Sep />
      </HideReadOnly>
      <GoToJson id={entity["@id"]} />
    </GenericContextMenu>
  );
};

export const ParentChildLink = (
  props: React.PropsWithChildren<{
    parentId: Sdf.EventId;
    childId: Sdf.EventId;
    triggerId: string;
  }>,
) => {
  const { mutator } = useAppContext(eventContextMenuSelector);
  const { parentId, childId, triggerId } = props;

  const importanceButton = (val: number | undefined) => (
    <Item
      key={val ?? "default"}
      onSelect={() => mutator.editEventProp(childId, "importance", val)}
    >
      {val ?? "Unset"}
    </Item>
  );

  const importanceSubmenu = (
    <SubMenu text="Set importance">
      {[1.0, 0.7, 0.5, 0.3, 0.1, undefined].map(importanceButton)}
    </SubMenu>
  );

  return (
    <GenericContextMenu id={triggerId} triggerContent={props.children}>
      <HideReadOnly>
        {importanceSubmenu}
        <Item
          onSelect={(e) => {
            mutator.deleteParentChild(parentId, childId);
            // See Note1 above
            e.preventDefault();
          }}
        >
          Delete relation
        </Item>
        <Sep />
      </HideReadOnly>
      <GoToJson id={parentId} />
    </GenericContextMenu>
  );
};

export const Ta2CorefEdge = (
  props: React.PropsWithChildren<{
    schemaObjectId: Sdf.AnyId;
    triggerId: string;
  }>,
) => {
  const { schemaObjectId, triggerId } = props;

  return (
    <GenericContextMenu id={triggerId} triggerContent={props.children}>
      <GoToJson id={schemaObjectId} />
    </GenericContextMenu>
  );
};

export const BeforeAfterLink = (
  props: React.PropsWithChildren<{
    relationId: Sdf.RelationId;
    triggerId: string;
  }>,
) => {
  const { mutator } = useAppContext(eventContextMenuSelector);
  const { relationId, triggerId } = props;

  return (
    <GenericContextMenu id={triggerId} triggerContent={props.children}>
      <HideReadOnly>
        <Item
          onSelect={(e) => {
            mutator.deleteBeforeAfter(relationId);
            // See Note1 above
            e.preventDefault();
          }}
        >
          Delete relation
        </Item>
      </HideReadOnly>
      <GoToJson id={relationId} />
    </GenericContextMenu>
  );
};

export const ParticipantLink = (
  props: React.PropsWithChildren<{
    participantId: Sdf.ParticipantId | Sdf.ProvenanceDatumId | Sdf.ValueId;
    triggerId: string;
  }>,
) => {
  const { mutator } = useAppContext(eventContextMenuSelector);
  const { participantId, triggerId } = props;

  return (
    <GenericContextMenu id={triggerId} triggerContent={props.children}>
      <HideReadOnly>
        {/* No editing for TA2 so we know it's a ParticipantId */}
        <Item
          onSelect={(e) => {
            mutator.deleteParticipant(participantId as Sdf.ParticipantId);
            // See Note1 above
            e.preventDefault();
          }}
        >
          Delete relation
        </Item>
      </HideReadOnly>
      <GoToJson id={participantId} />
    </GenericContextMenu>
  );
};

export const NewParticipant = (
  props: React.PropsWithChildren<{
    eventId: Sdf.EventId;
    role: string;
    triggerId: string;
  }>,
) => {
  const { eventId, role, triggerId } = props;
  const setConnectionStartObject = useDiagramStore(
    (s) => s.setConnectionStartObject,
  );

  return (
    <GenericContextMenu id={triggerId} triggerContent={props.children}>
      <HideReadOnly>
        <Item
          onSelect={() =>
            setConnectionStartObject({
              source: eventId,
              sourceHandle: `new_participant,${role}`,
            })
          }
        >
          Start connection
        </Item>
      </HideReadOnly>
    </GenericContextMenu>
  );
};

type GenericContextMenuProps = {
  triggerContent: React.ReactNode;
  hideReadOnly?: boolean;
  id?: string;
};

/**
 * Base context menu class.
 *
 * Each component has its own context menu, that is, they are never shared.  It
 * is important to use the portalling, otherwise context menus get caught in
 * the z-index madness and can get covered up by other diagram elements.
 */
const GenericContextMenu = (
  props: React.PropsWithChildren<GenericContextMenuProps>,
) => {
  const { schemaEditState } = useAppContext(readOnlySelector);
  const disabled = props.hideReadOnly && schemaEditState !== "editable";
  return (
    <>
      <ContextMenu.Root>
        <ContextMenu.Trigger
          style={{
            height: "100%",
            width: "100%",
          }}
          id={props.id}
          disabled={disabled}
          onContextMenu={(e) => {
            if (disabled) e.preventDefault();
          }}
        >
          {props.triggerContent}
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content
            onClick={
              // Prevents event from closing after we click on context menu
              // item derived from participant filler.
              (e) => e.stopPropagation()
            }
            className="ContextMenuContent"
          >
            {props.children}
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>
    </>
  );
};
