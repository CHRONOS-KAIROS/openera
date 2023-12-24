/**
 * Display the JSON of the schema in a collapsible outline format.
 *
 * The component is intended to supplement the visualization in place where it
 * either might be ambiguous or simply not visualize some aspect of SDF.
 *
 * @packageDocumentation
 */
import * as React from "react";
import { useState, useEffect } from "react";
import Button from "react-bootstrap/Button";

import { JSONTree, KeyPath } from "react-json-tree";
import { containsPath } from "../app/Util";
import * as Sdf from "../types/Sdf";
import { useAppContext } from "../app/Store";
import { highlightPart } from "./diagram/Diagram";

interface Props {
  doc: Sdf.Document;
}

export const JsonTree = ({ doc }: Props) => {
  const { highlightedJsonPath, goToJson } = useAppContext((s) => ({
    highlightedJsonPath: s.highlightedJsonPath,
    goToJson: s.goToJson,
  }));
  const [prevHighlightJsonPath, setPrevHighlightJsonPath] =
    useState<KeyPath | null>(null);
  const [renderIdx, setRenderIdx] = useState(0);

  if (highlightedJsonPath !== prevHighlightJsonPath) {
    setPrevHighlightJsonPath(highlightedJsonPath);
    setRenderIdx(renderIdx + 1);
  }

  const expandPredicate = (keyPath: KeyPath, data: unknown, level: number) => {
    return (
      highlightedJsonPath !== null && containsPath(highlightedJsonPath, keyPath)
    );
  };

  useEffect(() => {
    if (prevHighlightJsonPath) {
      const elem = document.getElementById(
        "jsonTree:" + prevHighlightJsonPath.join("."),
      );
      if (elem) {
        elem.scrollIntoView({
          behavior: "smooth",
          block: "start",
          inline: "nearest",
        });
        elem.parentElement!.parentElement!.style.backgroundColor = "#eeffff";
      }
    }
  }, [prevHighlightJsonPath]);

  const labelRenderer = (keyPath: KeyPath) => {
    return <span id={"jsonTree:" + keyPath.join(".")}>{keyPath[0]}:</span>;
  };
  const valueRenderer = (
    valueAsString: unknown,
    value: unknown,
    ...keyPath: KeyPath
  ) => {
    const v = value as string;
    let buttons = null;
    if (typeof v === "string" && !v.match(/^wd:/) && v.match(/^[a-z]+:/i)) {
      const highlight = () => {
        highlightPart(v as Sdf.AnyId);
      };
      const goto = () => {
        goToJson(v as Sdf.AnyId);
      };
      buttons = (
        <>
          <Button
            className="jsonLinkButton"
            variant="outline-success"
            title="Center on object"
            onClick={highlight}
          >
            Center on object
          </Button>
          <Button
            className="jsonLinkButton"
            variant="outline-success"
            title="Go to JSON"
            onClick={goto}
          >
            Go to JSON
          </Button>
        </>
      );
    }
    return (
      <span>
        <span>{valueAsString as string}</span>
        {buttons}
      </span>
    );
  };

  // For reasons, JSONTree will only obey node expansion when the component is
  // recreated, but recreation also causes the user-initiated expansions to
  // disappear.  Thus we can use renderIdx to force a recreation only when we
  // want to (i.e., when we need to respond to a "go to" event).
  return (
    <JSONTree
      key={renderIdx}
      theme={{
        scheme: "",
        author: "",
        base00: "#ffffff",
        base01: "#e8e8e8",
        base02: "#d8d8d8",
        base03: "#b8b8b8",
        base04: "#585858",
        base05: "#383838",
        base06: "#282828",
        base07: "#181818",
        base08: "#ab2222",
        base09: "#dc6622",
        base0A: "#f76622",
        base0B: "#66b522",
        base0C: "#2266b9",
        base0D: "#2266c2",
        base0E: "#6622af",
        base0F: "#a16622",
      }}
      data={doc}
      shouldExpandNodeInitially={expandPredicate}
      labelRenderer={labelRenderer}
      valueRenderer={valueRenderer}
      collectionLimit={highlightedJsonPath ? 9999 : undefined}
    />
  );
};
