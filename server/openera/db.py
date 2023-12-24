"""Interface for the database and on-disk data

No other files should have to touch the disk directly (save for ``config.py``)
as this file should abstract that entirely.

"""
from __future__ import annotations

import sqlite3
from datetime import datetime
from typing import (
    Any,
    Iterator,
    IO,
    cast,
    ForwardRef,
    Optional,
    TypedDict,
    Sequence,
    Mapping,
    Iterable,
    Union,
    List,
    Dict,
    Tuple,
)
import gzip
import json
from pathlib import Path
from contextlib import contextmanager
import re
import itertools
import io
import zipfile
import hashlib

import falcon

from . import sdf
from . import util
from .config import get_config
from .util import ensure_list

DEFAULT_JSON_INDENT = None
get_db_file = lambda: get_config()["db_path"] / "app.sqlite3"
DB_CONNECTION_TIMEOUT = 3
LOCK_LIFETIME = 20
"""How long a write lock lasts on a schema.

Notes
-----
When a lock is older than the `LOCK_LIFETIME` it does *not* automatically
release. It will only be released if manually deleted (e.g., from the API) or
if another process attempts to acquire the lock in which case the expired lock
will be released to the new request.

This value needs to be longer than the refresh interval set on the client.

"""


def get_sql_type(fref: ForwardRef) -> str:
    """Translate the type of a field from a Python schema.

    Parameters
    ----------
    fref : ForwardRef
        Python type name to translated


    Returns
    -------
    str
        SQL type corresponding to the Python type name

    """
    return fref.__forward_arg__.replace("_", " ")


TEXT_PRIMARY_KEY_NOT_NULL = str
# sqlite3 types are optional by default
TEXT = Optional[str]
TEXT_NOT_NULL = str
INT = Optional[int]
INT_NOT_NULL = int

SqlPrimitive = Union[None, int, float, str, bytes]


class SchemasTableRow(TypedDict, total=False):
    """The schema for ``schema`` table

    Introspection can be used to automatically generate the SQL query based on
    this type.

    """

    atId: TEXT_PRIMARY_KEY_NOT_NULL
    lock_ts: INT
    """Unix time"""
    holder_id: TEXT
    data: TEXT_NOT_NULL
    quarantined: INT_NOT_NULL
    note: TEXT
    """Human readable information (e.g., quarantine reason)"""


class WikidataTableRow(TypedDict, total=False):
    """Schema for a cached Wikidata item."""

    node: TEXT_PRIMARY_KEY_NOT_NULL
    """No wdt?: prefix"""
    label: TEXT_NOT_NULL
    description: TEXT_NOT_NULL


TABLES = [
    ("schema", SchemasTableRow),
    ("wd_node", WikidataTableRow),
]

_con: sqlite3.Connection | None = None


def _get_connection() -> sqlite3.Connection:
    """Get the per-thread preconfigured connection."""
    global _con
    if _con is None:
        _con = sqlite3.connect(get_db_file(), timeout=DB_CONNECTION_TIMEOUT)
        _con.row_factory = sqlite3.Row
    return _con


def execute(
    sql: str,
    params: Sequence[SqlPrimitive] | Mapping[str, SqlPrimitive] | None = None,
    cursor: sqlite3.Cursor | None = None,
) -> list[sqlite3.Row]:
    """Execute a low-level query.

    Parameters
    ----------
    sql : str
        Statement to be executed.
    params : Sequence[SqlPrimitive] | Mapping[str, SqlPrimitive], optional
        Parameters to be inserted in the SQL statement.
    cursor : sqlite3.Cursor, optional
        Optionally use pre-existing cursor for the execution

    Returns
    -------
    list[sqlite3.Row]
        Result of the query

    """
    close_cur = False
    if cursor is None:
        close_cur = True
        cursor = _get_connection().cursor()
    if params is None:
        params = []
    cursor.execute(sql, params)
    rows = cursor.fetchall()
    if close_cur:
        cursor.close()
    return rows


class Transaction:
    """Aggregates DB editing functions which take place within a transaction

    Notes
    -----
    This should only be instantiated by the `do_transaction` context manager.

    """

    def __init__(self, cur: sqlite3.Cursor) -> None:
        self._cur = cur

    def execute(
        self, sql: str, params: Sequence[Any] | Mapping[str, Any] | None = None
    ) -> list[sqlite3.Row]:
        """Execute SQL statement within transaction

        See `execute`; ``cursor`` is automatically provided.

        """

        return execute(sql, params, cursor=self._cur)

    def write_new_schema(self, sdf_data: sdf.Document) -> None:
        """Write a new schema to the database

        Parameters
        ----------
        sdf_data : sdf.Document


        Raises
        ------
        falcon.HTTPConflict
            If the schema already exists

        """
        sql_insert = (
            "INSERT INTO Schema (atId, quarantined, data) " "VALUES (:atId, 0, :data)"
        )
        new_row: SchemasTableRow = {
            "atId": sdf_data["@id"],
            "data": json.dumps(sdf_data),
        }
        self._cur.execute(sql_insert, new_row)

    def set_lock(self, acquire: bool, schema_id: str, client_id: str) -> None:
        """Acquire or release a lock on a schema for a specific client.

        Parameters
        ----------
        acquire : bool
            acquire (``True``) or release (``False``) lock.
        schema_id : str
        client_id : str

        Raises
        ------
        falcon.HTTPNotFound
            If the schema does not exist
        falcon.HTTPConflict
            If another client has a non-expired lock on the schema

        """
        sql_select = "SELECT holder_id, lock_ts FROM Schema WHERE atId=?"
        rows = self.execute(sql_select, (schema_id,))
        if not rows:
            raise falcon.HTTPNotFound(f'Schema with @id "{schema_id}" does not exist.')
        else:
            holder_id, lock_ts = rows[0]
        lock_is_valid = lock_ts is not None and _unix_now() - lock_ts <= LOCK_LIFETIME
        if lock_is_valid and holder_id != client_id:
            msg = f"Another user is editing the schema with @id {schema_id}."
            raise falcon.HTTPConflict(title="Failed to lock schema", description=msg)

        sql_update = (
            "UPDATE Schema SET lock_ts=:lock_ts, holder_id=:holder_id "
            "WHERE atId=:atId"
        )
        new_row: SchemasTableRow = {
            "atId": schema_id,
            "lock_ts": _unix_now() if acquire else None,
            "holder_id": client_id if acquire else None,
        }
        self._cur.execute(sql_update, new_row)
        # This should never be true since we just checked everything, but in
        # case something unexpected occurs, fail loudly.
        if self._cur.rowcount != 1:
            raise RuntimeError()

    def _change_referring_schemas(
        self, old_id: str, new_id: str, client_id: str
    ) -> None:
        """Propogate schema @id changes to schemas which include it as a subschema."""
        if old_id == new_id:
            return
        # Ensure referential integrity
        rows = self._cur.execute("SELECT data FROM Schema WHERE quarantined = 0")
        all_schemas = [json.loads(r[0]) for r in rows]
        referring_schemas = [
            schema
            for schema in all_schemas
            if any(e.get("wd_node", None) == old_id for e in schema.get("events", []))
        ]
        # Make the transaction atomic by locking all schemas before
        # executing the name change.
        try:
            for ref_data in referring_schemas:
                self.set_lock(True, ref_data["@id"], client_id)
        except falcon.HTTPConflict as e:
            e.description = f"Schema with @id {ref_data['@id']} refers to this schema and could not be locked."
            raise e
        for ref_data in referring_schemas:
            for event in ref_data["events"]:
                if event.get("wd_node", None) == old_id:
                    event["wd_node"] = new_id
                    event["wd_label"] = new_id.split("/")[-1]
            self.write_schema(ref_data["@id"], ref_data, client_id)

    def write_schema(
        self, schema_id: str, sdf_data: sdf.Document, client_id: str
    ) -> None:
        """Write the specified schema to the database.

        Raises
        ------
        falcon.HTTPNotFound
            If the specified schema is not found in the database
        falcon.HTTPConflict
            If the client has not acquired a lock on the schema

        """

        self.set_lock(True, schema_id, client_id)
        self._change_referring_schemas(schema_id, sdf_data["@id"], client_id)
        update_sql = "UPDATE Schema SET data=:data, atId=:dataAtId, quarantined=0 WHERE atId=:atId"
        params = {
            "data": json.dumps(sdf_data),
            "atId": schema_id,
            "dataAtId": sdf_data["@id"],
        }
        self.execute(update_sql, params)

    def delete_schema(self, schema_id: str, client_id: str) -> None:
        """Delete the speicified schema.

        Raises
        ------
        falcon.HTTPConflict
            If the schema is not locked by the requesting client

        """
        if get_lock_holder(schema_id) not in (client_id, None):
            data = get_schema(schema_id)
            desc = f"Another user is editing the schema {describe_schema(data)}."
            raise falcon.HTTPConflict(title="Schema not deletable", description=desc)
        self.execute("DELETE FROM Schema WHERE atId=?", [schema_id])


def get_schema(schema_id: str, no_validate: bool = False) -> sdf.Document:
    """Return a validated schema file.

    Parameters
    ----------
    no_validate : bool, default False
        Return schema data without validating; schema may be malformed

    Raises
    ------
    falcon.HTTPNotFound
        If the schema does not exist

    """
    rows = execute("SELECT data FROM Schema where atId=?", [schema_id])
    if rows:
        if no_validate:
            return cast(sdf.Document, json.loads(rows[0][0]))
        else:
            return loads_sdf(rows[0][0])
    raise falcon.HTTPNotFound(
        title="Schema not found",
        description=f'Schema with @id "{schema_id}" does not exist.',
    )


def _tag_objects(s: str, objs: list[Any]) -> Any:
    """Inject metadata into objects."""
    for obj in objs:
        private_data = obj.get("privateData", {})
        private_data["originalDocumentId"] = s
        obj["privateData"] = private_data
    return objs


def _add_to_library(
    library: sdf.Document, schema: sdf.Document, remove_args: bool = False
) -> None:
    """Add schema to library document."""
    tag = schema["@id"]
    library["events"] += _tag_objects(tag, ensure_list(schema["events"]))

    entities = [
        e
        for e in ensure_list(schema["entities"])
        if not (remove_args and e.get("privateData", {}).get("isSchemaArg", False))
    ]
    for e in entities:
        e.get("privateData", {})["isSchemaArg"] = False
    library["entities"] += _tag_objects(tag, entities)
    library["relations"] += _tag_objects(tag, ensure_list(schema.get("relations", [])))
    library["provenanceData"] += _tag_objects(
        tag, ensure_list(schema.get("provenanceData", []))
    )


def inject_subschemas(lib: sdf.Document) -> None:
    """Detect and expand subschemas into schema library."""
    i = 0
    events = ensure_list(lib["events"])
    while i < len(events):
        event = events[i]
        if event.get("wd_node", "")[:4] == "cmu:":
            rows = execute(
                "SELECT data FROM Schema where atId=?",
                [ensure_list(event["wd_node"])[0]],
            )
            if rows:
                try:
                    subschema = loads_sdf(rows[0][0])
                except util.ValidationError:
                    i += 1
                    continue
            else:
                i += 1
                continue
            util.fix_atIds(subschema, use_uuids=True)

            args = {
                e["name"]: e
                for e in ensure_list(subschema["entities"])
                if e.get("privateData", {}).get("isSchemaArg", False)
            }
            unused_args = {a["@id"] for a in args.values()}
            for p in ensure_list(event["participants"]):
                util.sub_id(subschema, args[p["roleName"]]["@id"], p["entity"])
                unused_args.remove(args[p["roleName"]]["@id"])

            for e in ensure_list(subschema["events"]):
                ps = ensure_list(e["participants"])
                j = 0
                while j < len(ps):
                    if ps[j]["entity"] in unused_args:
                        del ps[j]
                    else:
                        j += i
                e["participants"] = ps
            del events[i]

            _add_to_library(lib, subschema, remove_args=True)

            all_events = {e["@id"] for e in ensure_list(subschema["events"])}
            all_children = {
                c["child"]
                for e in ensure_list(subschema["events"])
                for c in ensure_list(e.get("children", []))
            }

            all_roots = all_events - all_children
            if len(all_roots) > 1:
                raise ValueError(
                    f"Subschema {subschema['@id']} has multiple root events."
                )
            subschema_root_id = list(all_roots)[0]
            util.sub_id(events, event["@id"], subschema_root_id)
            util.sub_id(lib, event["@id"], subschema_root_id)
        else:
            i += 1


def _fix_children_gates(lib: sdf.Document) -> None:
    """Validate children_gate values."""
    for e in ensure_list(lib["events"]):
        if "children" in e and len(e["children"]) == 0:
            del e["children"]
        if "children" not in e and "children_gate" in e:
            del e["children_gate"]
        if "children" in e and len(e["children"]) > 0 and "children_gate" not in e:
            e["children_gate"] = "and"


WIKI_PAT = re.compile(r"^wdt?:")
CMU_PAT = re.compile(r"^cmu:")


def _ensure_wd_values(obj: Any) -> None:
    """Ensure wd_label and wd_description are populated when wd_node is present."""
    wd_node = obj.get("wd_node", "")
    if WIKI_PAT.match(wd_node):
        stripped = WIKI_PAT.sub("", wd_node)
        label, desc = get_wikidata_values(stripped)
        obj["wd_label"] = label
        obj["wd_description"] = desc
    elif CMU_PAT.match(wd_node):
        obj["wd_label"] = wd_node.split("/")[-1]
        obj["wd_description"] = obj["wd_label"]
        assert False


def _fix_wd_values(lib: sdf.Document) -> None:
    for event in ensure_list(lib["events"]):
        _ensure_wd_values(event)
        for participant in ensure_list(event.get("participants", [])):
            _ensure_wd_values(participant)
    for entity in ensure_list(lib["entities"]):
        _ensure_wd_values(entity)
    for relation in ensure_list(lib["relations"]):
        _ensure_wd_values(relation)


def _fix_unused_args(lib: sdf.Document) -> None:
    arg_ids = {
        e["@id"] for e in ensure_list(lib["entities"]) + ensure_list(lib["events"])
    }
    for event in ensure_list(lib["events"]):
        event["participants"] = [
            p
            for p in ensure_list(event.get("participants", []))
            if p["entity"] in arg_ids
        ]


def zip_schemas(schema_ids: List[str]) -> io.BytesIO:
    """Return ZIP archive of the selected schemas."""
    qmarks = ",".join("?" * len(schema_ids))
    rows = execute(f"SELECT data FROM Schema where atId IN ({qmarks})", schema_ids)
    data = io.BytesIO()
    with zipfile.ZipFile(data, "w", compression=zipfile.ZIP_DEFLATED) as z:
        for row in rows:
            try:
                schema = loads_sdf(row[0])
            except util.ValidationError:
                continue
            z.writestr(schema["@id"].split("/")[-1] + ".json", row[0])
    return data


_alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"


def digest_to_base62(b: bytes) -> str:
    """Conver bytes human-readable string."""
    n = sum(x * 2 ** (8 * i) for i, x in enumerate(b))
    s = ""
    while n > 0:
        s += _alphabet[n % len(_alphabet)]
        n //= len(_alphabet)
    return s


def package_schemas(name: str, schema_ids: List[str]) -> sdf.Document:
    """Build a schema library from the specified schemas."""
    qmarks = ",".join("?" * len(schema_ids))
    rows = execute(f"SELECT data FROM Schema where atId IN ({qmarks})", schema_ids)
    schemas = []
    for row in rows:
        try:
            schema = loads_sdf(row[0])
        except util.ValidationError:
            continue
        schemas.append(schema)
    all_event_types = {
        e.get("wd_node", None) for s in schemas for e in ensure_list(s["events"])
    }

    schemas = sorted(schemas, key=lambda x: x["@id"])
    hasher = hashlib.blake2b(digest_size=8, usedforsecurity=False)
    for s in schemas:
        hasher.update(json.dumps(s).encode())
    digest = digest_to_base62(hasher.digest())
    library = create_blank_schema(f"{name}-{digest}")
    library["privateData"] = {"inputDigest": digest}

    for schema in schemas:
        # Only include schemas which are not included as a subschema
        if cast(sdf.WdNode, schema["@id"]) in all_event_types:
            continue
        util.fix_atIds(schema, use_uuids=True)
        _add_to_library(library, schema)
    library["privateData"]["constitutentSchemas"] = schema_ids
    inject_subschemas(library)
    util.fix_atIds(library)

    _fix_children_gates(library)
    _fix_wd_values(library)
    _fix_unused_args(library)
    util.recursive_remove(library, {"provenance"})
    util.recursive_remove(library, {"outlink_gate"})
    return library


def get_lock_holder(schema_id: str) -> str | None:
    """Return ``True`` if the client has a lock on the schema."""
    params = {
        "atId": schema_id,
    }
    rows = execute("SELECT holder_id FROM Schema WHERE atId=:atId", params)
    return rows[0][0] if rows else None


@contextmanager
def do_transaction() -> Iterator[Transaction]:
    """Yield a transaction that automatically begins and commits/rolls back.

    Notes
    -----
    The primary purposes of this function is provide a context manager for
    other parts of the application which automatically handles transactions.
    For example, if process A needs to check if the client has locked a schema
    and then write the new schema to disk, it must do this while the DB is
    write-locked. Otherwise, it would be possible for process B to acquire
    a lock on the schema (if it expired in the meantime) and write to it in
    between the process A checking the lock and writing the disk to file.

    """
    con = _get_connection()
    txn = Transaction(con.cursor())
    # DELAYED causes frequent timeout errors and EXCLUSIVE is unnecessary
    txn._cur.execute("BEGIN IMMEDIATE")
    try:
        with con:
            yield txn
    finally:
        txn._cur.close()


def init_db() -> None:
    """Create the database idempotently."""
    con = _get_connection()
    cur = con.cursor()
    with con:
        cur.execute("BEGIN EXCLUSIVE")
        for table_name, row_type in TABLES:
            col_defs = ",".join(
                f"{key} {get_sql_type(fref)}"
                for key, fref in row_type.__annotations__.items()
            )
            cur.execute(f"CREATE TABLE IF NOT EXISTS {table_name} ({col_defs})")
    _validate_schemas()


def _validate_schemas() -> None:
    """Validate all schemas in the database.

    Notes
    -----
    This function will quarantine any schemas that fail validation.

    """
    with do_transaction() as txn:
        rows = txn.execute("SELECT atId, data FROM Schema WHERE quarantined=0")

        for atId, data in rows:
            reason: str | None = None
            try:
                data_dict = json.loads(data)
                verified = util.validate_type(sdf.Document, data_dict)
            except util.ValidationError as e:
                reason = "Not Valid SDF\n" + e.args[0]
            except json.decoder.JSONDecodeError:
                reason = "Not valid JSON"
            if reason is not None:
                sql_update = (
                    "UPDATE Schema SET quarantined=1, note=:note WHERE atId=:atId"
                )
                txn.execute(sql_update, {"atId": atId, "note": reason})


def _unix_now() -> int:
    """Get current time in Unix epoch format."""
    return int(datetime.now().timestamp())


def describe_schema(sdf_data: sdf.Document) -> str:
    return f"{sdf_data['@id']}"


def create_blank_schema(name: str) -> sdf.Document:
    """Create and save a new schema with a given name."""
    with (get_config()["sdf_config_path"] / get_config()["context_file"]).open(
        "r"
    ) as fo:
        jsonldContext = json.load(fo)

    return {
        "@context": jsonldContext["@context"],
        "sdfVersion": util.extract_sdf_version(get_config()["context_file"]),
        "@id": cast(sdf.DocumentId, f"cmu:Schema/{name}"),
        "version": "cmu-v0",
        "events": [],
        "relations": [],
        "entities": [],
        "privateData": {"eratosthenes": {}},
        "provenanceData": [],
    }


def get_event_primitives() -> dict[str, dict[str, Any]]:
    """Generate and return event primitives from ontology file."""
    with gzip.open(get_config()["sdf_config_path"] / "xpo.event.json.gz") as fo:
        xpo_dict = json.load(fo)
    with (get_config()["sdf_config_path"] / "faers.event.json").open("r") as fo:
        faers_dict = json.load(fo)
    all_values = itertools.chain(
        *[d["events"].values() for d in [xpo_dict, faers_dict]]
    )
    primitive_dict = {
        v["wd_node"]: {
            "wd_node": v["wd_node"],
            "wd_label": v["name"],
            "wd_description": v.get("wd_description", ""),
            "args": [
                {"name": "_".join(a["name"].split("_")[:2]), "fullName": a["name"]}
                for a in v["arguments"]
                if a != "---"
            ],
            "isSubschema": False,
        }
        for v in all_values
        if "wd_node" in v
    }

    with do_transaction() as txn:
        rows = txn.execute("SELECT atId, json_extract(data, '$.entities') FROM Schema")
    parsed_rows = [(row[0], json.loads(row[1])) for row in rows if row[1]]
    subschema_dict = {
        row[0]: {
            "wd_node": row[0],
            "wd_label": row[0].split("/")[-1],
            "args": [
                {
                    "name": arg["name"],
                    "fullName": arg["name"],
                }
                for arg in row[1]
                if arg.get("privateData", {}).get("isSchemaArg", False)
            ],
            "isSubschema": True,
        }
        for row in parsed_rows
    }
    return cast(dict[str, dict[str, Any]], subschema_dict | primitive_dict)


def get_wikidata_values(wd_node: str) -> Tuple[str, str]:
    """Get Wikidata metadata for QNode

    Note
    ----
    This will make a call to the Wikidata API if the QNode (``wd_node``) is not
    found.

    """

    rows = execute("select label, description from wd_node where node = ?", (wd_node,))
    if rows:
        label = rows[0][0]
        desc = rows[0][1]
    else:
        result = util.get_wikidata_item(wd_node)
        data = json.loads(result.text)
        if "error" in data:
            return "", ""
        data = data["entities"][wd_node]
        label = data["labels"]["en"]["value"]
        if data["descriptions"]:
            desc = data["descriptions"]["en"]["value"]
        else:
            desc = label
        with do_transaction() as txn:
            txn.execute("insert into wd_node values (?,?,?)", (wd_node, label, desc))
    return label, desc


def dump_sdf(
    obj: sdf.Document, fp: IO[str], *, indent: int | None = DEFAULT_JSON_INDENT
) -> None:
    """Type-safe json dump."""
    json.dump(obj, fp, indent=indent)


def dumps_sdf(obj: sdf.Document, *, indent: int | None = DEFAULT_JSON_INDENT) -> str:
    """Type-safe json dumps."""
    return json.dumps(obj, indent=indent)


# IO[str | bytes] might be too restrictive. `load` uses SupportsRead, but that
# is not easily imported
def load_sdf(fp: IO[str]) -> sdf.Document:
    """Type-safe json load."""
    return util.validate_type(sdf.Document, json.load(fp))


def loads_sdf(s: str | bytes) -> sdf.Document:
    """Type-safe json loads."""
    return util.validate_type(sdf.Document, json.loads(s))
