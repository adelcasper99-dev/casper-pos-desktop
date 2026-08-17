#!/usr/bin/env python3
"""
Mem0 Dedicated Memory Engine for Antigravity Agent
Stores, searches, updates, and deletes persistent user memories, decisions, and system patterns across sessions.
Global Storage Path: C:/Users/TheExpert/.gemini/antigravity-ide/mem0_store.json
"""

import sys
import os
import json
import time
import uuid
import re
from pathlib import Path

GLOBAL_MEM0_FILE = Path(os.path.expanduser(r"~\.gemini\antigravity-ide\mem0_store.json"))

def load_store():
    if not GLOBAL_MEM0_FILE.exists():
        GLOBAL_MEM0_FILE.parent.mkdir(parents=True, exist_ok=True)
        return {"memories": [], "metadata": {"created_at": time.time(), "version": "1.0.0"}}
    try:
        with open(GLOBAL_MEM0_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {"memories": [], "metadata": {"created_at": time.time(), "version": "1.0.0"}}

def save_store(store):
    GLOBAL_MEM0_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(GLOBAL_MEM0_FILE, "w", encoding="utf-8") as f:
        json.dump(store, f, indent=2, ensure_ascii=False)

def add_memory(content, category="general", tags=None):
    store = load_store()
    tags = tags or []
    if isinstance(tags, str):
        tags = [t.strip() for t in tags.split(",") if t.strip()]

    # Check duplicate
    for m in store["memories"]:
        if m["content"].strip().lower() == content.strip().lower():
            m["updated_at"] = time.time()
            m["access_count"] = m.get("access_count", 0) + 1
            save_store(store)
            return f"Updated existing memory [{m['id']}]"

    entry = {
        "id": f"mem_{uuid.uuid4().hex[:8]}",
        "content": content.strip(),
        "category": category.strip().lower(),
        "tags": tags,
        "created_at": time.time(),
        "updated_at": time.time(),
        "access_count": 1
    }
    store["memories"].append(entry)
    save_store(store)
    return f"Memory stored successfully [{entry['id']}]"

def search_memory(query, category=None):
    store = load_store()
    query_words = set(re.findall(r'\w+', query.lower()))
    results = []

    for m in store["memories"]:
        if category and m["category"] != category.lower():
            continue
        
        content_text = f"{m['content']} {' '.join(m.get('tags', []))} {m.get('category', '')}".lower()
        content_words = set(re.findall(r'\w+', content_text))
        
        overlap = query_words.intersection(content_words)
        if overlap or not query_words:
            score = len(overlap) / (len(query_words) or 1)
            results.append((score, m))

    results.sort(key=lambda x: x[0], reverse=True)
    matched = [r[1] for r in results if r[0] > 0 or not query_words]
    return matched

def list_memories(category=None):
    store = load_store()
    memories = store["memories"]
    if category:
        memories = [m for m in memories if m["category"] == category.lower()]
    return memories

def delete_memory(memory_id):
    store = load_store()
    initial_len = len(store["memories"])
    store["memories"] = [m for m in store["memories"] if m["id"] != memory_id]
    if len(store["memories"]) < initial_len:
        save_store(store)
        return f"Memory [{memory_id}] deleted."
    return f"Memory [{memory_id}] not found."

def main():
    if len(sys.argv) < 2:
        print("Usage: mem0_engine.py [add|search|list|delete] <args>")
        sys.exit(1)

    cmd = sys.argv[1].lower()

    if cmd == "add":
        if len(sys.argv) < 3:
            print("Usage: mem0_engine.py add <content> [category] [tags]")
            sys.exit(1)
        content = sys.argv[2]
        category = sys.argv[3] if len(sys.argv) > 3 else "general"
        tags = sys.argv[4].split(",") if len(sys.argv) > 4 else []
        res = add_memory(content, category, tags)
        print(res)

    elif cmd == "search":
        query = sys.argv[2] if len(sys.argv) > 2 else ""
        results = search_memory(query)
        print(json.dumps(results, indent=2, ensure_ascii=False))

    elif cmd == "list":
        category = sys.argv[2] if len(sys.argv) > 2 else None
        results = list_memories(category)
        print(json.dumps(results, indent=2, ensure_ascii=False))

    elif cmd == "delete":
        if len(sys.argv) < 3:
            print("Usage: mem0_engine.py delete <memory_id>")
            sys.exit(1)
        res = delete_memory(sys.argv[2])
        print(res)

    else:
        print(f"Unknown command: {cmd}")

if __name__ == "__main__":
    main()
