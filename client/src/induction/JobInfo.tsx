import * as React from "react";
import Button from "react-bootstrap/Button";

import { JobRecord } from "./Types";
import { useAppContext } from "../app/Store";

type Props = {
  jobRecord: JobRecord;
  updateJobs: () => void;
};

export const JobInfo = ({ jobRecord, updateJobs }: Props) => {
  const server = useAppContext((s) => s.server);
  const handleDelete = async () => {
    await server.deleteJob(jobRecord.id);
    updateJobs();
  };

  const makeField = (label: string, data: string) => (
    <div key={label}>
      <b>{label}: </b>
      {data ?? <i>N/A</i>}
      <br />
    </div>
  );

  const fields = [
    ["Full ID", jobRecord.id],
    ["Title", jobRecord.data.title],
    ["Status", jobRecord.data.status],
    ["Description", jobRecord.data.description],
    ["Raw Title", jobRecord.data.raw_title],
    ["Error Message", jobRecord.data.error_message],
    [
      "Last Updated",
      jobRecord.data.last_updated &&
        new Date(jobRecord.data.last_updated).toLocaleString(),
    ],
  ] as Array<[string, string]>;

  return (
    <div id="indJobInfo">
      <div>
        <Button variant="danger" onClick={handleDelete}>
          Delete Job
        </Button>
      </div>
      <div>{fields.map((args) => makeField(...args))}</div>
    </div>
  );
};
