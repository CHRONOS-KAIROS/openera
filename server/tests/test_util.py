from typing import Any, TypedDict

import pytest
import falcon

from openera import util


class TestEnsureList:
    def test_list(self) -> None:
        # mypy complains without this explicit annotation
        x: int | list[int] = [1, 2, 3]
        assert x == util.ensure_list(x)

    def test_singleton(self) -> None:
        assert [2] == util.ensure_list(2)

    def test_none(self) -> None:
        assert [None] == util.ensure_list(None)

    def test_tuple(self) -> None:
        x = (1, 2)
        assert [x] == util.ensure_list(x)


class TestUriConverter:
    def test_normal(self) -> None:
        x = "normal string"
        assert x == util.UriConverter.convert(x)

    def test_forward_slash(self) -> None:
        x = "string/with/slashes "
        assert x == util.UriConverter.convert(x)

    def test_escape(self) -> None:
        x = "x_FSLASH_y"
        assert "x/y" == util.UriConverter.convert(x)


class TestCreateApi:
    resource = object()

    def test_simple(self) -> None:
        app = falcon.API()
        spec = {
            "x": 2,
            "y": 3,
        }
        util.create_api(app, "/foo", spec)
        assert app._router.find("/foo/x")[0] == 2
        assert app._router.find("/foo/y")[0] == 3

    def test_nested(self) -> None:
        app = falcon.API()
        spec = {
            "x": {
                "y": 3,
            },
        }
        util.create_api(app, "/foo", spec)
        assert app._router.find("/foo/x/y")[0] == 3

    def test_empty(self) -> None:
        app = falcon.API()
        spec = {
            "x": {
                "": 3,
            },
        }
        util.create_api(app, "/foo", spec)
        assert app._router.find("/foo/x")[0] == 3


def test_get_sdf_context() -> None:
    x = util.get_sdf_context()
    assert isinstance(x, dict)


class SampleType2(TypedDict):
    mu: float


class SampleType(TypedDict):
    a: int
    b: str
    st2: SampleType2


class TestValidateType:
    def test_valid(self) -> None:
        x = {"a": 2, "b": "rute", "st2": {"mu": 0.5}}
        assert x == util.validate_type(SampleType, x)

    def test_invalid(self) -> None:
        x = {"a": "not int", "b": "rute", "st2": {"mu": 0.5}}
        with pytest.raises(util.ValidationError):
            util.validate_type(SampleType, x)


def test_replace_kairos_prefix() -> None:
    prefix = util.get_sdf_context()["@context"]["kairos"]
    x = {
        "a": f"{prefix}foo",
        "b": "kairos:bar",
        "c": 4,
        "d": None,
    }
    y = {
        **x,
        "a": "kairos:foo",
    }
    util.replace_kairos_prefix(x)
    assert x == y


class TestMapOverDict:
    def test_singleton(self) -> None:
        f = lambda x: x + 1
        assert 2 == util.map_over_dict(1, f, [int])

    def test_dict(self) -> None:
        f = lambda x: x + 1
        x = {
            "a": 2,
            "b": 3,
        }
        y = {
            "a": 3,
            "b": 4,
        }
        assert y == util.map_over_dict(x, f, [int])

    def test_list(self) -> None:
        f = lambda x: x + 1
        x = [1, 2]
        y = [2, 3]
        assert y == util.map_over_dict(x, f, [int])

    def test_dict_nested(self) -> None:
        x = {
            "a": {"b": 1},
            "c": [2],
        }
        y = {
            "a": {"b": 2},
            "c": [3],
        }
        f = lambda x: x + 1
        assert y == util.map_over_dict(x, f, [int])

    def test_list_nested(self) -> None:
        x = [
            {"b": 1},
            [2],
        ]
        y = [
            {"b": 2},
            [3],
        ]
        f = lambda x: x + 1
        assert y == util.map_over_dict(x, f, [int])


class TestExtractSdfVersion:
    def test_simple(self) -> None:
        x = "foo-v1.2.jsonld"
        assert "1.2" == util.extract_sdf_version(x)

    def test_messy(self) -> None:
        xs = [
            ("-v1.2.jsonld", "1.2"),
            ("-v111.2222.jsonld", "111.2222"),
            ("owiejf-(-23.22320lkasj-a??{we.jsonld-v1.2.jsonld", "1.2"),
            ("kairos-context-v2.3.jsonld", "2.3"),
        ]
        for x, y in xs:
            assert y == util.extract_sdf_version(x)

    def test_invalid(self) -> None:
        xs = [
            "xyz-1.2.jsonld",
            "xyz-v1.2.json",
            "xyzv1.2.json",
        ]
        for x in xs:
            with pytest.raises(ValueError):
                util.extract_sdf_version(x)


def test_get_schema_name() -> None:
    x = "a/b/c/d"
    assert "d" == util.get_schema_name(x)
