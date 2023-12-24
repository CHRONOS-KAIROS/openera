.. _server readme:

**********
API Server
**********

The API server is written in Python using the web framework `falcon
<https://falconframework.org/>`_ with `gunicorn <https://gunicorn.org/>`_ as
the underlying WSGI server.  It is responsible for storing and managing schemas
as well some other miscellaneous functions like managing user sessions.
Instructions for running the development and production versions of the API
server can be found on `the main page <running prod>`.


Overview
========

The backend performs the following functions.

* Serves an API for the frontend to connect to
* Reading, writing, deleting, managing the saved schemas
* Connecting to external services including which currently includes Wikidata
  and the SDF validator
* Performing background and/or bulk changes to schemas, that is, changes that
  do not require the user to have that specific schema open
* Serving schemas for direct download

General action for the code base (some of these might require prefixing
:command:`poetry run COMMAND` if Nix shell integration is not used):

* `Running the development server <running dev>`
* Adding a package: :command:`poetry add PACKAGE` (or edit ``pyproject.toml``);
  run :command:`direnv reload` if using direnv to refresh the shell.
* Typechecking the code: :command:`mypy -p openera`
* Formatting the code: :command:`black openera`

Typing
------

The Python codebase is intended to be typed as strictly as possible via mypy.
For mypy configuration (e.g., ignoring libraries without type stubs), see
``mypy.ini``.

The ``openera/sdf.py`` file is automatically generated to keep the SDF
specification in sync with the TypeScript code.  For information on the type
generation process, see `SDF Types <sdf types>`.  Validation of ingested SDF
data is currently done by building a validation model with `Pydantic
<https://github.com/pydantic/pydantic/>`_ from the Python type annotation and
using it to validate a dictionary parsed from SDF JSON input.
