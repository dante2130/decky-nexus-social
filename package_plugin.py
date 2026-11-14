"""Build a Decky local-install ZIP from the frontend and vendored dependency."""
from argparse import ArgumentParser
from pathlib import Path
from subprocess import check_output
from zipfile import ZIP_DEFLATED, ZipFile

parser = ArgumentParser()
parser.add_argument("--backend", type=Path, help="Optional updated Linux x86-64 xodus-cli to bundle")
parser.add_argument("--backend-source", type=Path, help="Source checkout for the bundled xodus-cli")
args = parser.parse_args()
if args.backend is not None and not args.backend.is_file():
    parser.error("--backend must point to a built xodus-cli binary")

if (args.backend is None) != (args.backend_source is None):
    parser.error("--backend and --backend-source must be supplied together")

root = Path(__file__).resolve().parent
vendor = root / "vendor"
if not (root / "dist/index.js").is_file() or not (vendor / "websockets/__init__.py").is_file():
    raise SystemExit("Build the frontend and install requirements into vendor first.")

with ZipFile(root / "NexusSocial.zip", "w", ZIP_DEFLATED) as archive:
    for name in ("plugin.json", "package.json", "main.py", "LICENSE", "README.md", "dist/index.js"):
        archive.write(root / name, f"NexusSocial/{name}")
    if args.backend is not None:
        archive.write(args.backend, "NexusSocial/bin/xodus-cli")
        files = check_output(["git", "ls-files", "-z"], cwd=args.backend_source).decode().split("\0")
        for name in files:
            source = args.backend_source / name
            if name and source.is_file():
                archive.write(source, f"NexusSocial/backend-source/{name}")
    for path in sorted(vendor.rglob("*")):
        relative = path.relative_to(vendor)
        # Websockets has a pure Python implementation. Decky bundles its own Python.
        if path.is_file() and relative.parts[0] != "bin" and "__pycache__" not in relative.parts and path.suffix not in {".so", ".pyd", ".pyc"}:
            archive.write(path, f"NexusSocial/{path.relative_to(root).as_posix()}")
