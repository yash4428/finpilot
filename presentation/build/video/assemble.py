"""Joins each recorded scene with its narration, then concatenates them into one MP4."""
import json, subprocess, os

D = os.path.dirname(os.path.abspath(__file__))
cfg = json.load(open(os.path.join(D, "narration.json")))
os.makedirs(os.path.join(D, "parts"), exist_ok=True)


def probe(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
                         capture_output=True, text=True).stdout.strip()
    return float(out) if out and out != "N/A" else 0.0


parts = []
for sc in cfg["scenes"]:
    sid = sc["id"]
    clip, wav, out = f"{D}/clips/{sid}.webm", f"{D}/audio/{sid}.wav", f"{D}/parts/{sid}.mp4"
    vd, ad = probe(clip), probe(wav)
    length = max(vd, ad)
    # Constant 30 fps, freeze the last frame if the narration runs longer, pad audio with silence.
    subprocess.run([
        "ffmpeg", "-y", "-loglevel", "error", "-i", clip, "-i", wav,
        "-filter_complex",
        f"[0:v]fps=30,scale=1440:900:flags=lanczos,setsar=1,tpad=stop_mode=clone:stop_duration={max(0, ad - vd) + 0.1},"
        f"trim=duration={length},setpts=PTS-STARTPTS,format=yuv420p[v];"
        f"[1:a]apad,atrim=duration={length},asetpts=PTS-STARTPTS[a]",
        "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "medium", "-crf", "20",
        "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2", out], check=True)
    parts.append(out)
    print(f"{sid:14} video {vd:5.1f}s  audio {ad:5.1f}s  -> {probe(out):5.1f}s")

with open(f"{D}/parts/list.txt", "w") as f:
    f.writelines(f"file '{p}'\n" for p in parts)
final = os.path.join(D, "..", "..", "FinPilot_Demo.mp4")
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", f"{D}/parts/list.txt",
                "-c", "copy", "-movflags", "+faststart", final], check=True)
print("FINAL", os.path.abspath(final), f"{probe(final):.1f}s")
