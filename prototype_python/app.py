from contextlib import contextmanager
import hashlib
import io
import json
import os
import re
import secrets
import sqlite3
import wave
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from flask import Flask, request, jsonify, send_file, send_from_directory

ROOT = Path(__file__).resolve().parent

def create_app(storage=None):
    app = Flask(__name__, static_folder=None)
    app.config['MAX_CONTENT_LENGTH'] = 8 * 1024 * 1024
    folder = Path(storage or os.environ.get('VOICE_DATA_DIR', ROOT / 'data')).resolve()
    folder.mkdir(parents=True, exist_ok=True)
    db_path = folder / 'records.sqlite3'
    @contextmanager
    def database():
        connection = sqlite3.connect(db_path)
        try:
            with connection:
                yield connection
        finally:
            connection.close()
    with database() as db:
        db.execute('CREATE TABLE IF NOT EXISTS takes (id TEXT PRIMARY KEY, digest TEXT NOT NULL, metadata TEXT NOT NULL, audio BLOB NOT NULL)')
    def authorized(env):
        expected = os.environ.get(env, '')
        actual = request.headers.get('Authorization', '').removeprefix('Bearer ')
        return bool(expected) and secrets.compare_digest(expected, actual)
    @app.get('/health')
    def health(): return jsonify(status='ok', version='0.1.0')
    @app.get('/')
    def index():
        return send_from_directory(ROOT, 'index.html')
    @app.get('/<name>')
    def asset(name):
        if name not in ('app.js', 'recorder.js'): return jsonify(error='No encontrado'), 404
        return send_from_directory(ROOT, name)
    @app.errorhandler(413)
    def too_large(error): return jsonify(error='Archivo demasiado grande'), 413
    @app.post('/api/takes')
    def upload():
        if not authorized('VOICE_UPLOAD_TOKEN'): return jsonify(error='CÃ³digo de acceso incorrecto'), 403
        try:
            meta = json.loads(request.form['metadata'])
            if not isinstance(meta, dict): raise ValueError('Metadatos inválidos')
            required = ('id','participant','session','device','conditions','phrase_id','recorded_at','session_date')
            if any(not isinstance(meta.get(k), str) or not meta[k].strip() or len(meta[k]) > 200 for k in required):
                raise ValueError('Completa los datos de la sesiÃ³n')
            for key in ('id','participant','session'):
                if not re.fullmatch(r'[A-Za-z0-9_-]{3,80}', meta[key]): raise ValueError('CÃ³digo o identificador invÃ¡lido')
            if meta['phrase_id'] not in ('a','b') or type(meta.get('take')) is not int or meta['take'] not in (1,2): raise ValueError('Toma invÃ¡lida')
            if meta.get('consent') is not True: raise ValueError('Debes aceptar el uso de las grabaciones')
            datetime.fromisoformat(meta['recorded_at'].replace('Z','+00:00'))
            datetime.strptime(meta['session_date'], '%Y-%m-%d')
            raw = request.files['audio'].read()
            with wave.open(io.BytesIO(raw)) as wav:
                rate, frames = wav.getframerate(), wav.getnframes()
                if wav.getnchannels()!=1 or wav.getsampwidth()!=2 or wav.getcomptype()!='NONE' or rate not in (16000,22050,24000,32000,44100,48000,96000): raise ValueError('Se requiere WAV PCM mono de 16 bits')
                pcm=wav.readframes(frames)
                if len(pcm)!=frames*2: raise ValueError('WAV incompleto')
                duration=frames/rate
                if not 8 <= duration <= 30: raise ValueError('Graba entre 8 y 30 segundos por toma')
            # Only explicitly supported fields become persisted metadata.
            meta={k:meta[k] for k in (*required,'take','consent')}
            digest=hashlib.sha256(raw).hexdigest()
            with database() as db:
                db.execute('BEGIN IMMEDIATE')
                existing=db.execute('SELECT digest,metadata FROM takes WHERE id=?',(meta['id'],)).fetchone()
                if existing:
                    old=json.loads(existing[1])
                    if existing[0]!=digest or any(old[k]!=v for k,v in meta.items()): return jsonify(error='Identificador ya utilizado por otra toma'),409
                    return jsonify(id=meta['id'],saved=True,repeated=True)
                siblings = db.execute('SELECT metadata FROM takes').fetchall()
                for (encoded,) in siblings:
                    sibling = json.loads(encoded)
                    if sibling['session'] == meta['session']:
                        if any(sibling[k] != meta[k] for k in ('participant','device','conditions','session_date')):
                            return jsonify(error='Los datos de esta sesión no coinciden'),409
                        if (sibling['phrase_id'], sibling['take']) == (meta['phrase_id'], meta['take']):
                            return jsonify(error='Esta toma ya está guardada en la sesión'),409
                limit = int(os.environ.get('VOICE_MAX_TAKES','2000'))
                if len(siblings) >= limit: return jsonify(error='Recogida completa; contacta con el organizador'),503
                meta.update(protocol_version='1', seconds=duration,sample_rate=rate,sha256=digest,received_at=datetime.now(timezone.utc).isoformat(),consent_version='1')
                db.execute('INSERT INTO takes VALUES (?,?,?,?)',(meta['id'],digest,json.dumps(meta,ensure_ascii=False),raw))
            return jsonify(id=meta['id'],saved=True),201
        except (ValueError,KeyError,wave.Error,EOFError):
            return jsonify(error='Datos o audio invÃ¡lidos. Revisa los campos y graba entre 8 y 30 segundos.'),400
    @app.get('/api/export')
    def export():
        if not authorized('VOICE_ADMIN_TOKEN'): return jsonify(error='Acceso privado'),403
        out=io.BytesIO()
        with database() as db, zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as archive:
            manifest=[]
            for ident,metadata,audio in db.execute('SELECT id,metadata,audio FROM takes ORDER BY id'):
                item=json.loads(metadata);item['file']='audio/'+ident+'.wav'
                archive.writestr(item['file'],audio);manifest.append(item)
            archive.writestr('manifest.json',json.dumps(manifest,ensure_ascii=False,indent=2))
        out.seek(0)
        response=send_file(out,mimetype='application/zip',as_attachment=True,download_name='voces.zip')
        response.headers['Cache-Control']='no-store'
        return response
    return app

if __name__ == '__main__':
    from waitress import serve
    for name in ('VOICE_UPLOAD_TOKEN','VOICE_ADMIN_TOKEN'):
        if len(os.environ.get(name,''))<24: raise SystemExit(name+' debe tener al menos 24 caracteres')
    if os.environ['VOICE_UPLOAD_TOKEN']==os.environ['VOICE_ADMIN_TOKEN']: raise SystemExit('Usa claves distintas')
    serve(create_app(),host=os.environ.get('HOST','127.0.0.1'),port=int(os.environ.get('PORT','8767')))
