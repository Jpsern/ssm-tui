const readline = require('readline');

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  inverse: '\x1b[7m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
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

function visibleWidth(text) {
  return text.replace(/\x1b\[[0-9;]*m/g, '').length;
}

function truncateAnsi(text, width) {
  if (width <= 0) {
    return '';
  }

  const plainWidth = visibleWidth(text);
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

    if (seen >= target) {
      break;
    }

    result += token;
    seen += 1;
  }

  return `${result}…`;
}

function fitLine(text, width) {
  return truncateAnsi(text, width);
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

function renderInstanceRow(instance, index, selectedIndex, terminalWidth) {
  const isSelected = index === selectedIndex;
  const pointer = isSelected ? paint('❯', ANSI.cyan) : ' ';
  const parts = [instance.name];

  if (instance.description) {
    parts.push(paint(`  ${instance.description}`, ANSI.dim));
  }

  if (instance.group) {
    parts.push(paint(`  [${instance.group}]`, ANSI.dim));
  }

  const row = `${pointer} ${parts.join('')}`;
  return fitLine(isSelected ? paint(row, ANSI.inverse) : row, terminalWidth);
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

function isCancellationError(error) {
  return Boolean(error && error.code === 'SELECTION_CANCELLED');
}

function renderList(instances, selectedIndex) {
  const terminalWidth = process.stdout.columns || 80;
  const terminalHeight = process.stdout.rows || 24;
  const selected = instances[selectedIndex];
  const detailLines = selected ? getDetailLines(selected) : [];
  const detailBoxHeight = selected ? detailLines.length + 3 : 0;
  const headerLines = 3;
  const listRows = Math.max(1, terminalHeight - headerLines - detailBoxHeight);
  const { start, end } = computeWindow(instances.length, selectedIndex, listRows);
  const lines = [
    paint(`? 接続先を選択してください (${selectedIndex + 1}/${instances.length})`, ANSI.bold),
    paint('↑↓/k j で移動  Enter で決定  Ctrl-C で終了', ANSI.dim),
    '',
  ];

  if (start > 0) {
    lines.push(paint(`... 上に ${start} 件`, ANSI.dim));
  }

  for (let index = start; index < end; index += 1) {
    lines.push(renderInstanceRow(instances[index], index, selectedIndex, terminalWidth));
  }

  if (end < instances.length) {
    lines.push(paint(`... 下に ${instances.length - end} 件`, ANSI.dim));
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
    let selectedIndex = 0;
    let settled = false;

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
      process.stdout.write(renderList(instances, selectedIndex));
      process.stdout.write('\n');
    };

    const onKeypress = (_, key) => {
      if (!key) {
        return;
      }

      if (key.name === 'up') {
        selectedIndex = selectedIndex === 0 ? instances.length - 1 : selectedIndex - 1;
        draw();
        return;
      }

      if (key.name === 'down') {
        selectedIndex = selectedIndex === instances.length - 1 ? 0 : selectedIndex + 1;
        draw();
        return;
      }

      if (key.name === 'j' && !key.ctrl && !key.meta) {
        selectedIndex = selectedIndex === instances.length - 1 ? 0 : selectedIndex + 1;
        draw();
        return;
      }

      if (key.name === 'k' && !key.ctrl && !key.meta) {
        selectedIndex = selectedIndex === 0 ? instances.length - 1 : selectedIndex - 1;
        draw();
        return;
      }

      if (key.name === 'return') {
        finish(instances[selectedIndex]);
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
