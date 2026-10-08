"""Local web application for visualising SQL lineage with sqllineage."""

from __future__ import annotations

import json
import mimetypes
import os
import threading
import webbrowser
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from sqllineage.runner import LineageRunner


ROOT = Path(__file__).resolve().parent
WEB_ROOT = ROOT / "web"
HOST = os.environ.get("SQL_LINEAGE_HOST", "127.0.0.1")
PORT = int(os.environ.get("SQL_LINEAGE_PORT", "8765"))


def _name(value: Any) -> str:
    """Return a stable display name for sqllineage model objects."""
    return str(value).strip()


def _column_name(value: Any) -> str:
    return str(value).strip()


def analyze_sql(sql: str, dialect: str) -> dict[str, Any]:
    if not sql.strip():
        raise ValueError("请输入 SQL 后再开始分析。")

    runner = LineageRunner(sql, dialect=dialect or "ansi")
    source_tables = [_name(item) for item in runner.source_tables]
    target_tables = [_name(item) for item in runner.target_tables]
    intermediate_tables = [_name(item) for item in runner.intermediate_tables]

    # Use one node per table name and derive its strongest role from the parser output.
    roles: dict[str, str] = {}
    for item in source_tables:
        roles[item] = "source"
    for item in intermediate_tables:
        roles[item] = "intermediate"
    for item in target_tables:
        roles[item] = "target"

    nodes = [
        {"id": table, "label": table, "role": roles[table]}
        for table in sorted(roles, key=lambda value: (roles[value], value))
    ]

    edges: list[dict[str, str]] = []
    # sqllineage already computes statement-aware edges for Cytoscape output.
    # Keep a small fallback for older versions that do not expose that method.
    try:
        cytoscape = runner.to_cytoscape()
        edges = [
            {
                "source": str(item["data"]["source"]),
                "target": str(item["data"]["target"]),
                "kind": "table",
            }
            for item in cytoscape
            if item.get("data", {}).get("source") and item.get("data", {}).get("target")
        ]
    except (AttributeError, TypeError, KeyError):
        upstream = source_tables + intermediate_tables
        for source in upstream:
            for target in target_tables:
                if source != target:
                    edges.append({"source": source, "target": target, "kind": "table"})

    columns: list[dict[str, str]] = []
    for source_column, target_column in runner.get_column_lineage():
        source_table = _name(source_column.parent)
        target_table = _name(target_column.parent)
        source_name = _column_name(source_column)
        target_name = _column_name(target_column)
        columns.append(
            {
                "source": source_name,
                "target": target_name,
                "sourceTable": source_table,
                "targetTable": target_table,
            }
        )

    return {
        "nodes": nodes,
        "edges": edges,
        "columns": columns,
        "stats": {
            "sources": len(source_tables),
            "targets": len(target_tables),
            "intermediates": len(intermediate_tables),
            "columns": len(columns),
        },
        "dialect": dialect or "ansi",
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "LineageStudio/1.0"

    def _send_json(self, payload: dict[str, Any], status: int = HTTPStatus.OK) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self) -> None:  # noqa: N802 - required by BaseHTTPRequestHandler
        if urlparse(self.path).path != "/api/analyze":
            self._send_json({"error": "接口不存在"}, HTTPStatus.NOT_FOUND)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length) or b"{}")
            result = analyze_sql(str(payload.get("sql", "")), str(payload.get("dialect", "ansi")))
            self._send_json({"data": result})
        except json.JSONDecodeError:
            self._send_json({"error": "请求数据不是有效 JSON。"}, HTTPStatus.BAD_REQUEST)
        except Exception as exc:  # sqllineage exposes parser-specific exception types
            self._send_json({"error": str(exc) or "SQL 分析失败，请检查语句。"}, HTTPStatus.BAD_REQUEST)

    def do_GET(self) -> None:  # noqa: N802 - required by BaseHTTPRequestHandler
        path = urlparse(self.path).path
        if path == "/api/health":
            self._send_json({"status": "ok"})
            return
        if path == "/":
            path = "/index.html"
        file_path = (WEB_ROOT / path.lstrip("/")).resolve()
        if WEB_ROOT not in file_path.parents or not file_path.is_file():
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        content_type = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
        data = file_path.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, format: str, *args: Any) -> None:
        print(f"[{self.log_date_time_string()}] {format % args}")


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    url = f"http://{HOST}:{PORT}"
    print(f"Lineage Studio 已启动：{url}")
    print("按 Ctrl+C 停止服务")
    threading.Timer(0.4, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n正在停止...")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
