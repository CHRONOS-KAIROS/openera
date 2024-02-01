import * as Sdf from "../types/Sdf";

export type JobId = string & { readonly __tag: unique symbol };

export const JobStatusValues = [
  "pending",
  "running",
  "failed",
  "completed",
] as const;
export type JobStatus = (typeof JobStatusValues)[number];

export type Job = {
  title: string;
  description: string;
  status: JobStatus;
  parent: JobId | null;
  sdf_data: Sdf.Document | null;
};

export type JobRecord = {
  id: JobId;
  data: Job;
};
