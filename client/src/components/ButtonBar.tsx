/**
 * Always-visible row of buttons underneath the diagram in the main app
 *
 * Its primary purpose to is to provide auxiliary and alternative functionality
 * to the diagram. This is the catch-all UI element for displaying state and
 * performing actions related to the current schema.
 *
 * @packageDocumentation
 */
import * as React from "react";

import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import Spinner from "react-bootstrap/Spinner";
import DropdownButton from "react-bootstrap/DropdownButton";
import ButtonGroup from "react-bootstrap/ButtonGroup";
import Dropdown from "react-bootstrap/Dropdown";
import {
  FaCheck,
  FaTimes,
  FaUndo,
  FaRedo,
  FaExclamationTriangle,
} from "react-icons/fa";
import { IconContext } from "react-icons/lib";

import { dialogManagerRef } from "./DialogManager";
import { makeSelectorFor } from "../app/Util";
import { useAppContext, AppState, AppAction } from "../app/Store";
import { useDiagramStore } from "./diagram/Store";

const selector = makeSelectorFor<AppState & AppAction>()([
  "showRawJson",
  "schemaEditState",
  "schemaSaveState",
  "toggleJsonView",
  "requestSchemaEditable",
  "undoRedoChange",
  "selectSchema",
  "doc",
]);

export const ButtonBar = () => {
  const {
    showRawJson,
    toggleJsonView,
    schemaEditState,
    requestSchemaEditable,
    schemaSaveState,
    undoRedoChange,
    selectSchema,
    doc,
  } = useAppContext(selector);
  const { showWarnings, setShowWarnings } = useDiagramStore((s) => ({
    showWarnings: s.showWarnings,
    setShowWarnings: s.setShowWarnings,
  }));

  const schemaEditingSwitch = (
    <span id="schemaEditingState">
      <span
        style={{
          color: schemaEditState !== "readonly" ? "gray" : undefined,
        }}
      >
        View-Only
      </span>
      <span id="schemaEditingButton">
        <Form>
          <Form.Check
            type="switch"
            id="schemaEditingSwitch"
            label=""
            checked={schemaEditState === "editable"}
            onChange={() =>
              requestSchemaEditable(schemaEditState !== "editable")
            }
            style={{
              display: schemaEditState === "locking" ? "none" : undefined,
            }}
          />
        </Form>
        <span
          id="schemaEditingSpinner"
          style={{
            display: schemaEditState !== "locking" ? "none" : undefined,
          }}
        >
          <Spinner animation="border" />
        </span>
      </span>
      <span
        style={{
          color: schemaEditState !== "editable" ? "gray" : undefined,
        }}
      >
        Editable
      </span>
    </span>
  );

  const sssIdx = ["saved", "saving", "save-failed"].indexOf(schemaSaveState);
  const schemaSaveStateJsx = (
    <span
      id="schemaSaveState"
      style={{ display: schemaEditState === "editable" ? undefined : "none" }}
    >
      <span id="schemaSaveStateIcon">
        <IconContext.Provider value={{ size: "1.1em" }}>
          {[<FaCheck />, <FaExclamationTriangle />, <FaTimes />][sssIdx]}
        </IconContext.Provider>
      </span>
      <span id="schemaSaveStateLabel">
        {["Saved", "Unsaved Changes", "Saving Failed"][sssIdx]}
      </span>
    </span>
  );

  const fileButton = (
    <DropdownButton
      variant="outline-primary"
      title="Actions"
      disabled={doc === null}
    >
      <Dropdown.Item onClick={toggleJsonView} variant="outline-primary">
        {(showRawJson ? "Hide" : "Show") + " JSON"}
      </Dropdown.Item>
      <Dropdown.Item
        onClick={() => setShowWarnings(!showWarnings)}
        variant="outline-primary"
      >
        {(showWarnings ? "Hide" : "Show") + " Warnings"}
      </Dropdown.Item>
      <Dropdown.Item
        onClick={() => selectSchema(doc!["@id"])}
        variant="outline-primary"
      >
        Refresh
      </Dropdown.Item>
      <Dropdown.Item
        onClick={dialogManagerRef.promptAddStep}
        variant="outline-success"
        disabled={schemaEditState !== "editable"}
      >
        Add Event
      </Dropdown.Item>
      <Dropdown.Item
        onClick={dialogManagerRef.promptAddArg}
        variant="outline-success"
        disabled={schemaEditState !== "editable"}
      >
        Add Entity
      </Dropdown.Item>
    </DropdownButton>
  );

  const undoRedoButtons = (
    <ButtonGroup>
      <IconContext.Provider value={{ size: "1.1em" }}>
        <Button
          variant="outline-primary"
          title="Undo Edit"
          disabled={schemaEditState !== "editable"}
          onClick={() => undoRedoChange("undo")}
        >
          <FaUndo />
        </Button>
        <Button
          variant="outline-primary"
          title="Redo Edit"
          disabled={schemaEditState !== "editable"}
          onClick={() => undoRedoChange("redo")}
        >
          <FaRedo />
        </Button>
      </IconContext.Provider>
    </ButtonGroup>
  );

  return (
    <div
      id="buttonBar"
      style={showRawJson ? {} : { borderBottomColor: "rgba(0, 0, 0, 0)" }}
    >
      {fileButton}
      {undoRedoButtons}
      {schemaEditingSwitch}
      <span id="buttonBarSpacer"> </span>
      {schemaSaveStateJsx}
    </div>
  );
};
