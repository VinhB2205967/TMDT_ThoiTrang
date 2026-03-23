(() => {
  const columnsInput = document.getElementById('sizeColumnsInput');
  const rowsTextarea = document.getElementById('sizeRowsTextarea');
  const table = document.getElementById('sizeGuideTable');
  const headRow = document.getElementById('sizeGuideTableHead');
  const body = document.getElementById('sizeGuideTableBody');
  const addRowBtn = document.getElementById('addSizeRowBtn');
  const clearBtn = document.getElementById('clearSizeRowsBtn');

  if (!columnsInput || !rowsTextarea || !table || !headRow || !body) return;

  function parseColumns(raw) {
    return String(raw || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function parseRows(raw, expectedColumns) {
    const lines = String(raw || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    return lines.map((line) => {
      const parts = line.split('|').map((part) => part.trim());
      const size = parts.shift() || '';
      const values = parts;

      while (values.length < expectedColumns) values.push('');
      if (values.length > expectedColumns) values.length = expectedColumns;

      return { size, values };
    });
  }

  function getColumns() {
    return parseColumns(columnsInput.value);
  }

  function buildLine(size, values) {
    return [String(size || '').trim(), ...values.map((v) => String(v || '').trim())]
      .join(' | ')
      .trim();
  }

  function syncTextareaFromTable() {
    const lines = [];
    const rows = body.querySelectorAll('tr');
    rows.forEach((row) => {
      const sizeInput = row.querySelector('input[data-role="size"]');
      const valueInputs = row.querySelectorAll('input[data-role="value"]');
      const size = String(sizeInput?.value || '').trim();
      const values = Array.from(valueInputs).map((input) => String(input.value || '').trim());
      if (!size && values.every((v) => !v)) return;
      lines.push(buildLine(size, values));
    });

    rowsTextarea.value = lines.join('\n');
  }

  function createCellInput(value, role, placeholder = '') {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'form-control form-control-sm';
    input.value = value || '';
    input.setAttribute('data-role', role);
    if (placeholder) input.placeholder = placeholder;
    input.addEventListener('input', syncTextareaFromTable);
    return input;
  }

  function addRow(data = null) {
    const columns = getColumns();
    const tr = document.createElement('tr');

    const tdSize = document.createElement('td');
    tdSize.appendChild(createCellInput(data?.size || '', 'size', 'VD: M'));
    tr.appendChild(tdSize);

    columns.forEach((_, idx) => {
      const td = document.createElement('td');
      td.appendChild(createCellInput(data?.values?.[idx] || '', 'value'));
      tr.appendChild(td);
    });

    const tdAction = document.createElement('td');
    tdAction.style.width = '80px';
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn btn-sm btn-outline-danger';
    removeBtn.textContent = 'Xóa';
    removeBtn.addEventListener('click', () => {
      tr.remove();
      syncTextareaFromTable();
    });
    tdAction.appendChild(removeBtn);
    tr.appendChild(tdAction);

    body.appendChild(tr);
  }

  function renderHeader() {
    const columns = getColumns();
    headRow.innerHTML = '';

    const thSize = document.createElement('th');
    thSize.textContent = 'Size';
    headRow.appendChild(thSize);

    columns.forEach((name) => {
      const th = document.createElement('th');
      th.textContent = name;
      headRow.appendChild(th);
    });

    const thAction = document.createElement('th');
    thAction.textContent = 'Thao tác';
    thAction.style.width = '80px';
    headRow.appendChild(thAction);
  }

  function renderFromTextarea() {
    const columns = getColumns();
    const rows = parseRows(rowsTextarea.value, columns.length);
    body.innerHTML = '';

    if (!rows.length) {
      addRow();
      return;
    }

    rows.forEach((row) => addRow(row));
    syncTextareaFromTable();
  }

  function refreshTableByColumns() {
    renderHeader();
    renderFromTextarea();
  }

  columnsInput.addEventListener('input', refreshTableByColumns);

  if (addRowBtn) {
    addRowBtn.addEventListener('click', () => {
      addRow();
      syncTextareaFromTable();
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      body.innerHTML = '';
      addRow();
      syncTextareaFromTable();
    });
  }

  const form = rowsTextarea.closest('form');
  if (form) {
    form.addEventListener('submit', () => {
      syncTextareaFromTable();
    });
  }

  refreshTableByColumns();
})();
