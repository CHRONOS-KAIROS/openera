/**
 * [summary]
 *
 * [more words]
 *
 * @packageDocumentation
 */
import * as React from "react";
import { useState, useEffect, useCallback } from "react";
import Table from "react-bootstrap/Table";
import Button from "react-bootstrap/Button";

import { useUrlState } from "../app/Util";
import { NewJob } from "./NewJob";
import { JobInfo } from "./JobInfo";
import { JobRecord } from "./Types";
import * as Sdf from "../types/Sdf";
import { useAppContext } from "../app/Store";
import { UiPage } from "../Root";

import "../css/Induction.css";

type Props = {
  setPage: (up: UiPage) => void;
};

export const App = ({ setPage }: Props) => {
  const [rowKey, setRowKey] = useUrlState<string | null>("indRowKey", "0");
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [rows, _setRows] = useState<Array<JobRecord>>([]);
  const [selectSchema, server] = useAppContext((s) => [
    s.selectSchema,
    s.server,
  ]);

  const selectedJob = rows.filter((r) => r.id === rowKey)[0] ?? null;

  const setRows = useCallback(
    (newRows: typeof rows) => {
      setLastUpdated(new Date().toLocaleString());
      _setRows(newRows);
    },
    [_setRows, setLastUpdated],
  );

  const updateRows = useCallback(async () => {
    const rows = await server.getInductionJobs();
    setRows(rows);
  }, [setRows, server]);

  useEffect(() => {
    updateRows();
    const interval = window.setInterval(updateRows, 10 * 1000);
    return () => {
      window.clearInterval(interval);
    };
  }, [updateRows]);

  const abbreviate = (s: string) => {
    const limit = 140;
    if (s.length > limit) return s.substring(0, limit - 3) + "...";
    else return s;
  };

  const goToSchema = (doc: Sdf.Document) => {
    selectSchema(doc["@id"]);
    setPage("editor");
  };

  const makeSchemaLink = (doc: Sdf.Document | null) => {
    if (doc) {
      return (
        <Button
          onClick={() => goToSchema(doc)}
          style={{ padding: "0 0.25rem" }}
        >
          Go to schema
        </Button>
      );
    } else return <i>Not available</i>;
  };

  const tableContent = rows.map((r) => (
    <tr
      className={r.id + "" === rowKey ? "indSelected" : ""}
      onClick={() => setRowKey(r.id + "")}
      key={r.id}
    >
      <td>{r.data.title}</td>
      <td>{r.id.substring(0, 4)}</td>
      <td>{abbreviate(r.data.description)}</td>
      <td>{r.data.status}</td>
      <td>{makeSchemaLink(r.data.sdf_data)}</td>
    </tr>
  ));

  const infoContent =
    selectedJob === null ? (
      <NewJob updateJobs={updateRows} selectJob={setRowKey} />
    ) : (
      <JobInfo jobRecord={selectedJob} updateJobs={updateRows} />
    );

  return (
    <div id="indContent">
      <div id="indToolbar">
        <div id="indToolbarButtons">
          <Button onClick={() => setRowKey(null)} variant="success">
            New Job
          </Button>
        </div>
        <span>Last Updated: {lastUpdated ?? "never"}</span>
      </div>
      <div id="indTableDiv">
        <Table striped bordered hover id="indTable">
          <thead>
            <tr>
              <th>
                <div>Title</div>
              </th>
              <th>
                <div>Short ID</div>
              </th>
              <th>
                <div>Description</div>
              </th>
              <th>
                <div>Status</div>
              </th>
              <th>
                <div>Schema</div>
              </th>
            </tr>
          </thead>
          <tbody>{tableContent}</tbody>
        </Table>
      </div>
      <div id="indInfo">{infoContent}</div>
    </div>
  );
};
