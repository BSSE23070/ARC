"""Writes the OpenAPI spec to a file so the app's typed client can be generated.

Usage:  python -m arc.export_openapi ../packages/api-client/openapi.json
"""

import json
import sys
from pathlib import Path

from arc.core.config import Settings
from arc.main import create_app


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit("usage: python -m arc.export_openapi <output.json>")
    # No connection is opened: building the spec only needs the route table.
    app = create_app(Settings(env="dev"))
    spec = app.openapi()
    Path(sys.argv[1]).write_text(json.dumps(spec, indent=2, sort_keys=True) + "\n")


if __name__ == "__main__":
    main()
