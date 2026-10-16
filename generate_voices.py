import asyncio
import base64
import json
import os
import re
import struct
import time
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


def generate_aoede_opt3_all(questions):
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        print("GEMINI_API_KEY is not set.")
        return

    out_dir = Path("assets/voices_aoede")
    out_dir.mkdir(parents=True, exist_ok=True)

    # 3番で絶賛された「見た目10代後半の愛嬌満点なアニメ美少女お姉ちゃん」演技指導
    style_map = {
        "q": "【キャラクター設定】見た目10代後半の愛嬌満点なアニメの美少女お姉ちゃん。声質は少女らしく弾んだ可愛いアニメ声。「ふふっ、知ってる〜？」と小悪魔っぽくいたずらな笑顔で、人差し指を立てて語尾を可愛く跳ねさせて話してください",
        "h": "【キャラクター設定】少し動揺しつつも、可愛らしく意地を張るアニメ美少女お姉ちゃん口調で「え、目を逸らしてないよ！？」と愛嬌たっぷりに話してください",
        "c": "【キャラクター設定】嘘がバレて「えへへ、バレちゃった〜？」と恥ずかしそうにウインクするか、満面の笑顔で弟（妹）を褒める、最高に可愛いアニメ少女お姉ちゃん口調で話してください",
        "w": "【キャラクター設定】「ふっふっふ〜、引っかかったな〜！」と得意げにいたずら成功を喜ぶドヤ顔か、「むーっ！本当なのに〜！」とほっぺを膨らませて可愛く拗ねたアニメ少女お姉ちゃん口調で話してください",
    }

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro-preview-tts:generateContent?key={api_key}"

    total_parts = len(questions) * 4
    done = 0

    for q in questions:
        qid = q["id"]
        parts = [
            ("q", q["statement"]),
            ("h", q["hint"]),
            ("c", q["reactionCorrect"]),
            ("w", q["reactionWrong"]),
        ]
        for suffix, raw_text in parts:
            done += 1
            out_file = out_dir / f"{qid}_{suffix}.mp3"
            if out_file.exists() and out_file.stat().st_size > 1000:
                print(f"[{done}/{total_parts}] Exists: {out_file.name}")
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

            # まずProモデルを試し、クォータ超過(429)の場合は自動でFlashモデルで生成
            models_to_try = [
                "gemini-2.5-pro-preview-tts",
                "gemini-2.5-flash-preview-tts"
            ]

            success = False
            for model_name in models_to_try:
                if success:
                    break
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
                for attempt in range(3):
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
                                print(
                                    f"[{done}/{total_parts}] Saved {out_file.name} via {model_name} ({len(wav_bytes)} bytes)"
                                )
                                success = True
                                break
                        elif resp.status_code == 429:
                            print(f"[{model_name}] 429 limit on {qid}_{suffix}. Trying next option...")
                            time.sleep(3)
                            break
                        else:
                            time.sleep(2)
                    except Exception as e:
                        time.sleep(2)

            time.sleep(1.0)


if __name__ == "__main__":
    qs = parse_questions_js()
    print(f"Starting Aoede (Option 3: Sweet Mischief Anime Sister) batch generation for {len(qs)} questions...")
    generate_aoede_opt3_all(qs)
    print("All done!")
