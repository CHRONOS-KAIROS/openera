/**
 * The main application page.
 *
 * This component is in charge of the layout and display logic of the main
 * page.  This component tends to become a hotspot, so special care should be
 * taken to export functionality when possible.
 *
 * @packageDocumentation
 */

import * as React from "react";
import { useRef, useEffect } from "react";
import { useStore } from "zustand";
import { Allotment } from "allotment";
import { ToastContainer } from "react-toastify";
import { ReactFlowProvider } from "reactflow";
import "react-toastify/dist/ReactToastify.css";

import { Diagram } from "./diagram/Diagram";
import { loadDocument } from "./diagram/Loader";
import { SchemaLibraryMenu } from "./SchemaLibraryMenu";
import { DialogManager } from "./DialogManager";
import { ButtonBar } from "./ButtonBar";
import { JsonTree } from "./JsonTree";

import "../css/App.css";
import { makeSelectorFor, urlSet, urlGet } from "../app/Util";
import * as Sdf from "../types/Sdf";
import {
  AppState,
  AppAction,
  AppContext,
  AppProps,
  AppStore,
  createAppStore,
} from "../app/Store";

/** The key for the query string in the URL anchor specifying the schema */
const URL_KEY = "schemaId";

/**
 * How often to ping the server refreshing a write lock on the schema
 *
 * This _must_ be less than the write lock lifetime as defined in `db.py` on
 * the server.  Unit is milliseconds.
 */
const WRITE_LOCK_REFRESH_INTERVAL = 15 * 1000;

const PLACEHOLDER_MESSAGES = {
  empty: "Please select a schema.",
  error: "An error occurred loading the schema.",
  loading: "Loading schema...",
  loaded: "",
};

const selector = makeSelectorFor<AppState & AppAction>()([
  "showRawJson",
  "schemaState",
  "schemaEditState",
  "selectedId",
  "selectSchema",
  "loadSchema",
  "getCurrentSummary",
  "doc",
  "refreshWriteLock",
  "clientId",
  "mutator",
  "schemaSummaries",
  "reloadSummaries",
  "schemaSaveState",
] as const);

export const AppContent = (props: AppProps) => {
  // Declare values, state //

  const appStore = useRef<AppStore | null>(null);
  if (appStore.current === null) appStore.current = createAppStore(props);

  const { eventPrimitives } = props;
  const store = useStore(appStore.current, selector);
  const {
    selectSchema,
    schemaSummaries,
    selectedId,
    schemaState,
    getCurrentSummary,
    loadSchema,
  } = store;

  const writeLockRefresherId = useRef<null | number>(null);

  // Application logic //

  const lastWindowFocus = useRef(new Date());
  const handleFocus = () => (lastWindowFocus.current = new Date());
  useEffect(() => {
    window.addEventListener("focus", handleFocus);
    // Not sure if this is the right way to remove the event listener.
    return () => window.removeEventListener("focus", handleFocus);
  }, []);

  useEffect(() => {
    if (schemaSummaries.size > 0 && !selectedId) {
      const urlId = urlGet(URL_KEY) as Sdf.DocumentId;
      const selectedId =
        urlId !== null && schemaSummaries.has(urlId)
          ? urlId
          : schemaSummaries.keys().next().value;
      selectSchema(selectedId);
    }
    if (selectedId) {
      urlSet(URL_KEY, selectedId);
    }
  }, [schemaSummaries, selectSchema, selectedId]);

  useEffect(() => {
    const idIsValid = selectedId !== null && getCurrentSummary() !== null;
    if (schemaState === "empty" && idIsValid) loadSchema();
  }, [selectedId, getCurrentSummary, loadSchema, schemaState]);

  useEffect(() => {
    store.reloadSummaries();
    // Reload summaries whenever the selectedId changes.
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (
    selectedId !== null &&
    store.schemaEditState === "editable" &&
    writeLockRefresherId.current === null
  ) {
    writeLockRefresherId.current = window.setInterval(
      () => store.refreshWriteLock(lastWindowFocus),
      WRITE_LOCK_REFRESH_INTERVAL,
    );
  } else if (
    store.schemaEditState !== "editable" &&
    writeLockRefresherId.current !== null
  ) {
    window.clearInterval(writeLockRefresherId.current);
    writeLockRefresherId.current = null;
  }

  // Only run on unmount.
  useEffect(
    () => () => {
      if (writeLockRefresherId.current !== null)
        window.clearInterval(writeLockRefresherId.current);
    },
    [],
  );

  // Define components //

  const loadDocumentWithData = (d: Sdf.Document) =>
    loadDocument(d, eventPrimitives, store.schemaSummaries);
  const maybeDiagram = store.doc ? (
    <Diagram doc={store.doc} loadDocument={loadDocumentWithData} />
  ) : (
    <div id="diagramPlaceholder">{PLACEHOLDER_MESSAGES[store.schemaState]}</div>
  );

  const maybeJsonTree = store.doc ? <JsonTree doc={store.doc} /> : null;

  return (
    <AppContext.Provider value={appStore.current}>
      <ReactFlowProvider>
        <DialogManager />
        <ToastContainer
          position="bottom-center"
          pauseOnHover
          pauseOnFocusLoss
          autoClose={false}
          closeOnClick={false}
          draggable={false}
          newestOnTop
        />
        <Allotment vertical={false}>
          <Allotment.Pane>
            <Allotment vertical={true}>
              <div id="topLeftDiv">
                {maybeDiagram}
                <ButtonBar />
              </div>
              <Allotment.Pane visible={store.showRawJson} preferredSize={300}>
                <div style={{ width: "100%" }}>
                  <div
                    id="reactJsonContainer"
                    style={{ display: store.showRawJson ? "block" : "none" }}
                  >
                    {maybeJsonTree}
                  </div>
                </div>
              </Allotment.Pane>
            </Allotment>
          </Allotment.Pane>
          <Allotment.Pane preferredSize={400} snap={true}>
            <div id="schemaNavDiv" className="topdiv">
              <SchemaLibraryMenu />
            </div>
          </Allotment.Pane>
        </Allotment>
      </ReactFlowProvider>
    </AppContext.Provider>
  );
};
