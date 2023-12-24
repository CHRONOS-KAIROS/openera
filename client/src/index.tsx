/**
 * Application entry point.
 *
 * Global configuration options that are defined through executing a method
 * should go here.
 *
 * @packageDocumentation
 */
import React from "react";
import ReactDOM from "react-dom";
import * as immer from "immer";

import { AppLoader } from "./app/AppLoader";

import "bootstrap/dist/css/bootstrap.min.css";
import "allotment/dist/style.css";

immer.enablePatches();
immer.enableMapSet();

ReactDOM.render(<AppLoader />, document.getElementById("root"));
