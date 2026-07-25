"""Build the non-destructive So Stylized UE 5.2 compatibility level."""

import gc
import json
import os
import sys

import unreal


SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

from so_stylized_reference_compatibility import (
    ensure_reference_level,
    prepare_reference_level,
)


if os.environ.get("TOONLAB_REFERENCE_DUPLICATE_ONLY", "0") == "1":
    report = ensure_reference_level()
else:
    report = prepare_reference_level()
unreal.log("TOONLAB_REFERENCE_LEVEL {}".format(json.dumps(report, sort_keys=True)))
report = None
gc.collect()
