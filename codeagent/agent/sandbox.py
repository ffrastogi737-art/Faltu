"""Command policy and execution.

Policy order: built-in deny -> user deny -> consequential (always ask) ->
user ask -> user allow -> network (settings) -> mode default.
Execution: bubblewrap with no network when available (Linux PC), else a
restricted subprocess (Termux: no root, so network cannot be cut off;
network commands need approval instead)."""
import os
import re
import shlex
import shutil
import signal
import subprocess
from fnmatch import fnmatch

DENY = [
    (r"\brm\s+(-\w*\s+)*-\w*[rf]\w*\s+(/|~|\$HOME)(\s|$|/\*)", "deletes the whole filesystem or home"),
    (r"\bmkfs(\.\w+)?\b", "formats a disk"),
    (r"\bdd\b.*\bof=/dev/", "writes a raw device"),
    (r":\(\)\s*\{\s*:\|:&\s*\};:", "fork bomb"),
    (r"\b(shutdown|reboot|poweroff|halt)\b", "powers off the machine"),
    (r">\s*/dev/(sd|nvme|mmcblk)", "overwrites a disk"),
    (r"\b(curl|wget)\b[^|;&]*\|\s*(ba|z|da)?sh\b", "pipes a download into a shell"),
    (r"\b(sudo|su|doas)\b", "privilege escalation"),
    (r"(^|[\s;&|])(cat|less|more|head|tail|cp|base64|xxd|grep|sed|awk)\b[^;&|]*(^|[\s/])\.env(\s|$)",
     "reads secrets (.env)"),
]
CONSEQUENTIAL = [
    (r"\bgit\s+push\b", "git push"),
    (r"\b(npm|yarn|pnpm)\s+publish\b|\btwine\s+upload\b|\bcargo\s+publish\b|\bgh\s+release\b", "publishing"),
    (r"\b(apt|apt-get|pkg|brew|dnf|yum|pacman)\s+(install|remove|upgrade)\b", "system package change"),
    (r"\bgit\s+(reset\s+--hard|clean\s+-\w*f)", "discards work"),
]
NETWORK = re.compile(r"\b(curl|wget|ssh|scp|rsync|nc|ncat|ftp|telnet|http)\b|\bgit\s+(push|pull|fetch|clone)\b|"
                     r"\bpip3?\s+(install|download)\b|\b(npm|pnpm|yarn)\s+(install|i|add|ci)\b|\bnpx\b|"
                     r"\bgo\s+(get|install)\b|\bcargo\s+(install|add|fetch)\b")
WRITERS = re.compile(r"\b(rm|mv|cp|chmod|chown|truncate|tee|ln|rmdir|mkdir)\b|>")


def _outside_paths(cmd, ws):
    """Absolute or ../ paths in the command that leave the workspace."""
    out = []
    try:
        tokens = shlex.split(cmd)
    except ValueError:
        tokens = cmd.split()
    for t in tokens:
        t = t.lstrip(">")
        if not (t.startswith("/") or t.startswith("~") or ".." in t):
            continue
        full = os.path.realpath(os.path.join(ws, os.path.expanduser(t)))
        if full != ws and not full.startswith(ws + os.sep) and full != "/dev/null":
            out.append(t)
    return out


def classify(cmd, ws, perms):
    """-> ("deny" | "ask" | "allow" | "default", reason, needs_network)."""
    net = bool(NETWORK.search(cmd))
    for rx, why in DENY:
        if re.search(rx, cmd):
            return "deny", why, net
    for pat in perms.get("deny") or []:
        if fnmatch(cmd, pat):
            return "deny", f"matches deny rule `{pat}`", net
    for rx, why in CONSEQUENTIAL:
        if re.search(rx, cmd):
            return "ask", why, net
    if WRITERS.search(cmd) and (paths := _outside_paths(cmd, ws)):
        return "ask", f"changes files outside the workspace: {' '.join(paths)[:120]}", net
    for pat in perms.get("ask") or []:
        if fnmatch(cmd, pat):
            return "ask", f"matches ask rule `{pat}`", net
    for pat in perms.get("allow") or []:
        if fnmatch(cmd, pat):
            return ("ask" if net and perms.get("network", "ask") == "ask" else "allow"), f"matches allow rule `{pat}`", net
    if net:
        mode = perms.get("network", "ask")
        return {"allow": "allow", "deny": "deny"}.get(mode, "ask"), "uses the network", net
    return "default", "", net


def has_bwrap():
    return shutil.which("bwrap") is not None


def run(cmd, ws, env, timeout, network=False, sandbox="auto", max_out=12_000):
    """Runs the command; returns (exit_code, output_tail, how)."""
    if os.name == "nt":  # Windows: cmd.exe, own process group, whole tree killed on timeout
        p = subprocess.Popen(cmd, shell=True, cwd=ws, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                             text=True, errors="replace", creationflags=subprocess.CREATE_NEW_PROCESS_GROUP)
        try:
            out, _ = p.communicate(timeout=timeout)
            return p.returncode, (out or "")[-max_out:], "subprocess (windows)"
        except subprocess.TimeoutExpired:
            subprocess.run(["taskkill", "/F", "/T", "/PID", str(p.pid)], capture_output=True)
            out, _ = p.communicate()
            return None, (out or "")[-max_out:], "subprocess (windows)"
    argv = ["/bin/sh", "-c", cmd]
    how = "subprocess"
    if sandbox != "off" and has_bwrap():
        argv = ["bwrap", "--die-with-parent", "--ro-bind", "/", "/", "--bind", ws, ws, "--dev", "/dev",
                "--proc", "/proc", "--tmpfs", "/tmp", "--chdir", ws] + ([] if network else ["--unshare-net"]) + argv
        how = "bwrap" + ("" if network else " (no network)")
    p = subprocess.Popen(argv, cwd=ws, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
                         errors="replace", start_new_session=True)
    try:
        out, _ = p.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        os.killpg(p.pid, signal.SIGKILL)  # the whole process group, not only the shell
        out, _ = p.communicate()
        return None, (out or "")[-max_out:], how
    return p.returncode, (out or "")[-max_out:], how
