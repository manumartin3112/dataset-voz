"""Genera un único archivo para el editor web de Supabase, sin imports locales."""
from pathlib import Path
root = Path(__file__).resolve().parents[1]
source = root / "supabase/functions/collect-voice"
validation = (source / "validate.mjs").read_text(encoding="utf-8")
handler = (source / "index.ts").read_text(encoding="utf-8")
expected = "import { validateMetadata, validateWav, sha256 } from './validate.mjs';"
if handler.splitlines()[0] != expected:
    raise SystemExit("Ha cambiado el import: revisar el generador antes de desplegar")
output = root / "deployment/collect-voice/index.ts"
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text("// GENERADO por scripts/build_dashboard.py. No editar directamente.\n" + validation + "\n" + handler.split("\n", 1)[1], encoding="utf-8")
print(output)
