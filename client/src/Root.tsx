/**
 * [summary]
 *
 * [more words]
 *
 * @packageDocumentation
 */
import * as React from "react";
import { useState, useEffect } from "react";
import Tabs from "react-bootstrap/Tabs";
import Tab from "react-bootstrap/Tab";

import { useUrlState } from "./app/Util";
import { App as InductionApp } from "./induction/App";
import { Server } from "./app/Server";
import { AppContent } from "./components/AppContent";
import { AppProps, AppContext, AppStore, createAppStore } from "./app/Store";

import "./css/App.css";

const UiPageValues = ["editor", "induction"] as const;
export type UiPage = (typeof UiPageValues)[number];

type RootStatus = "normal" | "error";

export const Root = () => {
  const [appStore, setAppStore] = useState<AppStore | null>(null);
  const [page, setPage] = useUrlState<UiPage>("page", "editor");
  const [status, setStatus] = useState<RootStatus>("normal");
  const [server, setServer] = useState<Server | null>(null);
  const [eventPrimitives, setEventPrimitives] = useState<
    AppProps["eventPrimitives"] | null
  >(null);

  const handleError = (e: any) => {
    console.error(e);
    setStatus("error");
  };

  useEffect(() => {
    Server.getClientVersion()
      .then((cv) => {
        const server = new Server(cv);
        setServer(server);
      })
      .catch(handleError);
  }, []);

  useEffect(() => {
    if (server && status !== "error") {
      if (!eventPrimitives)
        server.getEventPrimitives().then(setEventPrimitives).catch(handleError);
    }
  }, [server, status, eventPrimitives]);

  useEffect(() => {
    if (server && eventPrimitives)
      setAppStore(createAppStore({ server, eventPrimitives }));
  }, [eventPrimitives, server]);

  if (appStore) {
    return (
      <AppContext.Provider value={appStore}>
        <Tabs
          activeKey={page}
          onSelect={setPage as any}
          style={{
            marginTop: "0.25rem",
            padding: "0 0.25rem",
          }}
        >
          <Tab eventKey="editor" title="Editor">
            <AppContent />;
          </Tab>
          <Tab eventKey="induction" title="Induction">
            <InductionApp setPage={setPage} />
          </Tab>
        </Tabs>
      </AppContext.Provider>
    );
  } else {
    return (
      <div id="appLoaderDefault">
        {status === "error"
          ? "An error occurred while loading OpenEra."
          : "Loading..."}
      </div>
    );
  }
};
