"""Miscellaneous functions and components"""
from __future__ import annotations

from typing import (
    Any,
    Callable,
    Container,
    ForwardRef,
    Hashable,
    Mapping,
    MutableMapping,
    Optional,
    Text,
    Tuple,
    Type,
    TypeVar,
    Union,
    cast,
)
from collections.abc import Iterator, MutableMapping
from pathlib import Path
import base64
import json
import re
import uuid
import functools

from requests.adapters import HTTPAdapter
import requests
import falcon
import pydantic

from . import sdf
from . import util
from .config import get_config


_T = TypeVar("_T")


class TimeoutHTTPAdapter(HTTPAdapter):
    """Adapter with a default timeout"""

    def __init__(self) -> None:
        self.timeout = 3
        super().__init__()

    def send(
        self,
        request: requests.PreparedRequest,
        stream: bool = False,
        timeout: Union[None, float, Tuple[float, float], Tuple[float, None]] = None,
        verify: Union[bool, str] = True,
        cert: Union[
            None, bytes, str, Tuple[Union[bytes, str], Union[bytes, str]]
        ] = None,
        proxies: Optional[Mapping[str, str]] = None,
    ) -> requests.Response:
        if timeout is None:
            timeout = self.timeout
        return super().send(
            request,
            stream=stream,
            timeout=timeout,
            verify=verify,
            cert=cert,
            proxies=proxies,
        )


class CORSComponent:
    """Attach appropriate CORS headers"""

    def process_response(
        self, req: Any, resp: Any, resource: Any, req_succeeded: Any
    ) -> None:
        resp.set_header("Access-Control-Allow-Origin", "*")

        if (
            req_succeeded
            and req.method == "OPTIONS"
            and req.get_header("Access-Control-Request-Method")
        ):
            allow = resp.get_header("Allow")
            resp.delete_header("Allow")

            allow_headers = req.get_header(
                "Access-Control-Request-Headers", default="*"
            )

            resp.set_headers(
                (
                    ("Access-Control-Allow-Methods", allow),
                    ("Access-Control-Allow-Headers", allow_headers),
                    ("Access-Control-Max-Age", "86400"),
                )
            )


class UriConverter(falcon.routing.converters.BaseConverter):  # type: ignore
    """Convert escaped forward slashes back to forward slashes."""

    @staticmethod
    def convert(value: str) -> str:
        return value.replace("_FSLASH_", "/")


def create_api(app: Any, base_route: str, api_dict: dict[str, Any]) -> None:
    """Register resources given by a dictionary on the server instance.

    Notes
    -----
    We discuss the type of `api_dict` here. It would be defined with a type
    annotation, but mypy cannot yet handle recursive types, so there is no way
    to do so. The ``dict`` has a key type of ``str`` and can have values of
    three different types:

    1. Another `api_dict`
    2. A resource class
    3. A path which will be statically served by falcon

    The keys represent path segments. Nested dictionaries will automatically
    split the path segments with ``/``'s. ``""`` and ``"/"`` can both be used
    as keys to refer to the top-level route within that dictionary. Both are
    needed in the case of statically serving a directory which also has its own
    top-level resource.

    """
    for k, v in api_dict.items():
        route = f"{base_route}/{k}".rstrip("/")
        if isinstance(v, dict):
            create_api(app, route, v)
        else:
            app.add_route(route, v)


session = requests.Session()
adapter = TimeoutHTTPAdapter()
session.mount("https://", adapter)
session.mount("http://", adapter)


_full_sdf_context: dict[str, Any] | None = None


def get_sdf_context() -> dict[str, Any]:
    global _full_sdf_context
    if _full_sdf_context is None:
        with (get_config()["sdf_config_path"] / get_config()["context_file"]).open(
            "r"
        ) as fo:
            _full_sdf_context = json.load(fo)
    return _full_sdf_context


class PydanticConfig:
    extra = "forbid"


T = TypeVar("T")


class ValidationError(ValueError):
    pass


@functools.cache
def _get_model(t: Type[T]) -> Type[pydantic.BaseModel]:
    return pydantic.create_model_from_typeddict(t, __config__=PydanticConfig)


def validate_type(t: Type[T], data: dict[str, Any]) -> T:
    """Validate type with Pydantic."""
    model = _get_model(cast(Hashable, t))
    try:
        model(**data)
    except pydantic.ValidationError as e:
        err2str = lambda e: f"- {'.'.join(str(x) for x in e['loc'])}: {e['msg']}"
        msg = "\n".join(err2str(x) for x in e.errors())
        raise ValidationError(msg) from e
    return cast(T, data)


def replace_kairos_prefix(j: object) -> None:
    """Replace the expanded kairos prefix with the abbreviated one.

    Notes
    -----
    Given the JSON-LD @context, ``https://kairos-sdf...`` is equivalent to
    ``kairos:``. It is more idiomatic to use the latter, so replace any
    occurrences of the former with it.

    """
    kairos_prefix = get_sdf_context()["@context"]["kairos"]

    def replace(s: object) -> object:
        return s.replace(kairos_prefix, "kairos:") if isinstance(s, str) else s

    map_over_dict(j, replace, [str])


def map_over_dict(
    x: object, f: Callable[[object], object], accepted_types: list[type]
) -> object:
    """Map a function over a primitive, dictionary, or list."""
    if any(isinstance(x, t) for t in accepted_types):
        return f(x)
    if isinstance(x, (dict, list)):
        if isinstance(x, dict):
            items = iter(x.items())
        else:
            items = enumerate(x)
        for k, v in items:
            cast(MutableMapping["str | int", object], x)[k] = map_over_dict(
                v, f, accepted_types
            )
    return x


def extract_sdf_version(context_file_name: str) -> str:
    """Extract the SDF version from the context filename.

    This avoids having to make a remote request to get the version but trusts
    that the file is named in a certain way (which we have control over).

    Raises
    ------
    ValueError
        If the regex does not match against the SDF context file name

    """
    sdf_ver_match = re.search(r"-v(.+)\.jsonld", context_file_name)
    if sdf_ver_match is not None and len(sdf_ver_match.groups()) > 0:
        return sdf_ver_match.groups()[0]
    raise ValueError("Could not parse SDF context file path.")


def get_schema_name(atId: str) -> str:
    return atId.split("/")[-1]


def ensure_list(x: _T | list[_T]) -> list[_T]:
    if not isinstance(x, list):
        return [x]
    return x


WIKIDATA_URL = "https://www.wikidata.org/w/api.php"

_wd_cache: Any = {}


def get_wikidata_item(wd_node: str) -> requests.Response:
    """Get metadata for QNode from Wikidata."""
    params = {
        "ids": wd_node,
        "action": "wbgetentities",
        "props": "labels|descriptions",
        "languages": "en",
        "format": "json",
    }
    return session.get(WIKIDATA_URL, params=params, timeout=0.5)


def recursive_remove(
    obj: sdf.Document | dict[str, object] | list[Any], to_remove: set[str]
) -> None:
    """Remove specified keys in place in a possibly nested dict."""
    if isinstance(obj, dict):
        keys: Iterator[str | int] = iter(obj.keys())
    elif isinstance(obj, list):
        keys = iter(range(len(obj)))
    else:
        raise ValueError()

    _obj = cast(MutableMapping["str | int", object], obj)
    to_del = []
    for k in keys:
        if k in to_remove:
            to_del.append(k)
        elif isinstance(_obj[k], (list, dict)):
            v = cast("dict[str, object] | list[object]", _obj[k])
            recursive_remove(v, to_remove)
    # Just in case we are editing a list, don't let deletion mess up the indexing
    for k in reversed(to_del):
        del _obj[k]


def collect_ids(obj: object) -> list[str]:
    """Extract all JSON-LD @id fields in an SDF file."""
    ids = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k == "@id":
                ids.append(cast(str, v))
            ids += collect_ids(v)
    elif isinstance(obj, list):
        for item in obj:
            ids += collect_ids(item)
    return ids


def sub_id(obj: object, target: str, replacement: str) -> None:
    """Replace @id references in non-@id fields."""
    if isinstance(obj, dict):
        keys = list(obj.keys())
    elif isinstance(obj, list):
        keys = list(range(len(obj)))
    else:
        raise ValueError()
    for k in keys:
        _obj = cast("MutableMapping[str | int, object]", obj)
        if k != "@id" and _obj[k] == target:
            _obj[k] = replacement
        elif isinstance(_obj[k], (list, dict)):
            sub_id(_obj[k], target, replacement)


def ensure_unique_ids(top_level_obj: object, obj: object, all_ids: set[str]) -> None:
    """Ensure that there are no duplicate JSON-LD @id's."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k == "@id":
                new_v = ensure_valid_cmu_id(all_ids, v)
                obj[k] = new_v
                sub_id(top_level_obj, v, new_v)
            ensure_unique_ids(top_level_obj, v, all_ids)
    elif isinstance(obj, list):
        for item in obj:
            ensure_unique_ids(top_level_obj, item, all_ids)


# https://www.w3.org/Addressing/URL/5_URI_BNF.html
# http://sparql.org/iri-validator.html

ACCEPTABLE_CHARS = "-a-zA-Z0-9$_@.&!*\"'|,%"
CMU_ID_REGEX = re.compile(f"^cmu:[{ACCEPTABLE_CHARS}/]*[{ACCEPTABLE_CHARS}]$")

FILLER_CHAR = "$"


def ensure_valid_cmu_id(all_ids: set[str], s: str) -> str:
    """Ensure that @id's are both valid IRI's and have a CMU prefix."""
    if not is_valid_cmu_id(s):
        if s[-1] == "/":
            s += FILLER_CHAR
        if s[:4] != "cmu:":
            s = "cmu:" + s
        s = "cmu:" + re.sub(f"[^{ACCEPTABLE_CHARS}/]", FILLER_CHAR, s[4:])

    i = 1
    suffix = ""
    while s + suffix in all_ids:
        suffix = f"_{i}"
        i += 1

    new_s = s + suffix
    all_ids.add(new_s)
    return new_s


def fix_atIds(lib: sdf.Document, use_uuids: bool = False) -> None:
    """Replace @id's with official @id format."""
    counter = 0

    def fix_for_ke_type(ke_type: str, instances: list[Any]) -> None:
        nonlocal counter
        for x in instances:
            if ke_type == "Participants":
                # Suggestion: Add event name
                name = x["entity"].split("/")[-1]
            elif ke_type == "Relations":
                name = x["wd_label"].replace(" ", "_")
            else:
                name = x["name"].replace(" ", "_")
            old_atId = x["@id"]
            if use_uuids:
                x["@id"] = str(uuid.uuid4())
            else:
                x["@id"] = f"cmu:{ke_type}/{counter:05d}/{name}"
            sub_id(lib, old_atId, x["@id"])
            counter += 1

    fix_for_ke_type("Entities", ensure_list(lib["entities"]))
    fix_for_ke_type("Events", ensure_list(lib["events"]))
    fix_for_ke_type("Relations", ensure_list(lib.get("relations", [])))
    fix_for_ke_type("Instances", ensure_list(lib.get("instances", [])))

    participants = [
        participant
        for event in ensure_list(lib["events"])
        if "participants" in event
        for participant in event["participants"]
    ]
    fix_for_ke_type("Participants", participants)


def is_valid_cmu_id(s: str) -> bool:
    return bool(CMU_ID_REGEX.match(s))
