/**
 * A catch-all module for often-repeated code with no better place to be.
 *
 * @packageDocumentation
 */

import * as React from "react";
import { useState, useEffect, useCallback } from "react";
import { KeyPath } from "react-json-tree";
import { toast } from "react-toastify";

import * as Types from "../types/Types";

/** https://stackoverflow.com/a/54014428/2624650 */
export const hsl2rgb = (h: number, s: number, l: number): string => {
  let a = s * Math.min(l, 1 - l);
  let f = (n: number, k = (n + h / 30) % 12) =>
    255 * (l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1));
  return `rgb(${f(0)}, ${f(8)}, ${f(4)})`;
};

/** Convert array-ish value to a real array. */
export const forceArray = <T,>(x: Array<T> | T | undefined): Array<T> =>
  x === undefined ? [] : x instanceof Array ? x : [x];

export const intersect = <T,>(xs: T[][]): T[] =>
  xs.reduce((x, y) => x.filter((_x) => y.includes(_x)));

const digits =
  "0123456789ABCEDEFGHIJKLMNOPQRSTUVWXYZabcedefghijklmnopqrstuvwxyz";

export const makeRandomKey = (): string => {
  const arr = new Uint8Array(7);
  window.crypto.getRandomValues(arr);
  const n = arr.reduce((acc, x, i) => acc + x * 256 ** i);
  const b = digits.length;
  const chBase = (x: number): string =>
    x ? chBase(Math.floor(x / b)) + digits[x % b] : "";
  return chBase(n);
};

export const getLastIri = (x: string): string => x.replace(/.*\//, "");

// NOTICE This must manually kept in sync with the relevant definition. The
// only way to automatically generate type guards is through some non-trivial
// compiler augmentations.
export const isSchemaSummary = (x: any): x is Types.SchemaSummary =>
  [typeof x.schemaId === "string", x.tags instanceof Array].every((x) => x);

export const containsPath = (a: KeyPath, b: KeyPath) => {
  if (a.length < b.length) return false;
  const br = b.slice().reverse();
  return a
    .slice()
    .reverse()
    .map((x, i) => br[i] === undefined || br[i] === x)
    .every((x) => x);
};

export const pathsEqual = (a: KeyPath, b: KeyPath) => {
  if (a.length !== b.length) return false;
  return a.map((x, i) => b[i] === x).every((x) => x);
};

export const getPath = (
  obj: Array<any> | Object,
  key: string | number,
  val: any,
): KeyPath | null => {
  if ((obj as any)[key] === val) return [key];
  const objKeys = Array.isArray(obj) ? obj.keys() : Object.keys(obj);
  for (let k of objKeys) {
    const v = (obj as any)[k];
    if (typeof v !== "object") continue;
    const res = getPath(v, key, val);
    if (res !== null) return res.concat([k]);
  }
  return null;
};

/**
 * Automatically make selector to avoid having to repeat store components three
 * times to define a selector.
 */
export const makeSelectorFor =
  <StoreType,>() =>
  <Keys extends Readonly<Array<keyof StoreType>>>(selection: Keys) =>
  (store: StoreType): Pick<StoreType, Keys[number]> => {
    const obj = {} as Partial<StoreType>;
    selection.forEach((k) => (obj[k] = store[k]));
    return obj as any;
  };

type ErrorMessage = {
  title: string;
  description: string;
};

const isErrorMessage = (x: any): x is ErrorMessage =>
  typeof x.title === "string" && typeof x.description === "string";

export const newlineToHtml = (s: string) =>
  s.split("\n").flatMap((s: string) => [s, <br />]);

/**
 * Notify the user of the error and perform any other relevant actions.
 *
 * Although the primary use for this method is handling errors returned by
 * the API (i.e., `Response` objects), it should be able to generically
 * report any error the application might produce.
 */
export const handleError = async (
  e: unknown,
  warn?: boolean,
): Promise<void> => {
  let title: string = "[title unset]";
  let description: string = "[description unset]";
  if (e instanceof Response) {
    const json = await e.json();
    title = json.title;
    description = json.description;
  } else if (isErrorMessage(e)) {
    title = e.title;
    description = e.description;
  } else if (e instanceof Error) {
    title = e.name;
    description = e.message;
  } else {
    title = "Error";
    description = e + "";
  }
  if (e instanceof Error) console.warn(e);
  else console.warn(title, description);
  const htmlDescription = newlineToHtml(description);
  htmlDescription.pop();
  const jsx = (
    <>
      {title ? <h4>{title}</h4> : null}
      {htmlDescription}
    </>
  );
  if (warn) toast.warn(jsx);
  else toast.error(jsx);
};

export const urlGet = (key: string): string | null =>
  new URLSearchParams(window.location.hash.substring(1)).get(key);

export const urlSet = (key: string, value: string | null) => {
  const usp = new URLSearchParams(window.location.hash.substring(1));
  if (value === null) usp.delete(key);
  else usp.set(key, value);
  window.location.hash = usp.toString();
};

export type UrlValue = string | null;

export const useUrlState = <T extends UrlValue>(
  key: string,
  initVal: T,
): [T, (v: T) => void] => {
  const [state, _setState] = useState(initVal);

  const setState = useCallback(
    (value: T) => {
      urlSet(key, value);
      _setState(value);
    },
    [_setState, key],
  );

  useEffect(() => {
    setState((urlGet(key) as any) ?? initVal);
  }, [initVal, key, setState]);

  return [state, setState];
};

export const formatTitle = (t: string) =>
  t
    .split(" ")
    .map((x) => x[0].toUpperCase() + x.slice(1).toLowerCase())
    .join("");
