# -*- coding: utf-8 -*-
"""
春野詩音 音声バッチ生成スクリプト（Option 3 統一トーン仕様）
統一プロンプト + gemini-3.1-flash-tts-preview + 25000Hz WAVヘッダー
指定した問題範囲（例: --start 1 --end 10）を安全にバッチ生成します。
"""

import argparse
import base64
import json
import os
import re
import struct
import sys
import time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests
from dotenv import load_dotenv

load_dotenv(Path.home() / ".env")
load_dotenv(".env")

API_KEY = os.environ.get("GEMINI_API_KEY", "").strip()
if not API_KEY:
    print("Error: GEMINI_API_KEY not found.")
    sys.exit(1)

OUT_DIR = Path("assets/voices_aoede")
OUT_DIR.mkdir(parents=True, exist_ok=True)

# 24000Hz PCM を 25000Hz (+4.2%) の絶妙な少女トーンWAVヘッダーで保存（Option 3仕様）
def pcm_to_wav_opt3(pcm_bytes: bytes, target_rate: int = 25000) -> bytes:
    header = struct.pack(
        "<4sI4s4sIHHIIHH4sI",
        b"RIFF",
        36 + len(pcm_bytes),
        b"WAVE",
        b"fmt ",
        16,
        1,
        1,
        target_rate,
        target_rate * 2,
        2,
        16,
        b"data",
        len(pcm_bytes),
    )
    return header + pcm_bytes

def clean_text(text: str) -> str:
    text = re.sub(r"【.*?】", "", text)
    text = re.sub(r"^(お姉ちゃん|ねーちゃん)「|」$", "", text)
    text = re.sub(r"[✨🎵♪🐙🪐🍌🎓🦋🦦💎🥩🍓🐦💨🎯😈💦🚨👑🐣🍮]", "", text)
    return text.strip()

def generate_one_voice(key: str, raw_text: str, idx: int, total: int, model: str = "gemini-3.1-flash-tts-preview"):
    out_file = OUT_DIR / f"{key}.mp3"
    text = clean_text(raw_text)
    
    # 統一感を出すための共通演技ディレクション
    prompt = f"明るく愛嬌たっぷりな可愛いアニメ少女（春野詩音）の声で、以下のセリフを自然に読んでください:\n「{text}」"
    
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={API_KEY}"
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {
                "voiceConfig": {
                    "prebuiltVoiceConfig": {"voiceName": "Aoede"}
                }
            },
        },
    }
    
    for attempt in range(4):
        try:
            resp = requests.post(url, json=payload, timeout=45)
            if resp.status_code == 200:
                data = resp.json()
                b64 = (
                    data.get("candidates", [{}])[0]
                    .get("content", {})
                    .get("parts", [{}])[0]
                    .get("inlineData", {})
                    .get("data")
                )
                if b64:
                    wav_bytes = pcm_to_wav_opt3(base64.b64decode(b64), target_rate=25000)
                    out_file.write_bytes(wav_bytes)
                    print(f"[{idx}/{total}] SUCCESS {key}.mp3 ({len(wav_bytes)} bytes)", flush=True)
                    return True
            elif resp.status_code == 429:
                wait_sec = 2.0 * (attempt + 1)
                time.sleep(wait_sec)
            else:
                time.sleep(1.0)
        except Exception:
            time.sleep(1.5)
            
    print(f"[{idx}/{total}] FAILED {key}.mp3", flush=True)
    return False

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--start", type=int, default=1, help="Start question number (1-indexed)")
    parser.add_argument("--end", type=int, default=10, help="End question number (inclusive)")
    parser.add_argument("--workers", type=int, default=3, help="Concurrent workers")
    args = parser.parse_args()

    content = Path("questions.js").read_text(encoding="utf-8")
    start_idx = content.find("[")
    end_idx = content.rfind("]") + 1
    questions = json.loads(content[start_idx:end_idx])

    selected = [q for q in questions if args.start <= int(q["id"].replace("q", "")) <= args.end]
    print(f"Targeting Questions Q{args.start:02d} to Q{args.end:02d} ({len(selected)} questions)")

    tasks = []
    for q in selected:
        qid = q["id"]
        tasks.append((f"{qid}_q", q["statement"]))
        tasks.append((f"{qid}_h", q["hint"]))
        tasks.append((f"{qid}_r", q["reaction"]))

    total = len(tasks)
    print(f"Generating {total} voice files with unified tone and pitch...", flush=True)

    success_count = 0
    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = [
            executor.submit(generate_one_voice, k, t, i + 1, total)
            for i, (k, t) in enumerate(tasks)
        ]
        for fut in as_completed(futures):
            if fut.result():
                success_count += 1

    print(f"Batch completed: {success_count}/{total} files generated.", flush=True)

if __name__ == "__main__":
    main()
