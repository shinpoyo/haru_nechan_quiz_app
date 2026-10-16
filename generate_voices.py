import base64
import json
import os
import re
import struct
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import requests
from dotenv import load_dotenv

# ~/.env またはカレントの .env を読み込む
load_dotenv(Path.home() / ".env")
load_dotenv(".env")


def clean_text(text: str) -> str:
    text = re.sub(r"【.*?】", "", text)
    text = re.sub(r"^お姉ちゃん「|」$", "", text)
    text = re.sub(r"[✨🎵♪🐙🪐🍌🎓🦋🦦💎🥩🍓🐦💨🎯😈💦🚨👑🐣🍮]", "", text)
    return text.strip()


def parse_questions_js(filepath: str = "questions.js"):
    content = Path(filepath).read_text(encoding="utf-8")
    start = content.find("[")
    end = content.rfind("]") + 1
    return json.loads(content[start:end])


# ユーザー決定の3番仕様：24000Hz PCM を 25000Hz (+4.2%) の絶妙な少女トーンWAVヘッダーで保存
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


def generate_single_voice(task, api_key: str, out_dir: Path):
    idx, total, qid, suffix, raw_text = task
    out_file = out_dir / f"{qid}_{suffix}.mp3"
    text = clean_text(raw_text)

    payload = {
        "contents": [{"parts": [{"text": text}]}],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {
                "voiceConfig": {
                    "prebuiltVoiceConfig": {"voiceName": "Aoede"}
                }
            },
        },
    }

    models_to_try = [
        "gemini-2.5-flash-preview-tts",
        "gemini-2.5-pro-preview-tts",
        "gemini-3.1-flash-tts-preview",
        "gemini-3.8-flash-tts",
        "gemini-3.8-flash-lite-tts",
    ]

    for m_idx in range(len(models_to_try)):
        model_name = models_to_try[(idx + m_idx) % len(models_to_try)]
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
        for attempt in range(2):
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
                        wav_bytes = pcm_to_wav_opt3(
                            base64.b64decode(b64), target_rate=25000
                        )
                        out_file.write_bytes(wav_bytes)
                        return f"[{idx}/{total}] Saved {out_file.name} ({len(wav_bytes)} bytes) via {model_name}"
                elif resp.status_code == 429:
                    time.sleep(1.5 + attempt)
                else:
                    time.sleep(1.0)
            except Exception:
                time.sleep(1.0)
    return f"[{idx}/{total}] FAILED {out_file.name}"


def generate_missing_voices(questions):
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        print("GEMINI_API_KEY is not set.")
        return

    out_dir = Path("assets/voices_aoede")
    out_dir.mkdir(parents=True, exist_ok=True)

    tasks = []
    idx = 0
    for q in questions:
        qid = q["id"]
        for suffix, raw_text in [("q", q["statement"]), ("h", q["hint"]), ("r", q["reaction"])]:
            out_file = out_dir / f"{qid}_{suffix}.mp3"
            fallback_c = out_dir / f"{qid}_c.mp3"
            if out_file.exists() and out_file.stat().st_size > 10000:
                continue
            if suffix == "r" and fallback_c.exists() and fallback_c.stat().st_size > 10000:
                continue
            idx += 1
            tasks.append((idx, 0, qid, suffix, raw_text))

    total = len(tasks)
    tasks = [(i, total, qid, s, t) for i, _, qid, s, t in tasks]
    print(f"Generating {total} missing voice files in parallel...", flush=True)
    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = [
            executor.submit(generate_single_voice, t, api_key, out_dir)
            for t in tasks
        ]
        for fut in as_completed(futures):
            print(fut.result(), flush=True)


if __name__ == "__main__":
    qs = parse_questions_js()
    generate_missing_voices(qs)
    print("Voice generation batch completed!")
