.. _sdf types:

*********
SDF Types
*********

Overview
========

Schema Data Format (SDF) describes how a schema is formally represented in the
KAIROS program.  It forms the very core of how and what OpenEra is visualizing.
Thus, is important for both the front- and backend to be aware of and respect
the format, making this an excellent use case for static typing.

This creates the issue of creating a type specifications in both Python and
TypeScript which align as much as possible (e.g., Python distinguishes between
integers and floats while TypeScript does not).  This could be done by manually
converting one specification to the others, but this makes modifications very
cumbersome and error prone.  Thus, this Python script, is takes an abstract
YAML-based representation of SDF and converts into both Python and TypeScript
types which can be imported into their respective projects.

Type Specification
------------------

The type specification for SDF is given in ``sdf.type.yaml``.  The Python types
(starting with `TypeSpecification`) describe the format of the YAML file.  The
current type specification format should be flexible enough for most scenarios,
although it can always be expanded as needed.

Generating Python and TypeScript
--------------------------------

Running ``generate_types.py`` will write Python and TypeScript code to relevant
``sdf.py`` and ``Sdf.ts`` files.  Since those files are auto-generated, they
should only be modified by running the type generation script.
