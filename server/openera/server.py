"""The entrypoint for the server"""
import falcon

from . import resources
from . import util
from . import db

api_dict = {
    "primitives": {
        "events": resources.Events(),
    },
    "schemas": {
        "": resources.Schemas(),
        "{schema_id:uri}": {
            "": resources.SchemaInstance(),
            "tags": resources.SchemaTags(),
            "copy": resources.SchemaInstanceCopy(),
            "lock/{client_id}": resources.SchemaLock(),
        },
    },
    "package": resources.PackageSchemas(),
    "zip": resources.ZipSchemas(),
    "wikidata/{item_id}": resources.Wikidata(),
    "quarantine": resources.QuarantineSummary(),
}
"""Declares the structure of the API

See `util.create_api` for details.

"""

app = falcon.API(middleware=[util.CORSComponent()])
"""This variable must be defined as a module-level variable"""
app.router_options.converters["uri"] = util.UriConverter
util.create_api(app, "/api", api_dict)
