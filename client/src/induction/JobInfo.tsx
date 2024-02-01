import * as React from "react";
import Button from "react-bootstrap/Button";

import { JobId, JobRecord } from "./Types";

type Props = {
  jobRecord: JobRecord;
  updateJobs: () => void;
};

const deleteJob = async (id: JobId) => {
  const resp = await fetch("http://localhost:8000/connector/jobs/" + id, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
  });
  return resp;
};

export const JobInfo = ({ jobRecord, updateJobs }: Props) => {
  const handleDelete = async () => {
    await deleteJob(jobRecord.id);
    updateJobs();
  };

  return (
    <div id="indJobInfo">
      <div>
        <Button variant="danger" onClick={handleDelete}>
          Delete
        </Button>
      </div>
      <div>
        <b>Full ID:</b> {jobRecord.id}
        <br />
        <b>Status:</b> {jobRecord.data.status}
        <br />
        <b>Title:</b> {jobRecord.data.title}
        <br />
        <b>Description:</b> {jobRecord.data.description}
        <br />
      </div>
    </div>
  );
};
