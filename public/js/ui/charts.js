// ─── CHART HELPERS ────────────────────────────────────────────────────────
function makeChart(id, type, labels, datasets, options) {
  destroyChart(id);
  const ctx = document.getElementById(id);
  if (!ctx) return;
  charts[id] = new Chart(ctx, { type, data: { labels, datasets }, options });
}

function destroyChart(id) {
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
}

function gridScales() {
  return {
    x: { grid: { color: '#2a3048' }, ticks: { color: '#8892b0' } },
    y: { grid: { color: '#2a3048' }, ticks: { color: '#8892b0' } }
  };
}

function chartOpts(title) {
  return {
    responsive: true, maintainAspectRatio: true,
    plugins: {
      legend: { display: false },
      title: title ? { display: true, text: title, color: '#8892b0', font: { size: 11 } } : { display: false },
      tooltip: { backgroundColor: '#1e2435', titleColor: '#e8eaf6', bodyColor: '#8892b0', borderColor: '#2a3048', borderWidth: 1 }
    },
    scales: gridScales()
  };
}

function pieOpts() {
  return {
    responsive: true, maintainAspectRatio: true,
    plugins: {
      legend: { labels: { color: '#8892b0', font: { size: 11 }, boxWidth: 14, padding: 12 }, position: 'bottom' },
      tooltip: { backgroundColor: '#1e2435', titleColor: '#e8eaf6', bodyColor: '#8892b0' }
    }
  };
}


// Expose functions to global scope
window.makeChart = makeChart;
window.destroyChart = destroyChart;
window.gridScales = gridScales;
window.chartOpts = chartOpts;
window.pieOpts = pieOpts;
