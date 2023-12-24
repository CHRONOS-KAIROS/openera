import os
from pathlib import Path

import pytest

from openera import config


def test_config_dev(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ERA_MODE", "dev")
    config.get_config.__wrapped__()


client_ver_path = Path("client-version")


def test_config_prod(monkeypatch: pytest.MonkeyPatch) -> None:
    client_ver_path.exists()
    monkeypatch.setenv("ERA_MODE", "")
    file_exists_already = client_ver_path.exists()

    if not file_exists_already:
        print("here")
        client_ver_path.write_text("version/string")

    client_ver_string = client_ver_path.read_text()

    cfg = config.get_config.__wrapped__()

    if not file_exists_already:
        client_ver_path.unlink()

    assert cfg["client_version"] == client_ver_string


def test_config_prod_file_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ERA_MODE", "")
    if client_ver_path.exists():
        pytest.skip(f"File {client_ver_path} already exists; cannot test its absence.")

    with pytest.raises(FileNotFoundError):
        config.get_config.__wrapped__()
