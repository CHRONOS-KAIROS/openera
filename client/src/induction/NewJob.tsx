import * as React from "react";
import { useState } from "react";
import Form from "react-bootstrap/Form";
import Button from "react-bootstrap/Button";

import { JobId } from "./Types";
import { useAppContext } from "../app/Store";
import { formatTitle } from "../app/Util";

const NewJobStatusValues = ["ready", "submitting"] as const;
type NewJobStatus = (typeof NewJobStatusValues)[number];

type Props = {
  updateJobs: () => void;
  selectJob: (jid: JobId) => void;
};

export const NewJob = ({ updateJobs, selectJob }: Props) => {
  const [status, setStatus] = useState<NewJobStatus>("ready");
  const [info, setInfo] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const server = useAppContext((s) => s.server);

  const notReady = status !== "ready";

  const handleSubmit = async () => {
    setStatus("submitting");

    const submitResp = await server.submitJob({
      title: formatTitle(title),
      raw_title: title,
      description,
    });
    const data = await submitResp.json();
    if (submitResp.ok) {
      setInfo("");
      selectJob(data.id);
    } else {
      setInfo(data.message);
    }
    setTitle("");
    setDescription("");
    setStatus("ready");
    updateJobs();
  };

  return (
    <div>
      <h3>New Schema Induction Job</h3>
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
