"""Generates Python and TypeScript code from type specification."""
from typing import TypedDict, Union, Literal, Mapping, NoReturn
from textwrap import dedent, indent
from pathlib import Path

import yaml
import black

TypeSpecification = Mapping[str, "NamedType"]
"""Top-level type of the type specification file."""


class NamedTypeOptional(TypedDict, total=False):
    """Optional attributes of `NamedType`.

    Attributes
    ----------
    _args
        See `NamedType._type`
    _kwargs
        See `NamedType._type`
    _intersection
        Other ``_record`` `NamedType` values to add to this type

    """

    _args: list[str]
    _kwargs: Mapping[str, "TypeDef"]
    _intersection: list[str]


class NamedType(TypedDict, NamedTypeOptional):
    """A type with a referenceable name.

    Attributes
    ----------
    _type
        Meta-type describing how to interpret the type

        * ``_record`` - a mapping of specific string keys values of various
          types; `_kwargs <NamedTypeOptional._kwargs>` defines each key and
          its type
        * ``_literal_union`` - a list of specific literal values which
          constitute the type; `_args <NamedTypeOptional._args>` defines the
          allowable values
        * ``_union`` - a union of two more types; `_args
          <NamedTypeOptional._args>` defines the constitutent types
        * ``_array`` - an array; `_args[0] <NamedTypeOptional._args>` defines
          the element type
        * ``_mapping`` - a mapping; `_args[0] <NamedTypeOptional._args>` and
          `_args[1] <NamedTypeOptional._args>` define the type of the key and
          value respectively

    """

    _type: Literal["_record", "_literal_union", "_union", "_array", "_mapping"]


TypeDef = Union[str, "ExpandedTypeDef"]
"""Type of the value of record type."""


class ExpandedTypeDefOptional(TypedDict, total=False):
    """Optional attributes of `ExpandedTypeDef`.

    Attributes
    ----------
    _args
        Additional associated with the `_type <ExpandedTypeDef._type>` (e.g., element type of an
        array)
    _optional : default=False
        ``True`` if the key--value pair can be omitted

    """

    _args: list[str]
    _optional: bool


class ExpandedTypeDef(TypedDict, ExpandedTypeDefOptional):
    """Type definition of a record type with additional attributes.

    Attributes
    ----------
    _type
        The base type

    """

    _type: str


def get_typespecs() -> TypeSpecification:
    """Get type specification file."""
    try:
        with open("./sdf.type.yaml") as fo:
            return yaml.load(fo, Loader=yaml.Loader)
    except FileNotFoundError as e:
        raise Exception("Please run in sdf-types/.") from e


def array_to_ts(args: list[str]) -> str:
    """Generate TypeScript array type string.

    Note that JSON-LD permits singleton arrays to be represented as bare
    values (e.g., ``[x]`` is equivalent to ``x``).

    Parameters
    ----------
    args[0] : str
        Array element type

    """
    if len(args) != 1:
        raise ValueError(f"Type 'array' requires _args of length 1; got {args}.")
    return f"{args[0]} | Array<{args[0]}>"


def mapping_to_ts(args: list[str]) -> str:
    """Generate TypeScript mapping type string.

    Parameters
    ----------
    args[0] : str
        Key type
    args[1] : str
        Value type

    """
    if len(args) != 2:
        raise ValueError(f"Type 'mapping' requires _args of length 2; got {args}.")
    # Maps do not serialize be default which is bad for JSON.
    # return f"Map<{','.join(_args)}>"
    return f"{{[key: {args[0]}]: {args[1]}}}"


def union_to_ts(args: list[str]) -> str:
    """Generate TypeScript union type string."""
    return " | ".join(args)


def record_type_to_ts(rt: TypeDef) -> str:
    """Generate TypeScript interface member type string."""
    if isinstance(rt, str):
        _type = rt
        _args = []
    else:
        _type = rt["_type"]
        _args = rt.get("_args", [])
    if _type == "_array":
        return array_to_ts(_args)
    if _type == "_mapping":
        return mapping_to_ts(_args)
    if _type == "_union":
        return union_to_ts(_args)
    return _type


def expand_record_type(rt: TypeDef) -> ExpandedTypeDef:
    """Convert type string into `ExpandedTypeDef`."""
    if isinstance(rt, str):
        return {"_type": rt}
    return rt


def named_type_to_ts(name: str, nt: NamedType) -> str:
    """Generate TypeScript for top-level named type."""
    _type = nt["_type"]
    prefix = f"export type {name} ="
    if _type == "_record":
        types = []
        for k, rt in nt["_kwargs"].items():
            ert = expand_record_type(rt)
            opt_str = "?" if ert.get("_optional", False) else ""
            types.append(f'"{k}"{opt_str}: {record_type_to_ts(rt)};')
        types_str = indent("\n".join(types), "  ")
        _intersection: list[str] = nt.get("_intersection", [])
        intersection_str = ""
        if _intersection:
            intersection_str = f" & {' & '.join(_intersection)}"
        return f"{prefix} {{\n{types_str}\n}}{intersection_str};\n"
    elif _type == "_literal_union":
        # Great proposal from
        # https://danielbarta.com/literal-iteration-typescript/
        arg_strs = ", ".join(f'"{t}"' for t in nt["_args"])
        type_values = f"export const {name}Values = [{arg_strs}] as const;"
        type_str = f"export type {name} = typeof {name}Values[number];"
        return type_values + "\n" + type_str + "\n"
    elif _type == "_union":
        return f"{prefix} {union_to_ts(nt['_args'])};\n"
    elif _type == "_newtype":
        # // type SchemaId = string & { readonly __tag: unique symbol };
        return f"{prefix} {nt['_args'][0]} & {{ readonly __tag: unique symbol }};\n"
    elif _type == "_array":
        return f'{prefix} {array_to_ts(nt.get("_args", []))}'
    elif _type == "_mapping":
        return f'{prefix} {mapping_to_ts(nt.get("_args", []))}'
    raise ValueError(f"Unhandled type: {_type}")


def write_typescript(ts: TypeSpecification) -> None:
    """Generate TypeScript file according to a type specification."""
    tss_str = [named_type_to_ts(name, ts) for name, ts in ts.items()]
    tss_str_fmtd = "\n".join(tss_str)
    out_str = (
        "// Autogenerated file.  Do not edit.\n"
        "// See sdf-types/\n\n"
        f"{tss_str_fmtd}"
    )
    with open("../client/src/types/Sdf.ts", "w") as fo:
        fo.write(out_str)


_PY_TYPES = {
    "number": "float",
    "string": "str",
    "boolean": "bool",
    "any": "Any",
}


def py_type(t: str) -> str:
    """Get Python type for type string."""
    return _PY_TYPES.get(t, t)


def array_to_py(args: list[str]) -> str:
    """Generate Python array type string.

    Note that JSON-LD permits singleton arrays to be represented as bare
    values (e.g., ``[x]`` is equivalent to ``x``).

    Parameters
    ----------
    args[0] : str
        Array element type

    """
    if len(args) != 1:
        raise ValueError(f"Type 'array' requires args of length 1; got {args}.")
    t = py_type(args[0])
    return f"Union[{t}, list[{t}]]"


def union_to_py(args: list[str]) -> str:
    """Generate Python union type string."""
    type_strs = ", ".join(f'"{py_type(a)}"' for a in args)
    return f"Union[{type_strs}]"


def mapping_to_py(args: list[str]) -> str:
    """Generate Python mapping type string.

    Parameters
    ----------
    args[0] : str
        Key type
    args[1] : str
        Value type

    """
    if len(args) != 2:
        raise ValueError(f"Type 'mapping' requires args of length 2; got {args}.")
    return f"dict[{', '.join(py_type(a) for a in args)}]"


def record_type_to_py(rt: TypeDef) -> str:
    """Generate Python TypeDict member type string."""
    if isinstance(rt, str):
        _type = py_type(rt)
        _args = []
    else:
        _type = py_type(rt["_type"])
        _args = rt.get("_args", [])
    if _type == "_array":
        return array_to_py(_args)
    if _type == "_mapping":
        return mapping_to_py(_args)
    if _type == "_union":
        return f"{union_to_py(_args)}"
    return _type


def named_type_to_py(name: str, nt: NamedType) -> str:
    """Generate Python for top-level named type."""
    _type = nt["_type"]
    prefix = f"{name} ="
    if _type == "_record":
        _intersection: list[str] = nt.get("_intersection", [])
        out_str = ""
        for n, total in (f"_{name}Total", True), (f"_{name}Optional", False):
            fields = {}
            for k, rt in nt["_kwargs"].items():
                ert = expand_record_type(rt)
                if ert.get("_optional", False) != (not total):
                    continue
                fields[k] = record_type_to_py(rt)
            out_str += f'{n} = TypedDict("{n}", {fields}, total={total})\n'
            _intersection.append(n)
        intersection_str = f"{', '.join(_intersection)}"
        return out_str + f"class {name}({intersection_str}):\n    pass\n"
    elif _type == "_literal_union":
        union_str = ", ".join(f'"{py_type(t)}"' for t in nt["_args"])
        return f"{prefix} Literal[{union_str}]\n"
    elif _type == "_union":
        return f"{prefix} {union_to_py(nt['_args'])}\n"
    elif _type == "_newtype":
        typ = py_type(nt["_args"][0])
        return f'{prefix} NewType("{name}", {typ})\n""""""\n'
    elif _type == "_array":
        return f'{prefix} {array_to_py(nt.get("_args", []))}'
    elif _type == "_mapping":
        return f'{prefix} {mapping_to_py(nt.get("_args", []))}'
    raise ValueError(f"Unhandled type: {_type}")


def write_python(ts: TypeSpecification) -> None:
    """Generate Python file according to a type specification."""
    tss_str = [named_type_to_py(name, ts) for name, ts in ts.items()]
    tss_str_fmtd = "\n".join(tss_str)
    out_str = (
        "# Autogenerated file.  Do not edit.\n"
        "# See sdf-types/\n\n"
        "from typing import NewType, Literal, Union, TypedDict, Any\n\n"
        f"{tss_str_fmtd}"
    )
    fn = Path("../server/openera/sdf.py")
    with fn.open("w") as fo:
        fo.write(out_str)
    black.format_file_in_place(fn, False, black.Mode(), write_back=black.WriteBack.YES)


def main() -> None:
    ts = get_typespecs()
    write_typescript(ts)
    write_python(ts)


if __name__ == "__main__":
    main()
