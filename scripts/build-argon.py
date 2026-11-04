#!/usr/bin/env python3
"""Deterministically assemble the provided Argon sources into an isolated dashboard companion."""
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'vendor/argon'
def read(p): return (SRC / p).read_text()
modules = ['30-i18n.js','40-core.js','50-tools.js','60-brain.js','70-voice.js','80-music.js','90-scene.js','95-shell.js','99-muze-bridge.js']
csp = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'"
css = read('build/fonts-inline.css') + read('build/01-app.css') + '\n#argon-frame{inset:0!important;width:100%!important;height:100%!important;border-radius:0!important}#argon-chrome,.resize-handle,.emo{display:none!important}#stage-title{display:none!important}'
body = read('build/20-body.html')
js = '\n'.join(read('build/'+m) for m in modules)
html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="'+csp+'"><title>MuZe · Dashboard companion</title><style>'+css+'</style></head><body>'+body+'<script>'+read('vendor/three.min.js')+'</script><script>'+js+'</script></body></html>'
for legacy in ('Argon', 'ARGON', 'आर्गन', 'ஆர்கன்', 'أرجون'):
    if legacy == 'ARGON':
        html = html.replace("'ARGON'", "'MuZe'").replace('"ARGON"', '"MuZe"').replace('>ARGON<', '>MuZe<')
    else:
        html = html.replace(legacy, 'MuZe')
out = ROOT / 'public/companion/argon.html'; out.parent.mkdir(parents=True,exist_ok=True); out.write_text(html)
print(f'Argon dashboard companion: {len(html.encode())} bytes')
