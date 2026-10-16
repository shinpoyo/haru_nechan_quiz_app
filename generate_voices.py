import asyncio
import base64
import json
import os
import re
import struct
import time
from pathlib import Path

import edge_tts
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
    # Extract array body
    start = content.find("[")
    end = content.rfind("]") + 1
    arr_str = content[start:end]
    # Convert JS object keys to valid JSON
    json_str = re.sub(
        r'(\s+)(id|category|statement|isHallucination|hint|reactionCorrect|reactionWrong|explanation|pointTag):',
        r'\1"\2":',
        arr_str,
    )
    return json.loads(json_str)


async def generate_nanami_cute_all(questions):
    out_dir = Path("assets/voices_nanami")
    out_dir.mkdir(parents=True, exist_ok=True)
    sem = asyncio.Semaphore(5)

    async def gen_one(key: str, raw_text: str):
        out_file = out_dir / f"{key}.mp3"
        if out_file.exists() and out_file.stat().st_size > 1000:
            return
        text = clean_text(raw_text)
        async with sem:
            for attempt in range(3):
                try:
                    comm = edge_tts.Communicate(
                        text, "ja-JP-NanamiNeural", rate="+5%", pitch="+22Hz"
                    )
                    await comm.save(str(out_file))
                    print(f"[Nanami Cute] Saved {out_file.name}")
                    break
                except Exception as e:
                    print(f"Retry {key}: {e}")
                    await asyncio.sleep(1.5)

    tasks = []
    for q in questions:
        qid = q["id"]
        tasks.append(gen_one(f"{qid}_q", q["statement"]))
        tasks.append(gen_one(f"{qid}_h", q["hint"]))
        tasks.append(gen_one(f"{qid}_c", q["reactionCorrect"]))
        tasks.append(gen_one(f"{qid}_w", q["reactionWrong"]))

    await asyncio.gather(*tasks)


def pcm_to_wav_bytes(pcm_bytes: bytes, sample_rate: int = 24000) -> bytes:
    header = struct.pack(
        "<4sI4s4sIHHIIHH4sI",
        b"RIFF",
        36 + len(pcm_bytes),
        b"WAVE",
        b"fmt ",
        16,
        1,
        1,
        sample_rate,
        sample_rate * 2,
        2,
        16,
        b"data",
        len(pcm_bytes),
    )
    return header + pcm_bytes


def generate_aoede_all(questions, model_name="gemini-2.5-pro-preview-tts"):
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        print("GEMINI_API_KEY is not set in ~/.env. Skipping Aoede batch generation.")
        return

    out_dir = Path("assets/voices_aoede")
    out_dir.mkdir(parents=True, exist_ok=True)

    style_map = {
        "q": "明るく自信満々で愛嬌たっぷりの可愛いお姉ちゃん口調で、自然な息遣いと抑揚をつけて楽しそうに話してください",
        "h": "少し動揺しつつも得意げなお姉ちゃん口調で話してください",
        "c": "嘘がバレて「てへぺろ♪」と照れ隠しするか、満面の笑顔で褒める可愛いお姉ちゃん口調で話してください",
        "w": "「ふっふっふ、引っかかったね♪」というドヤ顔か、「むーっ！本当なのに！」と可愛く拗ねたお姉ちゃん口調で話してください",
    }

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"

    for q in questions:
        qid = q["id"]
        parts = [
            ("q", q["statement"]),
            ("h", q["hint"]),
            ("c", q["reactionCorrect"]),
            ("w", q["reactionWrong"]),
        ]
        for suffix, raw_text in parts:
            out_file = out_dir / f"{qid}_{suffix}.mp3"
            if out_file.exists() and out_file.stat().st_size > 1000:
                continue
            text = clean_text(raw_text)
            prompt = f"{style_map[suffix]}：\n「{text}」"
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
                    wav_bytes = pcm_to_wav_bytes(base64.b64decode(b64), 24000)
                    out_file.write_bytes(wav_bytes)
                    print(f"[Aoede {model_name}] Saved {out_file.name}")
            else:
                print(f"[Aoede Error] {qid}_{suffix}: {resp.status_code} {resp.text[:120]}")
            time.sleep(1.2)


if __name__ == "__main__":
    qs = parse_questions_js()
    print(f"Loaded {len(qs)} questions.")
    asyncio.run(generate_nanami_cute_all(qs))
    generate_aoede_all(qs)
