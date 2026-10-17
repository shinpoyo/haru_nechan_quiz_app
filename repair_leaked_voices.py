# -*- coding: utf-8 -*-
"""
リーク音声（指示文読み上げ・末尾ノイズ）の自動修復スクリプト
Gemini 3.8 Flash で正確なタイムスタンプ（指示文終了〜本編セリフ〜末尾ノイズ開始）を検出し、
波形のゼロクロス・最小エネルギー無音点で正確にトリムしてセリフ本編のみに修復します。
"""

import base64
import json
import os
import re
import struct
import sys
import time
import wave
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests
from dotenv import load_dotenv

load_dotenv(Path.home() / ".env")
load_dotenv(".env")
API_KEY = os.environ.get("GEMINI_API_KEY", "").strip()

OUT_DIR = Path("assets/voices_aoede")
BACKUP_DIR = Path("assets/voices_backup_leaked")
BACKUP_DIR.mkdir(parents=True, exist_ok=True)

URL = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key={API_KEY}"

def get_timestamps(file_path: Path):
    data = base64.b64encode(file_path.read_bytes()).decode("utf-8")
    payload = {
        "contents": [{
            "parts": [
                {"inlineData": {"mimeType": "audio/wav", "data": data}},
                {
                    "text": (
                        "この音声について以下の秒数をJSON形式で返してください。\n"
                        "{\n"
                        '  "instruction_end_sec": 指示文「明るく愛嬌〜読んでください」が終わる秒数（float）,\n'
                        '  "speech_start_sec": 本編セリフが始まる秒数（float）,\n'
                        '  "speech_end_sec": 本編セリフが終わる秒数（float）\n'
                        "}\n"
                        "JSONのみを出力してください。"
                    )
                }
            ]
        }],
        "generationConfig": {
            "responseMimeType": "application/json"
        }
    }
    
    for attempt in range(3):
        try:
            r = requests.post(URL, json=payload, timeout=30)
            if r.status_code == 200:
                txt = r.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
                res = json.loads(txt)
                return float(res["speech_start_sec"]), float(res["speech_end_sec"])
            elif r.status_code == 429:
                time.sleep(2.0 * (attempt + 1))
            else:
                time.sleep(1.0)
        except Exception as e:
            time.sleep(1.5)
    return None, None

def trim_audio(file_path: Path, start_sec: float, end_sec: float):
    with wave.open(str(file_path), "rb") as w:
        params = w.getparams()
        n_frames = w.getnframes()
        rate = w.getframerate()
        raw = w.readframes(n_frames)

    samples = struct.unpack(f"<{n_frames}h", raw)

    # Search for silence near start_sec (±0.4s window)
    s_min = max(0, int(rate * (start_sec - 0.5)))
    s_max = min(n_frames, int(rate * (start_sec + 0.2)))
    window = int(rate * 0.05) # 50ms window
    best_start = s_min
    min_energy = float("inf")
    for i in range(s_min, s_max, 50):
        chunk = samples[i:i+window]
        energy = sum(abs(s) for s in chunk)
        if energy < min_energy:
            min_energy = energy
            best_start = i + window // 2

    # Search for silence near end_sec (±0.4s window)
    e_min = max(best_start + int(rate * 1.0), int(rate * (end_sec - 0.2)))
    e_max = min(n_frames - window, int(rate * (end_sec + 0.5)))
    best_end = min(n_frames, int(rate * end_sec))
    min_end_energy = float("inf")
    for i in range(e_min, e_max, 50):
        chunk = samples[i:i+window]
        energy = sum(abs(s) for s in chunk)
        if energy < min_end_energy:
            min_end_energy = energy
            best_end = i + window // 2

    trimmed = samples[best_start:best_end]
    # Apply subtle 30ms fade-in and 50ms fade-out to completely prevent clicks
    fade_in_len = min(len(trimmed), int(rate * 0.03))
    fade_out_len = min(len(trimmed), int(rate * 0.05))
    trimmed_list = list(trimmed)
    for j in range(fade_in_len):
        trimmed_list[j] = int(trimmed_list[j] * (j / fade_in_len))
    for j in range(fade_out_len):
        trimmed_list[-1 - j] = int(trimmed_list[-1 - j] * (j / fade_out_len))

    out_raw = struct.pack(f"<{len(trimmed_list)}h", *trimmed_list)
    with wave.open(str(file_path), "wb") as w:
        w.setparams((params.nchannels, params.sampwidth, params.framerate, len(trimmed_list), params.comptype, params.compname))
        w.writeframes(out_raw)

    return len(trimmed_list) / float(rate)

def process_one(filename: str):
    p = OUT_DIR / filename
    if not p.exists():
        return filename, False, "Not found"
    
    # Backup original leaked file
    backup_p = BACKUP_DIR / filename
    if not backup_p.exists():
        backup_p.write_bytes(p.read_bytes())

    start_sec, end_sec = get_timestamps(backup_p)
    if start_sec is None or end_sec is None:
        return filename, False, "Failed to get timestamps"

    dur = trim_audio(p, start_sec, end_sec)
    return filename, True, f"Trimmed to {dur:.2f}s (cut from {start_sec:.2f}s to {end_sec:.2f}s)"

def main():
    report_file = Path("voice_leak_scan_result.json")
    if not report_file.exists():
        print("Run voice_leak_scan_result.json scan first.")
        return

    data = json.loads(report_file.read_text(encoding="utf-8"))
    leaked = data.get("leaked", [])
    print(f"Total files to repair: {len(leaked)}")

    success_count = 0
    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = {executor.submit(process_one, item[0]): item[0] for item in leaked}
        for fut in as_completed(futures):
            fname, ok, msg = fut.result()
            if ok:
                success_count += 1
                print(f"[SUCCESS] {fname}: {msg}", flush=True)
            else:
                print(f"[FAIL] {fname}: {msg}", flush=True)

    print(f"\nRepair complete: {success_count}/{len(leaked)} files repaired.")

if __name__ == "__main__":
    main()
