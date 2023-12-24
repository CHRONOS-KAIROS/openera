"""Interface for the global configuration options."""
import functools
import logging
import os
from pathlib import Path
from typing import Optional
from typing_extensions import TypedDict

logging.basicConfig(format="%(levelname)s: %(msg)s")


class Config(TypedDict):
    """Python types for global config"""

    context_file: str
    db_path: Path
    sdf_config_path: Path
    version_string: str
    client_version: Optional[str]
    mode: Optional[str]


@functools.cache
def get_config() -> Config:
    """Return the project-level JSON config file.

    Convert to values to appropriate Python types as need be.

    Raises
    ------
    FileNotFoundError
        Raised if the config file cannot be found

    """
    era_mode = os.environ.get("ERA_MODE", None)
    if era_mode == "dev":
        client_version = None
    else:
        try:
            with open("client-version") as fo:
                client_version = fo.read().rstrip()
        except FileNotFoundError as e:
            logging.error('Could not find "client-version" file.')
            raise e
    return {
        "context_file": "kairos-context-v2.3.jsonld",
        "db_path": Path("./fsdb"),
        "sdf_config_path": Path("./sdf-config"),
        "version_string": "cmu:HumanCuration",
        "client_version": client_version,
        "mode": era_mode,
    }
