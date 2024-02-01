import * as React from "react";
import { useState } from "react";
import Form from "react-bootstrap/Form";
import Button from "react-bootstrap/Button";

import { JobId } from "./Types";
import { newlineToHtml } from "../app/Util";

const NewJobStatusValues = ["ready", "submitting"] as const;
type NewJobStatus = (typeof NewJobStatusValues)[number];

const formatTitle = (t: string) =>
  t
    .split(" ")
    .map((x) => x[0].toUpperCase() + x.slice(1).toLowerCase())
    .join("");

const submitJob = async (
  rawTitle: string,
  description: string,
): Promise<Response> => {
  const title = formatTitle(rawTitle);
  const newJobData = {
    title,
    description,
    status: "pending",
  };
  const resp = await fetch("http://localhost:8000/connector/jobs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(newJobData),
  });
  return resp;
};

type Props = {
  updateJobs: () => void;
  selectJob: (jid: JobId) => void;
};

export const NewJob = ({ updateJobs, selectJob }: Props) => {
  const [status, setStatus] = useState<NewJobStatus>("ready");
  const [info, setInfo] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [description, setDescription] = useState<string>("");

  const notReady = status !== "ready";

  const handleSubmit = async () => {
    setStatus("submitting");
    const submitResp = await submitJob(title, description);
    const data = await submitResp.json();
    if (submitResp.ok) {
      setInfo("");
      selectJob(data.id);
    } else {
      setInfo(data.message);
      console.log(data.message);
    }
    setTitle("");
    setDescription("");
    setStatus("ready");
    updateJobs();
  };

  return (
    <div>
      <h3>New Schema Indunction Job</h3>
      <Form.Group>
        <Form.Label>Title</Form.Label>
        <Form.Control
          id="newJobTitle"
          placeholder="1 to 4 words"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={notReady}
        />
      </Form.Group>
      <Form.Group>
        <Form.Label>Description</Form.Label>
        <Form.Control
          id="newJobDescription"
          as="textarea"
          placeholder="1 to 3 sentences"
          onChange={(e) => setDescription(e.target.value)}
          value={description}
          disabled={notReady}
        />
      </Form.Group>
      <Button disabled={notReady} onClick={handleSubmit}>
        {status === "submitting" ? "Submitting..." : "Submit"}
      </Button>
      <Form.Text
        id="newJobInfo"
        style={{
          display: info ? undefined : "none",
        }}
      >
        <pre>{info}</pre>
      </Form.Text>
    </div>
  );
};
