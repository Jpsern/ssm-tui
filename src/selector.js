const readline = require('readline');

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  inverse: '\x1b[7m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[92m',
  black: '\x1b[30m',
  bgGreen: '\x1b[42m',
};

function supportsColor() {
  return Boolean(process.stdout.isTTY);
}

function paint(text, code) {
  if (!supportsColor() || !code) {
    return text;
  }

  return `${code}${text}${ANSI.reset}`;
}

function charWidth(codePoint) {
  if (codePoint === 0) {
    return 0;
  }

  if (codePoint < 32 || (codePoint >= 0x7f && codePoint < 0xa0)) {
    return 0;
  }

  if (
    codePoint >= 0x1100 && (
      codePoint <= 0x115f ||
      codePoint === 0x2329 ||
      codePoint === 0x232a ||
      (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f) ||
      (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
      (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
      (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
      (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
      (codePoint >= 0xff00 && codePoint <= 0xff60) ||
      (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
      (codePoint >= 0x1f300 && codePoint <= 0x1f64f) ||
      (codePoint >= 0x1f900 && codePoint <= 0x1f9ff)
    )
  ) {
    return 2;
  }

  return 1;
}

function displayWidth(text) {
  let width = 0;
  for (const char of text.replace(/\x1b\[[0-9;]*m/g, '')) {
    width += charWidth(char.codePointAt(0));
  }
  return width;
}

function visibleWidth(text) {
  return displayWidth(text);
}

function truncateAnsi(text, width) {
  if (width <= 0) {
    return '';
  }

  const plainWidth = displayWidth(text);
  if (plainWidth <= width) {
    return text;
  }

  if (width === 1) {
    return '…';
  }

  const target = width - 1;
  const tokens = text.match(/\x1b\[[0-9;]*m|./gu) || [];
  let seen = 0;
  let result = '';

  for (const token of tokens) {
    if (token.startsWith('\x1b[')) {
      result += token;
      continue;
    }

    const tokenWidth = charWidth(token.codePointAt(0));
    if (seen + tokenWidth > target) {
      break;
    }

    result += token;
    seen += tokenWidth;
  }

  return `${result}…`;
}

function fitLine(text, width) {
  return truncateAnsi(text, width);
}

function padLine(text, width) {
  const current = displayWidth(text);
  if (current >= width) {
    return text;
  }

  return `${text}${' '.repeat(width - current)}`;
}

function box(lines, title) {
  const content = [];
  if (title) {
    content.push(title);
  }
  content.push(...lines);

  const width = content.reduce((max, line) => Math.max(max, visibleWidth(line)), 0);
  const top = `┌${'─'.repeat(width + 2)}┐`;
  const bottom = `└${'─'.repeat(width + 2)}┘`;
  const body = content.map((line) => `│ ${line}${' '.repeat(width - visibleWidth(line))} │`);
  return [top, ...body, bottom].join('\n');
}

function getDetailLines(instance) {
  const lines = [
    `${paint('Name', ANSI.dim)}: ${instance.name}`,
    `${paint('Instance ID', ANSI.dim)}: ${instance.instance_id}`,
  ];

  if (instance.group) {
    lines.push(`${paint('Group', ANSI.dim)}: ${instance.group}`);
  }
  if (instance.description) {
    lines.push(`${paint('Description', ANSI.dim)}: ${instance.description}`);
  }
  if (instance.aws_profile) {
    lines.push(`${paint('Profile', ANSI.dim)}: ${instance.aws_profile}`);
  }
  if (instance.region) {
    lines.push(`${paint('Region', ANSI.dim)}: ${instance.region}`);
  }

  return lines;
}

function normalizeSearchText(text) {
  return text.trim().toLowerCase();
}

function matchesSearch(instance, query) {
  if (!query) {
    return true;
  }

  const haystack = `${instance.name} ${instance.description ?? ''}`.toLowerCase();
  return haystack.includes(query);
}

function buildFilteredEntries(instances, query) {
  const normalizedQuery = normalizeSearchText(query);

  return instances
    .map((instance, index) => ({ instance, index }))
    .filter((entry) => matchesSearch(entry.instance, normalizedQuery));
}

function renderInstanceRow(instance, index, selectedIndex, terminalWidth) {
  const isSelected = index === selectedIndex;
  const pointer = '❯';
  const parts = [instance.name];

  if (instance.description) {
    parts.push(`  ${instance.description}`);
  }

  if (instance.group) {
    parts.push(`  [${instance.group}]`);
  }

  const row = `${pointer} ${parts.join('')}`;
  if (isSelected) {
    return paint(padLine(fitLine(row, terminalWidth), terminalWidth), `${ANSI.bgGreen}${ANSI.black}`);
  }

  return fitLine(`  ${parts.join('')}`, terminalWidth);
}

function computeWindow(total, selectedIndex, rows) {
  if (total <= rows) {
    return { start: 0, end: total };
  }

  const half = Math.floor(rows / 2);
  let start = Math.max(0, selectedIndex - half);
  let end = start + rows;

  if (end > total) {
    end = total;
    start = Math.max(0, end - rows);
  }

  return { start, end };
}

function computeVisibleWindow(total, selectedIndex, availableRows) {
  let rows = Math.max(1, availableRows);

  for (let iteration = 0; iteration < 3; iteration += 1) {
    const window = computeWindow(total, selectedIndex, rows);
    const overflowLines = (window.start > 0 ? 1 : 0) + (window.end < total ? 1 : 0);
    const nextRows = Math.max(1, availableRows - overflowLines);

    if (nextRows === rows) {
      return { rows, ...window };
    }

    rows = nextRows;
  }

  const window = computeWindow(total, selectedIndex, rows);
  return { rows, ...window };
}

function renderProgressBar(selectedIndex, total, width = 18) {
  if (total <= 1) {
    return paint(`[${'■'.repeat(width)}]`, ANSI.dim);
  }

  const ratio = selectedIndex / (total - 1);
  const filled = Math.max(1, Math.min(width, Math.round(ratio * width) + 1));
  const empty = width - filled;
  return `${paint('[' + '■'.repeat(filled), ANSI.green)}${'□'.repeat(empty)}]`;
}

function renderHeader(selectedIndex, total, query, isSearching) {
  const title = paint('接続先を選択してください', ANSI.bold);
  const normalizedQuery = normalizeSearchText(query);
  const visibleCount = total === 0 ? 0 : selectedIndex + 1;
  const lines = [
    `${paint('操作', ANSI.dim)}: ${paint('↑↓ / jk', ANSI.green)} ${paint('Enter', ANSI.green)} ${paint('Ctrl-C', ANSI.green)} ${paint('/', ANSI.green)}${paint('検索', ANSI.dim)}`,
    `${paint('件数', ANSI.dim)}: ${visibleCount}/${total}`,
  ];

  if (isSearching || normalizedQuery) {
    lines.push(`${paint('検索', ANSI.dim)}: /${normalizedQuery}${isSearching ? paint('  (入力中)', ANSI.dim) : ''}`);
  }

  return {
    text: box(lines, `${title} ${paint('・', ANSI.dim)} ${renderProgressBar(selectedIndex, total, 12)}`),
    height: lines.length + 3,
  };
}

function isCancellationError(error) {
  return Boolean(error && error.code === 'SELECTION_CANCELLED');
}

function renderList(instances, state) {
  const { selectedIndex, query, isSearching } = state;
  const terminalWidth = process.stdout.columns || 80;
  const terminalHeight = process.stdout.rows || 24;
  const filteredEntries = buildFilteredEntries(instances, query);
  const selectedEntry = filteredEntries[selectedIndex];
  const selected = selectedEntry ? selectedEntry.instance : null;
  const detailLines = selected ? getDetailLines(selected) : [];
  const detailBoxHeight = selected ? detailLines.length + 3 : 0;
  const header = renderHeader(selectedIndex, filteredEntries.length, query, isSearching);
  const availableRows = Math.max(1, terminalHeight - header.height - detailBoxHeight);
  const { start, end } = computeVisibleWindow(filteredEntries.length, selectedIndex, availableRows);
  const lines = [header.text, ''];

  if (filteredEntries.length === 0) {
    lines.push(paint('該当する接続先がありません。', ANSI.dim));
  } else {
    if (start > 0) {
      lines.push(paint(`... 上に ${start} 件`, ANSI.dim));
    }

    for (let index = start; index < end; index += 1) {
      const entry = filteredEntries[index];
      lines.push(renderInstanceRow(entry.instance, index, selectedIndex, terminalWidth));
    }

    if (end < filteredEntries.length) {
      lines.push(paint(`... 下に ${filteredEntries.length - end} 件`, ANSI.dim));
    }
  }

  if (selected) {
    lines.push('');
    lines.push(box(detailLines.map((line) => fitLine(line, terminalWidth - 4))));
  }

  return lines.join('\n');
}

function selectInstance(instances) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return Promise.reject(new Error('対話式端末で実行してください。'));
  }

  return new Promise((resolve, reject) => {
    let query = '';
    let isSearching = false;
    let selectedIndex = 0;
    let filteredEntries = buildFilteredEntries(instances, query);
    let settled = false;

    const syncSelection = (keepSelection = true) => {
      const previousSelectedInstance = keepSelection ? filteredEntries[selectedIndex]?.instance : null;
      filteredEntries = buildFilteredEntries(instances, query);

      if (filteredEntries.length === 0) {
        selectedIndex = 0;
        return;
      }

      if (previousSelectedInstance) {
        const nextIndex = filteredEntries.findIndex((entry) => entry.instance === previousSelectedInstance);
        if (nextIndex >= 0) {
          selectedIndex = nextIndex;
          return;
        }
      }

      selectedIndex = Math.min(selectedIndex, filteredEntries.length - 1);
    };

    const cleanup = () => {
      process.stdin.off('keypress', onKeypress);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      process.stdin.pause();
      process.stdout.write('\x1b[?25h');
    };

    const finish = (value, error) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();

      if (error) {
        reject(error);
        return;
      }

      resolve(value);
    };

    const draw = () => {
      process.stdout.write('\x1b[2J\x1b[H');
      process.stdout.write(renderList(instances, { selectedIndex, query, isSearching }));
      process.stdout.write('\n');
    };

    const onKeypress = (_, key) => {
      if (!key) {
        return;
      }

      if (isSearching) {
        if (key.name === 'return') {
          isSearching = false;
          draw();
          return;
        }

        if (key.name === 'escape') {
          isSearching = false;
          draw();
          return;
        }

        if (key.name === 'backspace') {
          query = query.slice(0, -1);
          syncSelection();
          draw();
          return;
        }

        if (!key.ctrl && !key.meta && typeof key.sequence === 'string' && key.sequence.length === 1) {
          query += key.sequence;
          syncSelection();
          draw();
          return;
        }
      }

      if (key.name === 'up') {
        if (filteredEntries.length > 0) {
          selectedIndex = selectedIndex === 0 ? filteredEntries.length - 1 : selectedIndex - 1;
        }
        draw();
        return;
      }

      if (key.name === 'down') {
        if (filteredEntries.length > 0) {
          selectedIndex = selectedIndex === filteredEntries.length - 1 ? 0 : selectedIndex + 1;
        }
        draw();
        return;
      }

      if (key.name === 'pageup') {
        if (filteredEntries.length > 0) {
          selectedIndex = Math.max(0, selectedIndex - listPageSize());
        }
        draw();
        return;
      }

      if (key.name === 'pagedown') {
        if (filteredEntries.length > 0) {
          selectedIndex = Math.min(filteredEntries.length - 1, selectedIndex + listPageSize());
        }
        draw();
        return;
      }

      if (key.name === 'home') {
        if (filteredEntries.length > 0) {
          selectedIndex = 0;
        }
        draw();
        return;
      }

      if (key.name === 'end') {
        if (filteredEntries.length > 0) {
          selectedIndex = filteredEntries.length - 1;
        }
        draw();
        return;
      }

      if (key.name === 'j' && !key.ctrl && !key.meta) {
        if (filteredEntries.length > 0) {
          selectedIndex = selectedIndex === filteredEntries.length - 1 ? 0 : selectedIndex + 1;
        }
        draw();
        return;
      }

      if (key.name === 'k' && !key.ctrl && !key.meta) {
        if (filteredEntries.length > 0) {
          selectedIndex = selectedIndex === 0 ? filteredEntries.length - 1 : selectedIndex - 1;
        }
        draw();
        return;
      }

      if (key.name === 'return') {
        if (isSearching) {
          isSearching = false;
          draw();
          return;
        }

        const selectedEntry = filteredEntries[selectedIndex];
        if (selectedEntry) {
          finish(selectedEntry.instance);
        }
        return;
      }

      if (key.sequence === '/' && !key.ctrl && !key.meta) {
        isSearching = true;
        query = '';
        selectedIndex = 0;
        syncSelection(false);
        draw();
        return;
      }

      if (key.name === 'c' && key.ctrl) {
        const error = new Error('接続がキャンセルされました。');
        error.code = 'SELECTION_CANCELLED';
        finish(null, error);
      }
    };

    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdout.write('\x1b[?25l');
    process.stdin.on('keypress', onKeypress);
    draw();
  });
}

function listPageSize() {
  const terminalHeight = process.stdout.rows || 24;
  return Math.max(1, terminalHeight - 8);
}

function confirmConnection(instance) {
  const isProduction = typeof instance.group === 'string' && ['production', 'prod'].includes(instance.group.toLowerCase());
  const title = isProduction
    ? paint('WARNING: production 環境への接続です。', ANSI.red + ANSI.bold)
    : paint('以下の接続先に接続します。', ANSI.bold);
  const lines = [
    `${paint('Name', ANSI.dim)}: ${instance.name}`,
    `${paint('Instance ID', ANSI.dim)}: ${instance.instance_id}`,
  ];
  if (instance.group) {
    lines.push(`${paint('Group', ANSI.dim)}: ${instance.group}`);
  }
  if (instance.description) {
    lines.push(`${paint('Description', ANSI.dim)}: ${instance.description}`);
  }
  if (instance.aws_profile) {
    lines.push(`${paint('Profile', ANSI.dim)}: ${instance.aws_profile}`);
  }
  if (instance.region) {
    lines.push(`${paint('Region', ANSI.dim)}: ${instance.region}`);
  }
  lines.push('');
  lines.push(isProduction ? paint('本当に接続しますか？ (y/N)', ANSI.yellow) : '接続しますか？ (y/N)');

  process.stdout.write('\x1b[2J\x1b[H');
  console.log(box(lines, title));

  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.on('SIGINT', () => {
      rl.close();
      resolve(false);
    });

    rl.question('', (answer) => {
      rl.close();
      const accepted = answer.trim() === 'y' || answer.trim() === 'Y';
      resolve(accepted);
    });
  });
}

module.exports = {
  confirmConnection,
  isCancellationError,
  selectInstance,
};
