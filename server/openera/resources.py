"""Defines the functionality of the API

Only classes which define API endpoints should be in here. All other content
belongs in other files.

"""
from __future__ import annotations

import json
from typing import Any, cast
import uuid
import datetime
import os

import requests
import falcon
import typing_extensions

from . import util
from .config import get_config
from . import sdf
from . import db


class Schemas:
    """Schema methods that do not apply to a specific schema"""

    @staticmethod
    def on_get(req: Any, resp: Any) -> None:
        """Get a list of schema summaries."""
        body = []
        sql_select = """
            SELECT json_extract(
                data,
                '$.@id',
                '$.privateData.eratosthenesTags'
            )
            FROM Schema
            WHERE quarantined=0
        """
        rows = db.execute(sql_select)
        for row in rows:
            schemaId, tags = json.loads(row[0])
            body.append({"schemaId": schemaId, "tags": tags or []})
        resp.body = json.dumps(body)
        resp.status = falcon.HTTP_200

    @staticmethod
    def on_post(req: Any, resp: Any) -> None:
        """Create a blank schema for a given name.

        Parameters
        ----------
        name : str, in JSON body
            The name of the new schema; it can be the same as other schemas'

        Raises
        ------
        falcon.HTTPBadRequest
            If body parameters are missing

        """
        req_json = json.load(req.stream)
        if "name" not in req_json:
            raise falcon.HTTPBadRequest('Missing param "name"')
        sdf_data = db.create_blank_schema(str(req_json["name"]))
        with db.do_transaction() as txn:
            txn.write_new_schema(sdf_data)
        resp.body = json.dumps({"schemaId": sdf_data["@id"]})
        resp.status = falcon.HTTP_201


class SchemaInstance:
    """Schema methods which pertain to a specific ``@id``'ed schema"""

    @staticmethod
    def on_get(req: Any, resp: Any, schema_id: str) -> None:
        """Return the validated schema.

        Parameters
        ----------
        schema_id : str, in query
            ``@id`` of the target schema.
        clientVersion : str, in query

        Raises
        ------
        falcon.HTTPUnprocessableEntity
            If version of the client is not the most recent.
        falcon.HTTPNotFound
            If schema with the specified ``schema_id`` is not found.

        """
        client_version = req.get_param("clientVersion")
        server_client_version = get_config()["client_version"]
        if (
            client_version is not None
            and server_client_version is not None
            and client_version != server_client_version
        ):
            raise falcon.HTTPUnprocessableEntity(
                "Old client version",
                "Please refresh the browser page to update to the newest version of OpenEra.",
            )
        sdf_json = db.get_schema(schema_id, no_validate=True)
        resp.body = db.dumps_sdf(sdf_json)
        resp.downloadable_as = sdf_json["@id"].split("/")[-1] + ".json"
        resp.status = falcon.HTTP_200

    @staticmethod
    def on_delete(req: Any, resp: Any, schema_id: str) -> None:
        """Delete the validated schema.

        Parameters
        ----------
        schema_id : str, in query
            ``@id`` of the target schema.
        clientId : str, in query
            The unique id of the client.

        Raises
        ------
        falcon.HTTPNotFound
            If schema with the specified ``@id`` is not found.
        falcon.HTTPBadRequest
            If body parameters are missing
        falcon.HTTPConflict
            If the schema is not locked by the requesting client

        """
        if req.content_length:
            req_json = json.load(req.stream)
        else:
            req_json = {}
        if (client_id := req_json.get("clientId", None)) is None:
            desc = "Schema edit requests must include the clientId."
            raise falcon.HTTPBadRequest('Missing "clientId" param', desc)
        with db.do_transaction() as txn:
            txn.delete_schema(schema_id, client_id)
        resp.status = falcon.HTTP_200

    @staticmethod
    def on_put(req: Any, resp: Any, schema_id: str) -> None:
        """Create or update a schema.

        Parameters
        ----------
        schema_id : str, in query
            ``@id`` of the target schema.
        overwrite : boolean, optional, in query
            Default: ``False``; whether or not overwrite an existing schema
        sdf : str, in JSON body
            Stringified JSON containing an `sdf.Document`
        clientId : str, in JSON body
            The unique id of the client

        Raises
        ------
        falcon.HTTPBadRequest
            If body parameters are missing;
            If ``sdf`` is not a valid `sdf.Document`
        falcon.HTTPConflict
            If the schema is not locked by the requesting client;
            If the schema already exists and ``overwrite`` is ``False``

        """
        should_overwrite = req.get_param_as_bool("overwrite")
        if req.content_length:
            req_json = json.load(req.stream)
        else:
            req_json = {}
        if not all(k in req_json for k in ("sdf", "clientId")):
            desc = "Schema edit requests must include the clientId and sdf keys."
            raise falcon.HTTPBadRequest('Param "clientId" missing', desc)
        client_id = str(req_json["clientId"])

        try:
            document = util.validate_type(sdf.Document, req_json["sdf"])
        except util.ValidationError as e:
            title = "Invalid SDF Document"
            raise falcon.HTTPBadRequest(title, e.args[0])
        already_exists = True
        try:
            db.get_schema(schema_id)
        except falcon.HTTPNotFound:
            already_exists = False
        if already_exists and not should_overwrite:
            desc = (
                "The schema already exists, and the overwrite flag was not set "
                f"for schema {db.describe_schema(document)}."
            )
            raise falcon.HTTPConflict("Schema already exists", desc)
        util.replace_kairos_prefix(sdf)
        with db.do_transaction() as txn:
            if already_exists:
                txn.write_schema(schema_id, document, client_id)
            else:
                txn.write_new_schema(document)
        if already_exists:
            resp.status = falcon.HTTP_200
        else:
            resp.status = falcon.HTTP_201


class SchemaInstanceCopy:
    """Copy the specified schema."""

    @staticmethod
    def on_post(req: Any, resp: Any, schema_id: str) -> None:
        """Copy the specified schema.

        Parameters
        ----------
        schema_id : str, in query
            ``@id`` of the target schema.

        Returns
        -------
        None
            Response body in JSON:

            * ``schemaId``: the schema ``@id`` of the newly generated schema

        Raises
        ------
        falcon.HTTPNotFound
            If the specified schema does not exist

        """
        sdf_data = db.get_schema(schema_id)
        schema_name = util.get_schema_name(sdf_data["@id"])
        sdf_data["@id"] = cast(
            sdf.DocumentId, f"cmu:Schema/{uuid.uuid4()}/{schema_name}_copy"
        )
        with db.do_transaction() as txn:
            txn.write_new_schema(sdf_data)
        resp.body = json.dumps({"schemaId": sdf_data["@id"]})
        resp.status = falcon.HTTP_201


class QuarantineSummary:
    """Generate an HTML table summarizing the quarantine directory."""

    @staticmethod
    def on_get(req: Any, resp: Any) -> None:
        """Generate an HTML table summarizing the quarantine directory.

        Returns
        -------
        None
            Response body: HTML summary quarantined schemas.

        """

        def make_row(atId: str, note: str) -> str:
            escaped_id = atId.replace("/", "_FSLASH_")
            url = f"/api/schemas/{escaped_id}"
            last_modfied = datetime.datetime.fromtimestamp(0)
            return f"""
                <tr>
                    <td>{last_modfied}</td>
                    <td><a href={url}>{atId}</a></td>
                    <td>{note}</td>
                </tr>
            """

        rows = db.execute("SELECT atId, note FROM Schema WHERE quarantined=1")

        resp.content_type = falcon.MEDIA_HTML
        resp.body = f"""
            <h1>Quarantined Files</h1>
            <table>
                <tr>
                    <th>Last Modfied</th>
                    <th>File Name</th>
                    <th>Quarantine Reason</th>
                </tr>
                {"".join(make_row(*row) for row in rows)}
            </table>
        """


class SchemaTags:
    """Update the tags on the selected schema."""

    def on_patch(self, req: Any, resp: Any, schema_id: str) -> None:
        """Update the tags on the selected schema.

        Parameters
        ----------
        schema_id : str, in query
            ``@id`` of the target schema.
        tags : list[str], in JSON body
            New list of tags for the schema; overwrites existing tags

        Raises
        ------
        falcon.HTTPNotFound
            If specified schema is not found
        falcon.HTTPBadRequest
            If body parameters are missing

        """
        sdf_data = db.get_schema(schema_id)
        req_body = json.load(req.stream)
        if not ("tags" in req_body and "clientId" in req_body):
            desc = 'Request must include "tags" and "clientId" in the body.'
            raise falcon.HTTPBadGateway("Missing parameters", desc)
        tags = req_body["tags"]

        client_id = req_body["clientId"]
        private_data = sdf_data.get("privateData", {})
        private_data["eratosthenesTags"] = tags
        sdf_data["privateData"] = private_data
        with db.do_transaction() as txn:
            txn.write_schema(schema_id, sdf_data, client_id)
        resp.status = falcon.HTTP_200


class SchemaLock:
    """Manage locks on schemas to prevent multi-user editing."""

    @staticmethod
    def on_put(req: Any, resp: Any, schema_id: str, client_id: str) -> None:
        """Acquire or refresh a lock.

        Parameters
        ----------
        schema_id : str, in query
            ``@id`` of the target schema.
        client_id : str, in query

        Raises
        ------
        falcon.HTTPNotFound
            If the specified schema does not exist
        falcon.HTTPConflict
            If another client has a valid lock on the schema

        """
        with db.do_transaction() as txn:
            txn.set_lock(True, schema_id, client_id)
        resp.status = falcon.HTTP_CREATED

    @staticmethod
    def on_delete(req: Any, resp: Any, schema_id: str, client_id: str) -> None:
        """Release a lock explicitly.

        See `SchemaLock.on_put`.

        """
        with db.do_transaction() as txn:
            txn.set_lock(False, schema_id, client_id)


class Events:
    """Resource for event primitives."""

    def on_get(self, req: Any, resp: Any) -> None:
        """Get event primitives.

        Returns
        -------
        None
            Response body: JSON array of event primitives

        """
        body = db.get_event_primitives()
        resp.body = json.dumps(body)
        resp.status = falcon.HTTP_200


class Wikidata:
    """Resource for Wikidata queries."""

    def on_get(self, req: Any, resp: Any, item_id: str) -> None:
        """Get a summary of the specified Wikidata item.

        Parameters
        ----------
        item_id: str, in query
            QNode for Wikidata item

        Returns
        -------
        None
            Response body: JSON data from Wikidata

        Raises
        ------
        falcon.HTTPServiceUnavailable
            If unable to connect to Wikidata server

        """
        try:
            result = db.get_wikidata_values(item_id)
        except requests.exceptions.ConnectionError as e:
            msg = "Could not connect to WikiData"
            raise falcon.HTTPServiceUnavailable(title=msg, description=msg) from e
        resp.body = json.dumps({"label": result[0], "description": result[1]})


class PackageSchemas:
    """Package multiple schemas into a schema library."""

    def on_post(self, req: Any, resp: Any) -> None:
        """Package multiple schemas into one, submittable JSON file.

        Parameters
        ----------
        name : str, in JSON body
            Name for the new schema library.
        schemIds : list[str], in JSON body
            ``@id``'s of the schemas to be included in the library.

        Returns
        -------
        None
            Response body: JSON, SDF schema library

        """
        req_json = json.load(req.stream)
        try:
            resp.body = json.dumps(
                db.package_schemas(req_json["name"], req_json["schemaIds"])
            )
        except Exception as e:
            import traceback

            raise falcon.HTTPInternalServerError(
                "Error while packaging schemas",
                traceback.format_exc(),
            ) from e


class ZipSchemas:
    """ZIP together multiple schemas for easy download."""

    def on_post(self, req: Any, resp: Any) -> None:
        """ZIP together multiple schemas.

        Parameters
        ----------
        schemIds : list[str], in JSON body
            ``@id``'s of the schemas to be included in the ZIP archive.

        Returns
        -------
        None
            Response body: binary (ZIP), ZIPped schemas

        """
        req_json = json.load(req.stream)
        resp.content_type = "application/zip"
        resp.body = db.zip_schemas(req_json["schemaIds"]).getvalue()


def connector_sink(req: Any, resp: Any) -> None:
    kpc_url = f"http://{os.environ['CONNECTOR_HOST']}/"
    forward_path = "/".join(req.path.split("/")[3:])
    headers = {k: v for k, v in req.headers.items() if k.lower() in ["content-type"]}
    up_resp = requests.request(
        req.method, kpc_url + forward_path, headers=headers, data=req.stream.read()
    )

    if forward_path == "jobs" and req.method == "GET" and up_resp.ok:
        db.update_induced_schemas(up_resp.json())

    resp.body = up_resp.text
    resp.status = falcon.get_http_status(up_resp.status_code)
    for k, v in up_resp.headers.items():
        resp.set_header(k, v)
