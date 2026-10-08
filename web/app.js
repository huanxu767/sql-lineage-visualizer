const sampleSql = `INSERT INTO analytics.daily_sales (order_id, customer_name)
SELECT o.id, c.name
FROM raw.orders o
JOIN raw.customers c ON o.customer_id = c.id
WHERE o.status = 'paid';`;

const $ = (id) => document.getElementById(id);
const state = { zoom: 1, data: null };

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function updateLineNumbers() {
  const count = Math.max(1, $('sqlInput').value.split('\n').length);
  $('lineNumbers').textContent = Array.from({ length: count }, (_, i) => i + 1).join('\n');
}

function showError(message) { $('errorBox').textContent = message; $('errorBox').hidden = !message; }

function setStats(stats) {
  $('sourceCount').textContent = stats.sources;
  $('targetCount').textContent = stats.targets;
  $('intermediateCount').textContent = stats.intermediates;
  $('columnCount').textContent = stats.columns;
}

function renderTableList(nodes) {
  $('tableCount').textContent = `${nodes.length} 张`;
  $('tableList').innerHTML = nodes.length ? nodes.map((node) => `<div class="table-item"><div class="table-icon ${node.role}">${node.role === 'target' ? '↗' : node.role === 'intermediate' ? '◇' : '□'}</div><div><strong title="${escapeHtml(node.label)}">${escapeHtml(node.label)}</strong><small>${node.role === 'target' ? '目标表' : node.role === 'intermediate' ? '中间表' : '来源表'}</small></div></div>`).join('') : '<div class="list-placeholder">未识别到数据表</div>';
}

function renderColumns(columns) {
  $('columnSummary').textContent = `${columns.length} 条映射`;
  $('columnBody').innerHTML = columns.length ? columns.map((item) => `<tr><td><span class="mono">${escapeHtml(item.source)}</span></td><td class="arrow">→</td><td><span class="mono">${escapeHtml(item.target)}</span></td></tr>`).join('') : '<tr><td colspan="3" class="list-placeholder">未识别到字段级映射</td></tr>';
}

function nodeLayout(nodes) {
  const groups = { source: nodes.filter((n) => n.role === 'source'), intermediate: nodes.filter((n) => n.role === 'intermediate'), target: nodes.filter((n) => n.role === 'target') };
  const positions = {};
  const lanes = [['source', 145], ['intermediate', 450], ['target', 755]];
  Object.entries(groups).forEach(([role, items]) => {
    const gap = 78; const total = (items.length - 1) * gap; const start = 250 - total / 2;
    items.forEach((node, index) => { positions[node.id] = { x: lanes.find((lane) => lane[0] === role)[1], y: start + index * gap, role }; });
  });
  return positions;
}

function renderGraph(data) {
  const svg = $('graphSvg'); const layer = $('graphLayer');
  const positions = nodeLayout(data.nodes); const parts = [];
  data.edges.forEach((edge) => {
    const from = positions[edge.source]; const to = positions[edge.target]; if (!from || !to) return;
    const startX = from.x + 88; const endX = to.x - 88; const curve = Math.max(30, (endX - startX) * .45);
    parts.push(`<path class="edge" d="M ${startX} ${from.y} C ${startX + curve} ${from.y}, ${endX - curve} ${to.y}, ${endX} ${to.y}"/>`);
  });
  data.nodes.forEach((node) => {
    const p = positions[node.id]; const label = node.label.length > 25 ? `${node.label.slice(0, 23)}…` : node.label;
    parts.push(`<g class="graph-node ${node.role}" transform="translate(${p.x - 88},${p.y - 27})"><rect width="176" height="54" rx="6"/><rect class="node-bar" width="3" height="54" rx="2"/><text class="node-role" x="14" y="18">${node.role === 'target' ? 'TARGET' : node.role === 'intermediate' ? 'INTERMEDIATE' : 'SOURCE'}</text><text class="node-label" x="14" y="37">${escapeHtml(label)}</text></g>`);
  });
  layer.innerHTML = parts.join(''); $('emptyState').style.display = data.nodes.length ? 'none' : 'flex'; svg.setAttribute('viewBox', '0 0 900 500'); state.zoom = 1; applyZoom();
}

function applyZoom() { $('graphLayer').setAttribute('transform', `translate(${450 - 450 * state.zoom} ${250 - 250 * state.zoom}) scale(${state.zoom})`); $('zoomReadout').textContent = `${Math.round(state.zoom * 100)}%`; }

async function analyze() {
  const sql = $('sqlInput').value.trim(); if (!sql) { showError('请输入 SQL 后再开始分析。'); return; }
  showError(''); $('analyzeButton').disabled = true; $('analyzeButton').innerHTML = '<span class="button-icon">◌</span>分析中…';
  try {
    const response = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sql, dialect: $('dialect').value }) });
    const payload = await response.json(); if (!response.ok) throw new Error(payload.error || 'SQL 分析失败');
    state.data = payload.data; setStats(state.data.stats); renderTableList(state.data.nodes); renderColumns(state.data.columns); renderGraph(state.data);
  } catch (error) { showError(error.message); } finally { $('analyzeButton').disabled = false; $('analyzeButton').innerHTML = '<span class="button-icon">↗</span>开始分析'; }
}

$('sampleButton').addEventListener('click', () => { $('sqlInput').value = sampleSql; updateLineNumbers(); analyze(); });
$('analyzeButton').addEventListener('click', analyze); $('sqlInput').addEventListener('input', updateLineNumbers); $('sqlInput').addEventListener('keydown', (event) => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') analyze(); });
$('zoomIn').addEventListener('click', () => { state.zoom = Math.min(1.6, state.zoom + .1); applyZoom(); }); $('zoomOut').addEventListener('click', () => { state.zoom = Math.max(.6, state.zoom - .1); applyZoom(); }); $('fitButton').addEventListener('click', () => { state.zoom = 1; applyZoom(); });
$('sqlInput').value = sampleSql; updateLineNumbers();
