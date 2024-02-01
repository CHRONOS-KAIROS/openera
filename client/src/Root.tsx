/**
 * [summary]
 *
 * [more words]
 *
 * @packageDocumentation
 */
import * as React from "react";
import { useMemo, useState, useEffect, useCallback } from "react";
import Tabs from "react-bootstrap/Tabs";
import Tab from "react-bootstrap/Tab";

import { AppLoader } from "./app/AppLoader";
import { useUrlState } from "./app/Util";
import { App as InductionApp } from "./induction/App";

import "./css/App.css";

const UiPageValues = ["editor", "induction"] as const;
type UiPage = (typeof UiPageValues)[number];

export const Root = () => {
  const [page, setPage] = useUrlState<UiPage>("page", "induction");

  return (
    <Tabs
      activeKey={page}
      onSelect={setPage as any}
      style={{
        marginTop: "0.25rem",
        padding: "0 0.25rem",
      }}
    >
      <Tab eventKey="editor" title="Editor">
        <AppLoader />
      </Tab>
      <Tab eventKey="induction" title="Induction">
        <InductionApp />
      </Tab>
    </Tabs>
  );
};
