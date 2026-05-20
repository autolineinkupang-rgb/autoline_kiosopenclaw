"""
event_emit.py — Helper untuk Python skills kirim event ke event-bus Node.js.
Tulis ke data/openclaw-events.json, di-drain otomatis oleh bus.
"""
import os, json, time

DATA_DIR   = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data')
EVENTS_FILE = os.path.join(DATA_DIR, 'openclaw-events.json')

def emit(nama, data=None):
    """Tambahkan 1 event ke antrian. Thread-safe via rename."""
    ev = {'nama': nama, 'data': data or {}, 'ts': int(time.time() * 1000)}
    try:
        try:
            with open(EVENTS_FILE, 'r', encoding='utf-8') as f:
                events = json.load(f)
        except Exception:
            events = []
        events.append(ev)
        tmp = EVENTS_FILE + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(events, f, ensure_ascii=False)
        os.replace(tmp, EVENTS_FILE)
    except Exception:
        pass
