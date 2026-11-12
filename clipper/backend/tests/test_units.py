import subprocess
from datetime import datetime

import pytest

from app.ai import highlight, transcription
from app.campaigns.checklist import run_checklist
from app.core import config
from app.earnings import calc
from app.video import ffmpeg, render, subtitles

W = {"hook": 25, "emotion": 20, "curiosity": 15, "information": 15, "completeness": 15, "av_quality": 10}


# ---- video metadata, audio extraction, silence ------------------------------------------------

def test_probe_reads_metadata(sample):
    meta = ffmpeg.probe(sample["path"])
    assert (meta["width"], meta["height"], meta["fps"]) == (640, 360, 25.0)
    assert meta["video_codec"] == "h264" and meta["audio_codec"] == "aac" and meta["audio_streams"] == 1
    assert abs(meta["duration"] - sample["duration"]) < 0.2


def test_probe_rejects_non_video(tmp_path):
    bad = tmp_path / "fake.mp4"
    bad.write_text("this is not a video")
    with pytest.raises(ffmpeg.FFmpegError):
        ffmpeg.probe(bad)


def test_extract_audio_keeps_timeline(sample, tmp_path):
    wav = tmp_path / "a.wav"
    seen = []
    ffmpeg.extract_audio(sample["path"], wav, duration=sample["duration"], on_progress=seen.append, cwd=tmp_path)
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=sample_rate,channels:format=duration",
                        "-of", "csv=p=0", str(wav)], capture_output=True, text=True).stdout.split()
    assert r[0] == "16000,1" and abs(float(r[1]) - sample["duration"]) < 1.0  # audio track ends with the last word
    assert seen and seen[-1] > 0.9
    # the long pause after sentence 6 is found where it really is
    gap_start = sample["segments"][5]["end"]
    assert any(abs(s - gap_start) < 0.4 and e - s > 1.0 for s, e in ffmpeg.detect_silences(wav, cwd=tmp_path))


def test_ffmpeg_never_overwrites(sample, tmp_path):
    wav = tmp_path / "a.wav"
    wav.write_text("precious")
    with pytest.raises(ffmpeg.FFmpegError):
        ffmpeg.extract_audio(sample["path"], wav, cwd=tmp_path)
    assert wav.read_text() == "precious"


def test_cancel_stops_ffmpeg(sample, tmp_path):
    with pytest.raises(ffmpeg.Cancelled):
        ffmpeg.extract_audio(sample["path"], tmp_path / "a.wav", should_cancel=lambda: True, cwd=tmp_path)


# ---- paths ------------------------------------------------------------------------------------

def test_path_safety(tmp_path):
    assert config.safe_name("../../etc/passwd") == "passwd"
    assert config.safe_name("..\\..\\evil.mp4") == "evil.mp4"
    assert "/" not in config.safe_name("a/b;rm -rf $HOME.mp4")
    with pytest.raises(ValueError):
        config.inside(tmp_path, tmp_path / ".." / "x")
    (tmp_path / "clip.mp4").write_text("x")
    assert config.fresh_path(tmp_path, "clip", ".mp4").name == "clip-1.mp4"


# ---- transcript processing and subtitles --------------------------------------------------------

def test_sentence_level_fallback_spreads_words():
    words = subtitles.words_from_segments([{"start": 10.0, "end": 12.0, "text": "hello wonderful world"}])
    assert [w["text"] for w in words] == ["hello", "wonderful", "world"]
    assert words[0]["start"] == 10.0 and abs(words[-1]["end"] - 12.0) < 0.01
    assert all(a["end"] <= b["start"] + 1e-6 for a, b in zip(words, words[1:]))
    assert words[1]["end"] - words[1]["start"] > words[0]["end"] - words[0]["start"]  # longer word, longer time


def test_word_timestamps_are_used_when_present():
    seg = {"start": 0, "end": 2, "text": "a b", "words": [{"text": " a", "start": 0.1, "end": 0.4}, {"text": "b", "start": 1.5, "end": 1.9}]}
    assert subtitles.words_from_segments([seg]) == [{"text": "a", "start": 0.1, "end": 0.4}, {"text": "b", "start": 1.5, "end": 1.9}]


def test_cues_are_synchronised_and_clipped():
    words = [{"text": t, "start": 100 + i * 0.5, "end": 100.4 + i * 0.5} for i, t in enumerate("one two three four five six seven".split())]
    style = subtitles.resolve_style("bold_impact")
    cues = subtitles.build_cues(words, style, clip_start=100.5, clip_end=103.0)
    flat = [w for c in cues for w in c["words"]]
    assert [w["text"] for w in flat] == ["TWO", "THREE", "FOUR", "FIVE", "SIX"]  # uppercase template, range respected
    assert abs(flat[0]["start"] - 0.0) < 1e-6  # clip-relative time
    assert all(len(c["words"]) <= 3 for c in cues)
    for c in cues:  # each word is lit from its own start until the next word starts
        for a, b in zip(c["words"], c["words"][1:]):
            assert a["end"] == b["start"]
    assert all(a["end"] <= b["start"] + 1e-6 for a, b in zip(cues, cues[1:]))


def test_ass_output_and_escaping():
    style = subtitles.resolve_style("yellow_highlight", {"size": 80, "font": "DejaVu Sans", "pos_y": 0.5, "bogus": 1})
    cues = subtitles.build_cues([{"text": "{\\b1}hi", "start": 0, "end": 0.5}, {"text": "there", "start": 0.5, "end": 1}], style, 0, 5)
    ass = subtitles.build_ass(cues, style, 1080, 1920)
    assert "PlayResX: 1080" in ass and "Style: Cap,DejaVu Sans,80," in ass
    assert "\\pos(540,960)" in ass
    assert "&H0000D4FF" in ass  # #FFD400 as ASS BGR
    assert "{\\b1}" not in ass and "(/b1)hi" in ass  # user text cannot inject override tags
    assert ass.count("Dialogue:") == 2
    assert "Dialogue: 0,0:00:00.00,0:00:00.50" in ass


def test_all_templates_resolve():
    assert len(subtitles.TEMPLATES) == 6
    for name in subtitles.TEMPLATES:
        style = subtitles.resolve_style(name)
        assert subtitles.build_ass(subtitles.build_cues([{"text": "x", "start": 0, "end": 1}], style, 0, 2), style, 720, 1280)


def test_parse_srt_and_vtt():
    srt = "1\n00:00:01,000 --> 00:00:03,500\nHello <i>there</i>\nfriend\n\n2\n00:00:04,000 --> 00:00:05,000\nBye\n"
    assert subtitles.parse_transcript_file("a.srt", srt) == [
        {"start": 1.0, "end": 3.5, "text": "Hello there friend"}, {"start": 4.0, "end": 5.0, "text": "Bye"}]
    assert subtitles.parse_transcript_file("a.vtt", "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nनमस्ते दोस्तों\n")[0]["text"] == "नमस्ते दोस्तों"
    with pytest.raises(ValueError):
        subtitles.parse_transcript_file("a.txt", "just words")


def test_transcription_errors_are_friendly(monkeypatch):
    with pytest.raises(transcription.TranscriptionError, match="Unknown Whisper model"):
        transcription.load_model("gigantic")
    import faster_whisper
    monkeypatch.setattr(faster_whisper, "WhisperModel", lambda *a, **k: (_ for _ in ()).throw(OSError("offline")))
    with pytest.raises(transcription.TranscriptionError, match="huggingface.co"):
        transcription.load_model("tiny", "cpu")


def test_transcribe_maps_segments_and_words(monkeypatch):
    class Word:  # the shape faster-whisper returns
        def __init__(self, w, s, e): self.word, self.start, self.end = w, s, e
    class Seg:
        start, end, text = 0.0, 1.0, " Namaste dosto "
        words = [Word(" Namaste", 0.0, 0.5), Word(" dosto", 0.5, 1.0)]
    class Model:
        def transcribe(self, path, **kw):
            assert kw["word_timestamps"] and kw["language"] == "hi"
            return iter([Seg()]), type("Info", (), {"language": "hi"})()
    monkeypatch.setattr(transcription, "load_model", lambda *a, **k: (Model(), "cpu"))
    seen = []
    out = transcription.transcribe("x.wav", size="tiny", language="hi", duration=2.0, on_progress=seen.append)
    assert out["language"] == "hi" and out["segments"][0]["text"] == "Namaste dosto"
    assert out["segments"][0]["words"][1] == {"text": "dosto", "start": 0.5, "end": 1.0}
    assert seen == [0.5]


# ---- candidate generation and scoring -----------------------------------------------------------

def _words(sample):
    return subtitles.words_from_segments(sample["segments"])


def test_sentences_follow_punctuation(sample):
    sents = highlight.build_sentences(_words(sample))
    assert [s["text"] for s in sents] == [s["text"] for s in sample["segments"]]


def test_sentences_split_on_pause_without_punctuation():
    words = [{"text": "one", "start": 0, "end": 0.3}, {"text": "two", "start": 0.4, "end": 0.7}, {"text": "three", "start": 2.5, "end": 2.9}]
    sents = highlight.build_sentences(words)
    assert [s["text"] for s in sents] == ["one two", "three"] and not sents[0]["punctuated"]


def test_candidates_never_cut_sentences(sample):
    cands = highlight.find_candidates(_words(sample), durations=[15, 30], weights=W)
    assert len(cands) >= 2
    starts = {round(s["start"], 2) for s in sample["segments"]}
    ends = {round(s["end"], 2) for s in sample["segments"]}
    for c in cands:
        assert c["start"] in starts and c["end"] in ends
        target = c["subscores"]["target_duration"]
        assert target * 0.7 <= c["end"] - c["start"] <= target * 1.3
        assert 0 <= c["score"] <= 100 and c["title"] and c["hook"] and c["reason"]
    assert [c["score"] for c in cands] == sorted((c["score"] for c in cands), reverse=True)


def test_candidates_are_not_near_duplicates(sample):
    cands = highlight.find_candidates(_words(sample), durations=[15, 30, 45], weights=W)
    for i, a in enumerate(cands):
        for b in cands[i + 1:]:
            inter = max(0, min(a["end"], b["end"]) - max(a["start"], b["start"]))
            assert inter / min(a["end"] - a["start"], b["end"] - b["start"]) <= 0.5


def test_score_is_weighted_sum_and_explained():
    sents = highlight.build_sentences(subtitles.words_from_segments([
        {"start": 0, "end": 4, "text": "Why do you never save money?"},
        {"start": 4.2, "end": 9, "text": "Because nobody taught you the first rule."},
        {"start": 9.2, "end": 14, "text": "So remember to pay yourself first."}]))
    r = highlight.score_window(sents, W)
    assert r["penalties"] == []
    assert abs(r["score"] - sum(r["subscores"][k] * W[k] for k in W) / 100) < 0.1
    assert "Opens with a question" in r["reasons"] and "Ends on a conclusion" in r["reasons"]
    only_hook = highlight.score_window(sents, {**dict.fromkeys(W, 0), "hook": 1})
    assert only_hook["score"] == only_hook["subscores"]["hook"]  # weights are configurable


def test_penalties_for_dangling_start_and_silence():
    sents = highlight.build_sentences(subtitles.words_from_segments([
        {"start": 0, "end": 3, "text": "And then it happened again."}, {"start": 13, "end": 16, "text": "It was fine."}]))
    r = highlight.score_window(sents, W, silences=[[3.2, 12.8]])
    why = " ".join(p["why"] for p in r["penalties"])
    assert "leans on earlier context" in why and "silence" in why
    clean = highlight.score_window(sents, W)
    assert r["score"] < clean["score"]


def test_unfinished_last_sentence_is_penalised():
    words = [{"text": "Done.", "start": 0, "end": 1}, {"text": "and", "start": 1.2, "end": 1.5}, {"text": "then", "start": 1.6, "end": 2}]
    r = highlight.score_window(highlight.build_sentences(words), W)
    assert any("unfinished" in p["why"] for p in r["penalties"])


def test_hindi_text_scores():
    sents = highlight.build_sentences(subtitles.words_from_segments([
        {"start": 0, "end": 4, "text": "क्या आप जानते हैं सबसे बड़ी गलती क्या है?"}, {"start": 4.2, "end": 8, "text": "क्योंकि यही सच है।"}]))
    assert len(sents) == 2  # the danda ends a sentence
    r = highlight.score_window(sents, W)
    assert "Opens with a question" in r["reasons"] and r["subscores"]["curiosity"] > 50


# ---- render planning ----------------------------------------------------------------------------

def test_output_sizes():
    assert render.output_size("9:16", 1080) == (1080, 1920)
    assert render.output_size("1:1", 1080) == (1080, 1080)
    assert render.output_size("16:9", 1080) == (1920, 1080)
    assert render.output_size("4:5", 720) == (720, 900)


def test_silence_cut_and_caption_remap():
    keeps = render.keep_ranges([[2.0, 5.0], [8.0, 8.1]], 10.0, pad=0.1)
    assert keeps == [[0.0, 2.1], [4.9, 10.0]]  # short silences are left alone
    remap = render.make_remap(keeps)
    assert remap(1.0) == 1.0 and remap(3.0) is None and abs(remap(5.9) - 3.1) < 1e-6
    words = [{"text": "before", "start": 1.0, "end": 1.5}, {"text": "after", "start": 6.0, "end": 6.5}]
    cues = subtitles.build_cues(words, subtitles.resolve_style("minimal_white"), 0, 10, remap)
    assert abs([w for c in cues for w in c["words"]][1]["start"] - 3.2) < 1e-6  # caption moved with the audio


def test_command_is_an_argument_list_with_expected_filters(tmp_path):
    s = render.merged_settings({"crop_mode": "blur", "dynamic_zoom": True, "volume": 1.5, "unknown": "x"})
    assert "unknown" not in s
    args, total = render.build_command(
        tmp_path / "in put;rm.mp4", tmp_path / "o.mp4", start=5, end=15, settings=s,
        preset=render.DEFAULT_PRESET, has_audio=True, src_fps=29.97, ass_name="captions.ass", keeps=[[0, 4], [6, 10]])
    assert total == 8
    assert str(tmp_path / "in put;rm.mp4") in args  # odd filenames stay one argument; no shell is involved
    graph = args[args.index("-filter_complex") + 1]
    for piece in ("boxblur", "ass=captions.ass", "loudnorm", "volume=1.50", "aselect=", "select=", "eval=frame", "fps=30"):
        assert piece in graph
    assert args[args.index("-c:v") + 1] == "libx264" and args[args.index("-c:a") + 1] == "aac"


# ---- campaigns and earnings ---------------------------------------------------------------------

def test_campaign_checklist():
    camp = {"min_duration": 15, "max_duration": 60, "allowed_platforms": ["TikTok", "Instagram"], "deadline": datetime(2030, 1, 1)}
    rules = [{"id": 1, "kind": "hashtag", "value": "BrandX"}, {"id": 2, "kind": "caption", "value": "link in bio"},
             {"id": 3, "kind": "branding", "value": "Logo visible in first 3 seconds"}]
    items = run_checklist(camp, rules, clip_duration=75, platform="tiktok", caption="Wow #brandx", now=datetime(2029, 1, 1))
    status = {i["label"]: i["status"] for i in items}
    assert status["Clip length 15s to 60s"] == "fail"
    assert status["Platform is allowed"] == "pass" and status["Before the deadline"] == "pass"
    assert status["Caption has #brandx"] == "pass" and status['Caption includes "link in bio"'] == "fail"
    assert status["Logo visible in first 3 seconds"] == "manual"  # never auto-approved
    items = run_checklist(camp, rules, clip_duration=30, platform="YouTube", caption="#brandxyz", manual_checks={"3": True}, now=datetime(2031, 1, 1))
    status = {i["label"]: i["status"] for i in items}
    assert status["Clip length 15s to 60s"] == "pass" and status["Platform is allowed"] == "fail"
    assert status["Before the deadline"] == "fail" and status["Caption has #brandx"] == "fail"
    assert status["Logo visible in first 3 seconds"] == "pass"
    assert run_checklist(camp, [], clip_duration=None, platform=None)[0]["status"] == "unknown"


def test_earnings_estimates():
    per_view = {"payment_model": "per_1000_views", "rate_per_1000": 2.5, "max_payout": 100}
    assert calc.estimate(per_view, 10_000) == 25.0
    assert calc.estimate(per_view, 1_000_000) == 100.0  # capped
    assert calc.estimate({"payment_model": "flat_per_clip", "flat_rate": 15, "max_payout": None}, 0) == 15.0
    assert calc.estimate({"payment_model": "none"}, 99999) == 0.0
    t = datetime(2026, 1, 1)
    metrics = [{"id": 1, "kind": "self_reported", "views": 5000, "recorded_at": t},
               {"id": 2, "kind": "self_reported", "views": 9000, "recorded_at": t.replace(day=2)}]
    est = calc.submission_estimate(per_view, metrics)
    assert est == {"self_reported_views": 9000, "verified_views": 0, "estimate_basis": "self_reported", "estimated": 22.5}
    metrics.append({"id": 3, "kind": "verified", "views": 4000, "recorded_at": t.replace(day=3)})
    est = calc.submission_estimate(per_view, metrics)
    assert est["estimate_basis"] == "verified" and est["estimated"] == 10.0  # verified views win over self-reported
    assert calc.submission_estimate(per_view, [])["estimate_basis"] == "none"


def test_csv_import_parsing():
    rows, errors = calc.parse_csv("metrics", "submission_id,views,kind,date\n1,1200,verified,2026-03-01\n2,abc,,\n3,50,guess,\n4,10,,\n")
    assert [r["views"] for r in rows] == [1200, 10] and rows[0]["recorded_at"] == datetime(2026, 3, 1)
    assert rows[1]["kind"] == "self_reported" and len(errors) == 2 and errors[0].startswith("Line 3")
    rows, errors = calc.parse_csv("payments", "Campaign_ID, Amount ,date,note\n7,45.5,01/02/2026,first\n7,-3,,\n")
    assert rows == [{"campaign_id": 7, "amount": 45.5, "received_at": datetime(2026, 2, 1), "note": "first", "submission_id": None}]
    assert len(errors) == 1
    assert calc.parse_csv("payments", "foo,bar\n1,2\n") == ([], ["Missing column(s): amount, campaign_id"])


def test_push_in_zoom_stays_centred(tmp_path):
    """The slow push-in must zoom toward the middle of the frame, not drift to a corner."""
    src = tmp_path / "bars.mp4"
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "smptebars=s=360x640:r=25:d=4",
                    "-pix_fmt", "yuv420p", str(src)], check=True)
    s = render.merged_settings({"dynamic_zoom": True, "normalize_audio": False})
    args, _ = render.build_command(src, tmp_path / "o.mp4", start=0, end=4, settings=s, has_audio=False, src_fps=25,
                                   preset={**render.DEFAULT_PRESET, "short_side": 360, "x264_preset": "ultrafast"})
    ffmpeg.run(args, cwd=tmp_path)
    import cv2

    def bar_edges(t: float) -> tuple[int, int]:
        cap = cv2.VideoCapture(str(tmp_path / "o.mp4"))
        cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
        row = cap.read()[1][100].astype(int)
        cap.release()
        edges = [i for i in range(1, 360) if abs(row[i] - row[i - 1]).sum() > 60]
        return edges[0], edges[-1]

    (l0, r0), (l1, r1) = bar_edges(0), bar_edges(3.8)
    assert l1 < l0 - 4 and r1 > r0 + 4  # both sides move outward: the zoom is about the centre


def test_face_sampling_is_optional_without_opencv(sample, monkeypatch):
    import sys
    from app.video import faces
    monkeypatch.setitem(sys.modules, "cv2", None)  # makes `import cv2` raise ImportError, as on a phone
    assert faces.sample_faces(sample["path"], [1.0, 2.0]) == []
    assert faces.face_centre([]) is None
