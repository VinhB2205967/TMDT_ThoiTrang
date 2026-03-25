(() => {
  const form = document.querySelector('#report-filters');
  const loading = document.querySelector('#reports-loading');
  const tableBody = document.querySelector('#report-table');
  const topProductsList = document.querySelector('#top-products');
  const topCustomersList = document.querySelector('#top-customers');
  const lossAlert = document.querySelector('#loss-alert');
  const dashboard = document.querySelector('.reports-dashboard');

  const chartRefs = {};
  let latestData = null;

  const currency = new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND'
  });

  const number = new Intl.NumberFormat('vi-VN');

  function setLoading(show) {
    if (!loading) return;
    loading.classList.toggle('d-none', !show);
  }

  function formatCurrency(value) {
    return currency.format(Number(value || 0));
  }

  function formatNumber(value) {
    return number.format(Number(value || 0));
  }

  function formatPercent(value) {
    if (value == null || Number.isNaN(value)) return '0%';
    return `${value.toFixed(1)}%`;
  }

  function toSafeNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function normalizeSeries(values) {
    if (!Array.isArray(values)) return [];
    return values.map(toSafeNumber);
  }

  function updateMetric(selector, value, formatter) {
    const el = document.querySelector(`[data-metric="${selector}"]`);
    if (!el) return;
    el.textContent = formatter ? formatter(value) : value;
  }

  function updateProfitStatus(profitValue) {
    const profitEl = document.querySelector('[data-metric="profit"]');
    const statusEl = document.querySelector('[data-metric="profitStatus"]');
    const isLoss = Number(profitValue || 0) < 0;

    if (profitEl) {
      profitEl.classList.toggle('text-danger', isLoss);
      profitEl.classList.toggle('text-success', !isLoss);
    }

    if (statusEl) {
      statusEl.textContent = isLoss ? 'Lỗ' : 'Lãi';
      statusEl.classList.toggle('text-danger', isLoss);
      statusEl.classList.toggle('text-success', !isLoss);
    }
  }

  function chartConfig(type, labels, dataSets) {
    return {
      type,
      data: {
        labels,
        datasets: dataSets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: type !== 'bar'
          }
        },
        scales: type === 'pie' ? {} : {
          y: {
            ticks: {
              callback: (value) => formatNumber(value)
            }
          }
        }
      }
    };
  }

  function renderChart(id, config) {
    const canvas = document.getElementById(id);
    if (!canvas) return;
    if (chartRefs[id]) {
      chartRefs[id].data = config.data;
      chartRefs[id].options = config.options;
      chartRefs[id].update();
      return;
    }
    chartRefs[id] = new Chart(canvas, config);
  }

  function updateCharts(charts) {
    if (!charts) return;

    const revenueLabels = Array.isArray(charts.revenueByMonth?.labels)
      ? charts.revenueByMonth.labels
      : [];
    const profitLabels = Array.isArray(charts.profitTrend?.labels)
      ? charts.profitTrend.labels
      : [];
    const topLabels = Array.isArray(charts.topProducts?.labels)
      ? charts.topProducts.labels
      : [];
    const compareLabels = Array.isArray(charts.revenueVsCost?.labels)
      ? charts.revenueVsCost.labels
      : [];

    renderChart(
      'chart-revenue',
      chartConfig('bar', revenueLabels, [
        {
          label: 'Doanh thu',
          data: normalizeSeries(charts.revenueByMonth?.data),
          backgroundColor: '#2563eb'
        }
      ])
    );

    renderChart(
      'chart-profit',
      chartConfig('line', profitLabels, [
        {
          label: 'Lợi nhuận',
          data: normalizeSeries(charts.profitTrend?.data),
          borderColor: '#22c55e',
          backgroundColor: 'rgba(34, 197, 94, 0.2)',
          tension: 0.35,
          fill: true
        }
      ])
    );

    renderChart(
      'chart-top-products',
      chartConfig('pie', topLabels, [
        {
          label: 'Top sản phẩm',
          data: normalizeSeries(charts.topProducts?.data),
          backgroundColor: ['#6366f1', '#22c55e', '#f97316', '#0ea5e9', '#f43f5e']
        }
      ])
    );

    renderChart(
      'chart-revenue-cost',
      chartConfig('line', compareLabels, [
        {
          label: 'Doanh thu',
          data: normalizeSeries(charts.revenueVsCost?.revenue),
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.2)',
          tension: 0.35,
          fill: true
        },
        {
          label: 'Chi phí',
          data: normalizeSeries(charts.revenueVsCost?.cost),
          borderColor: '#f97316',
          backgroundColor: 'rgba(249, 115, 22, 0.18)',
          tension: 0.35,
          fill: true
        }
      ])
    );
  }

  function updateTable(rows) {
    if (!tableBody) return;
    if (!rows || rows.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">Không có dữ liệu</td></tr>';
      return;
    }

    tableBody.innerHTML = rows
      .map((row) => {
        const date = row.orderDate ? new Date(row.orderDate).toLocaleDateString('vi-VN') : '—';
        const profitValue = toSafeNumber(row.profit);
        const profitClass = profitValue >= 0 ? 'text-success' : 'text-danger';

        return `
          <tr>
            <td class="fw-semibold">${row.orderCode}</td>
            <td>${date}</td>
            <td>${row.customerName || 'Khách lẻ'}</td>
            <td>${formatCurrency(row.revenue)}</td>
            <td>${formatCurrency(row.cost)}</td>
            <td class="${profitClass}">${formatCurrency(profitValue)}</td>
            <td><span class="badge ${row.statusClass}">${row.statusLabel}</span></td>
            <td><a class="btn btn-sm btn-outline-primary" href="${row.detailUrl}">Chi tiết</a></td>
          </tr>
        `;
      })
      .join('');
  }

  function updateLists(topProducts, topCustomers) {
    if (topProductsList) {
      if (!topProducts || !topProducts.length) {
        topProductsList.innerHTML = '<li class="list-group-item text-muted">Không có dữ liệu</li>';
      } else {
        topProductsList.innerHTML = topProducts
          .map((item) => `
            <li class="list-group-item d-flex justify-content-between">
              <span>${item.name}</span>
              <span class="fw-semibold">${formatNumber(item.qty)}</span>
            </li>
          `)
          .join('');
      }
    }

    if (topCustomersList) {
      if (!topCustomers || !topCustomers.length) {
        topCustomersList.innerHTML = '<li class="list-group-item text-muted">Không có dữ liệu</li>';
      } else {
        topCustomersList.innerHTML = topCustomers
          .map((item) => `
            <li class="list-group-item d-flex justify-content-between">
              <span>${item.name}</span>
              <span class="fw-semibold">${formatCurrency(item.revenue)}</span>
            </li>
          `)
          .join('');
      }
    }
  }

  function getFilters() {
    const data = new FormData(form);
    const params = new URLSearchParams();
    for (const [key, value] of data.entries()) {
      if (value) params.set(key, value);
    }
    return params.toString();
  }

  function getExportRows() {
    if (!latestData || !latestData.table) return [];
    if (Array.isArray(latestData.table.exportRows) && latestData.table.exportRows.length) {
      return latestData.table.exportRows;
    }
    return Array.isArray(latestData.table.rows) ? latestData.table.rows : [];
  }

  function getFilterSummaryText() {
    if (!form) return 'Theo bộ lọc hiện tại';

    const fields = [
      { key: 'fromDate', label: 'Từ ngày', type: 'date' },
      { key: 'toDate', label: 'Đến ngày', type: 'date' },
      { key: 'month', label: 'Tháng', type: 'raw' },
      { key: 'year', label: 'Năm', type: 'raw' },
      { key: 'category', label: 'Danh mục', type: 'raw' },
      { key: 'status', label: 'Trạng thái', type: 'selectLabel' }
    ];

    const segments = [];

    fields.forEach((field) => {
      const input = form.querySelector(`[name="${field.key}"]`);
      if (!input) return;

      if (field.type === 'selectLabel') {
        const label = input.options && input.selectedIndex >= 0
          ? String(input.options[input.selectedIndex].text || '').trim()
          : '';
        if (label && label.toLowerCase() !== 'tất cả' && label.toLowerCase() !== 'tat ca') {
          segments.push(`${field.label}: ${label}`);
        }
        return;
      }

      const rawValue = String(input.value || '').trim();
      if (!rawValue) return;

      if (field.type === 'date') {
        const date = new Date(rawValue);
        const safeDate = Number.isNaN(date.getTime()) ? rawValue : date.toLocaleDateString('vi-VN');
        segments.push(`${field.label}: ${safeDate}`);
      } else {
        segments.push(`${field.label}: ${rawValue}`);
      }
    });

    return segments.length ? segments.join(' | ') : 'Theo bộ lọc hiện tại';
  }

  function buildExcelColumnWidths(sheetData) {
    if (!Array.isArray(sheetData) || !sheetData.length) return [];

    const maxLens = [];

    sheetData.forEach((row) => {
      if (!Array.isArray(row)) return;
      row.forEach((cell, idx) => {
        const text = String(cell == null ? '' : cell);
        const lineLens = text.split(/\r?\n/).map((line) => line.length);
        const textLen = lineLens.length ? Math.max(...lineLens) : 0;
        maxLens[idx] = Math.max(maxLens[idx] || 10, textLen);
      });
    });

    return maxLens.map((len) => ({
      wch: Math.min(60, Math.max(12, len + 2))
    }));
  }

  async function fetchData() {
    if (!form) return;
    setLoading(true);

    try {
      const query = getFilters();
      const res = await fetch(`/admin/api/reports/data?${query}`);
      const payload = await res.json();
      const data = payload && payload.data ? payload.data : payload;

      if (!data || !data.success) throw new Error((data && data.message) || 'Error');
      latestData = data;

      updateMetric('totalRevenue', data.overview.totalRevenue, formatCurrency);
      updateMetric('totalOrders', data.overview.totalOrders, formatNumber);
      updateMetric('totalSold', data.overview.totalSold, formatNumber);
      updateMetric('profit', data.overview.profit, formatCurrency);
      updateMetric('profitMargin', data.overview.profitMargin, formatPercent);
      updateMetric('totalCost', data.overview.totalCost, formatCurrency);
      updateProfitStatus(data.overview.profit);

      const growthValue = data.advanced.growth;
      updateMetric('growth', growthValue, (value) => (value == null ? '0%' : `${value.toFixed(1)}%`));
      updateMetric('growthSub', data.advanced.previousRevenue, (value) => `Kỳ trước: ${formatCurrency(value)}`);

      if (lossAlert) {
        lossAlert.classList.toggle('d-none', !data.advanced.negativeProfit);
      }

      updateCharts(data.charts);
      updateTable(data.table.rows);
      updateLists(data.advanced.topProducts, data.advanced.topCustomers);
    } catch (err) {
      console.error('reports fetch error:', err);
    } finally {
      setLoading(false);
    }
  }

  function exportExcel() {
    if (!latestData || !window.XLSX) return;

    const rows = getExportRows();
    const totals = rows.reduce((acc, row) => {
      acc.revenue += toSafeNumber(row && row.revenue);
      acc.cost += toSafeNumber(row && row.cost);
      acc.profit += toSafeNumber(row && row.profit);
      return acc;
    }, { revenue: 0, cost: 0, profit: 0 });

    const sheetData = [
      ['Mã đơn', 'Ngày tạo', 'Khách hàng', 'Tổng tiền', 'Chi phí', 'Lãi/Lỗ', 'Trạng thái']
    ];

    rows.forEach((row) => {
      sheetData.push([
        row.orderCode,
        row.orderDate ? new Date(row.orderDate).toLocaleDateString('vi-VN') : '',
        row.customerName,
        row.revenue,
        row.cost,
        row.profit,
        row.statusLabel
      ]);
    });

    if (rows.length > 0) {
      sheetData.push([]);
      sheetData.push([
        'Tổng',
        '',
        `${rows.length} đơn`,
        totals.revenue,
        totals.cost,
        totals.profit,
        ''
      ]);
    }

    const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
    worksheet['!cols'] = buildExcelColumnWidths(sheetData);

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'BaoCao');
    XLSX.writeFile(workbook, 'bao-cao-ban-hang.xlsx');
  }

  function exportPdf() {
    if (!latestData || !window.pdfMake) return;

    const rows = getExportRows();
    const tableRows = rows.map((row) => ([
      { text: String(row.orderCode || ''), noWrap: true },
      row.orderDate ? new Date(row.orderDate).toLocaleDateString('vi-VN') : '',
      row.customerName || '',
      formatCurrency(row.revenue),
      formatCurrency(row.cost),
      formatCurrency(row.profit),
      row.statusLabel || ''
    ]));

    const docDefinition = {
      pageSize: 'A4',
      pageOrientation: 'landscape',
      defaultStyle: {
        font: 'Roboto',
        fontSize: 10
      },
      content: [
        { text: 'Báo cáo thống kê bán hàng', style: 'title' },
        { text: getFilterSummaryText(), style: 'filter' },
        {
          table: {
            headerRows: 1,
            dontBreakRows: true,
            widths: [95, 65, '*', 75, 70, 70, 80],
            body: [
              ['Mã đơn', 'Ngày tạo', 'Khách hàng', 'Tổng tiền', 'Chi phí', 'Lãi/Lỗ', 'Trạng thái'],
              ...tableRows
            ]
          },
          layout: 'lightHorizontalLines'
        }
      ],
      styles: {
        title: {
          fontSize: 16,
          bold: true,
          margin: [0, 0, 0, 6]
        },
        filter: {
          fontSize: 9,
          color: '#475569',
          margin: [0, 0, 0, 10]
        }
      }
    };

    window.pdfMake.createPdf(docDefinition).download('bao-cao-ban-hang.pdf');
  }

  function attachActions() {
    const excelBtn = document.querySelector('#btn-export-excel');
    const pdfBtn = document.querySelector('#btn-export-pdf');
    const printBtn = document.querySelector('#btn-print');

    if (excelBtn) excelBtn.addEventListener('click', exportExcel);
    if (pdfBtn) pdfBtn.addEventListener('click', exportPdf);
    if (printBtn) printBtn.addEventListener('click', () => window.print());
  }

  function initDefaultStatus() {
    if (!dashboard || !form) return;
    const status = dashboard.getAttribute('data-default-status');
    const statusSelect = form.querySelector('select[name="status"]');
    if (statusSelect && status && (statusSelect.value === '' || statusSelect.value === 'all')) {
      statusSelect.value = status;
    }
  }

  if (form) {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      fetchData();
    });
  }

  initDefaultStatus();
  attachActions();
  fetchData();
})();
