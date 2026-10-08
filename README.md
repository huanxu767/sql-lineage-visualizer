# Lineage Studio

一个基于 [sqllineage](https://github.com/reata/sqllineage) 的本机 SQL 血缘可视化工具。Python 调用解析引擎，浏览器界面负责交互和绘图，数据只在本机处理。

## 为什么选 Python + 本地 Web UI

- `sqllineage` 本身是 Python 包，直接调用 `LineageRunner`，不需要再维护命令行子进程和临时文件。
- 界面使用原生 HTML/CSS/JavaScript，不依赖 Node.js，Windows 和 macOS 的运行方式一致。
- 本地 HTTP 服务可以直接用浏览器访问，也能进一步用 PyInstaller 打包为桌面程序。

如果产品后续需要系统托盘、自动更新或原生窗口，可以在这套代码上加一层 Tauri 或 PyInstaller；解析逻辑和前端无需重写。

## 开发运行

要求 Python 3.9 或更高版本。

```bash
python -m venv .venv
# macOS / Linux
source .venv/bin/activate
# Windows PowerShell: .venv\Scripts\Activate.ps1

python -m pip install -r requirements.txt
python app.py
```

启动后会自动打开 `http://127.0.0.1:8765`。也可以手动访问这个地址。

- Windows：双击 `run_windows.bat`
- macOS：首次使用执行 `chmod +x run_mac.command`，之后双击 `run_mac.command`

## 打包为可执行文件（可选）

```bash
python -m pip install pyinstaller
pyinstaller --name LineageStudio --add-data "web:web" --onefile app.py
```

Windows 的 `--add-data` 分隔符使用分号：`--add-data "web;web"`。生成的文件在 `dist/` 目录。

## 已支持

- ANSI、MySQL、PostgreSQL、Hive、Spark SQL 方言
- 来源表、目标表、中间表统计
- 表级血缘关系图，可缩放和适应画布
- 字段级血缘映射
- SQL 解析错误提示
- 多条 SQL 语句（用分号分隔）
