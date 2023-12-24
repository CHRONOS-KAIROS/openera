"""Convert official ontology file into usable format."""
import sys
import csv
import json
from typing import Any

from . import db


def main() -> None:
    fn = sys.argv[1]
    with open(fn) as fo:
        reader = csv.reader(fo)
        header = next(reader)
        qnode_title = "Predicate (Event) Qnode"
        argument_title = "Predicate (Event) Arguments"
        qnode_idx = header.index(qnode_title)
        argument_idx = header.index(argument_title)
        items: dict[str, Any] = {}
        for row in reader:
            qlabel_node = row[qnode_idx].split("\n")[0].strip()
            if "?" in qlabel_node:
                continue
            args = row[argument_idx].split("\n")
            qlabel = "_".join(qlabel_node.split("_")[:-1])
            qnode = qlabel_node.split("_")[-1]
            key = f"FWD_{qnode}"
            if not args or key in items:
                continue
            items[key] = {
                "name": qlabel,
                "wd_qnode": qnode,
                "wd_description": db.get_wikidata_values(qnode)[1],
                "type": "event_type",
                "curated_by": "Sue Holm",
                "arguments": [
                    {
                        "name": arg.strip(),
                        "short_name": "_".join(arg.split("_")[:2]),
                        "constraints": [],
                    }
                    for arg in args
                ],
            }
    json.dump({"events": items}, sys.stdout, indent=2)


if __name__ == "__main__":
    main()
