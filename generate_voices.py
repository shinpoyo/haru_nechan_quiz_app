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
    arr_str = content[start:end]
    json_str = re.sub(
        r'(\s+)(id|category|statement|isHallucination|hint|reactionCorrect|reactionWrong|explanation|pointTag):',
        r'\1"\2":',
        arr_str,
    )
    return json.loads(json_str)


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


def get_reaction_style(is_hallu: bool, suffix: str) -> str:
    if is_hallu and suffix == "c":
        return "【キャラクター設定】見た目10代後半の愛嬌満点でおバカ可愛いアニメの美少女お姉ちゃん。うろ覚えや知ったかぶりがスマホ検索でバレてしまい、顔を赤くして恥ずかしそうに照れたり『えっ違ったの！？』と可愛く焦ったりするアニメ少女口調で話してください"
    elif is_hallu and suffix == "w":
        return "【キャラクター設定】見た目10代後半の愛嬌満点でおバカ可愛いアニメの美少女お姉ちゃん。最初は得意げにいたずらっぽく笑いつつ、スマホで検索されて『あっ調べないで、恥ずかしい〜！』と可愛く焦るアニメ少女口調で話してください"
    elif not is_hallu and suffix == "c":
        return "【キャラクター設定】見た目10代後半の愛嬌満点でおバカ可愛いアニメの美少女お姉ちゃん。自分の雑学がスマホ検索でも本当だと証明されて、『ほらね〜！お姉ちゃんの言った通りでしょ！』と満面の笑顔で得意げに喜ぶ可愛いアニメ少女口調で話してください"
    else:
        return "【キャラクター設定】見た目10代後半の愛嬌満点でおバカ可愛いアニメの美少女お姉ちゃん。せっかく本当のことを教えてあげたのに疑われて、『むーっ！ほらスマホ見てよ、本当だったでしょ！』とほっぺを膨らませて可愛く拗ねるアニメ少女口調で話してください"


def generate_single_reaction(task, api_key: str, out_dir: Path):
    idx, total, qid, is_hallu, suffix, raw_text = task
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
            except Exception as e:
                time.sleep(1.0)
    return f"[{idx}/{total}] FAILED {out_file.name}"


def generate_all_reactions(questions):
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        print("GEMINI_API_KEY is not set.")
        return

    out_dir = Path("assets/voices_aoede")
    out_dir.mkdir(parents=True, exist_ok=True)

    tasks = []
    total = len(questions) * 2
    idx = 0
    for q in questions:
        qid = q["id"]
        is_hallu = bool(q["isHallucination"])
        for suffix, raw_text in [("c", q["reactionCorrect"]), ("w", q["reactionWrong"])]:
            idx += 1
            out_file = out_dir / f"{qid}_{suffix}.mp3"
            if out_file.exists() and 10000 < out_file.stat().st_size <= 650000:
                continue
            tasks.append((idx, total, qid, is_hallu, suffix, raw_text))

    print(f"Regenerating {len(tasks)} oversized reaction voices with pure dialogue...", flush=True)
    with ThreadPoolExecutor(max_workers=6) as executor:
        futures = [
            executor.submit(generate_single_reaction, t, api_key, out_dir)
            for t in tasks
        ]
        for fut in as_completed(futures):
            print(fut.result(), flush=True)


if __name__ == "__main__":
    qs = parse_questions_js()
    generate_all_reactions(qs)
    print("All reaction voices updated!")
