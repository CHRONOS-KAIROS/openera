.. _client readme:

******************
Client Application
******************

The client is written as a `React <https://reactjs.org/>`_ application in
strict `TypeScript <https://www.typescriptlang.org/>`_.  The diagram uses the
the `ReactFlow <https://reactflow.dev/>`_ framework.  Theming is done with
`React Bootstrap <https://react-bootstrap.github.io/>`_.  It may also be
helpful to understand the basic premise of `Immer
<https://immerjs.github.io/immer/docs/introduction>`_ as it used to modify the
SDF representation in the client.

Getting Started
===============

The only prerequisite for building the frontend is having ``npm`` and
installing the listed dependencies.  If you might need to use multiple versions
of NodeJS on your machine, consider using Node Version Manager.

To run the development server, run ``npm start`` in ``./client/``.  If you do
not wish for this command to automatically open a browser window, prepend it
with ``BROWSER=none``.

Architecture
============

The frontend performs the following functions:

* Graphically displays a schema and translates any edits made in the graphical
  interface into the underlying SDF JSON.
* Provides an interface for basic schema management functions like renaming and
  deleting while the operations take place on the server.
* Provides an interface for users to upload schemas to the backend

Data Flow
---------

Since OpenEra's primary purpose is the manipulation of data, it is important to
understand how and where changes are made in the code.  All direct edits to the
JSON are made via ``app/Schema`` which can be initiated elsewhere.  The change
in the JSON then passes down through React props causing the diagram itself to
update.  The diagram is, in some sense, read-only; that is, all changes made
*directly to the diagram* do not touch the underlying JSON.  Display logic
edits are made to diagram state directly (e.g., which links to display) for
convenience and performance reasons.

This is an important lesson in light of the history of the application.
Previously, JSON was translated into the diagram state, and the state was
translated back into JSON to be saved.  This was extremely difficult to
maintain, until switching to the one-way flow of data mentioned above.

The entire edited SDF JSON is sent back to the server when the user "saves" the
schema from the UI.

Directories
-----------

Here is quick overview of the directory structure.  For further information see
the individual files (listed on the full documentation site).

- ``src/app`` - TypeScript files which contain the application logic and
  utilities not related to the UI.
- ``src/components`` - React components in charge of displaying the
  application.
  These files end up including a large amount of application logic as well.
- ``src/components/diagram`` - All code related to displaying the ReactFlow
  diagram -- the heart of OpenEra.
- ``src/components/dialogs`` - The modal dialogs which the user interacts with.
  Since OpenEra is a single-page application, most user interaction that is not
  graphical or clicking buttons (e.g., editing text, selecting from a list of
  options) happens through these dialogs.
- ``src/index.tsx`` - Specifies which React Component to load at the root
- ``Dockerfile`` - OpenEra runs on Docker in production, and this is the file
  that stores the recipe for that.
- ``httpd.conf`` - The Apache server configuration file used when serving
  inside of Docker.  The only section that has been modified thus far is the
  few lines under ``AuthType Basic`` which adds simple authentication when
  accessing the app in production.

Code
====

The client side code is documented in Typedoc `here <./_static/client-docs/>`_.
