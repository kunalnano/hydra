#!/usr/bin/env python3
"""Parse LuLu rules.plist (NSKeyedArchiver binary plist) and output JSON.

LuLu stores firewall rules in NSKeyedArchiver format which can't be parsed
with simple XML/regex. This script uses Python's plistlib to deserialize
the binary plist and extract rule data.

Usage: python3 lulu-parser.py [/path/to/rules.plist]
Output: JSON array of { path, name, action, type } objects on stdout.
"""
import plistlib
import json
import sys


def resolve_uid(objects, uid):
    if hasattr(uid, "data"):
        idx = uid.data
    elif isinstance(uid, int):
        idx = uid
    else:
        return None
    if 0 <= idx < len(objects):
        return objects[idx]
    return None


def main():
    plist_path = (
        sys.argv[1] if len(sys.argv) > 1 else "/Library/Objective-See/LuLu/rules.plist"
    )

    with open(plist_path, "rb") as f:
        data = plistlib.load(f)

    objects = data.get("$objects", [])

    rules = []
    for obj in objects:
        if not isinstance(obj, dict):
            continue
        if "action" not in obj or "path" not in obj:
            continue

        path_val = resolve_uid(objects, obj.get("path"))
        action_val = resolve_uid(objects, obj.get("action"))
        type_val = resolve_uid(objects, obj.get("type"))

        if not isinstance(path_val, str):
            continue

        action_int = int(action_val) if isinstance(action_val, (int, float)) else 1
        type_int = int(type_val) if isinstance(type_val, (int, float)) else 0

        name = path_val.split("/")[-1] if "/" in path_val else path_val

        rules.append(
            {
                "path": path_val,
                "name": name,
                "action": "block" if action_int == 0 else "allow",
                "type": "system" if type_int == 1 else "user",
            }
        )

    json.dump(rules, sys.stdout)


if __name__ == "__main__":
    main()
