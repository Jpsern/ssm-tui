const readline = require('readline');

function isCancellationError(error) {
  return Boolean(error && error.code === 'SELECTION_CANCELLED');
}

function renderList(instances, selectedIndex) {
  const maxNameLength = instances.reduce((max, item) => Math.max(max, item.name.length), 0);
  const lines = ['? 接続先を選択してください', ''];

  instances.forEach((instance, index) => {
    const pointer = index === selectedIndex ? '❯' : ' ';
    const name = instance.name.padEnd(maxNameLength, ' ');
    const suffix = instance.description ? `  ${instance.description}` : '';
    lines.push(`${pointer} ${name}${suffix}`);
  });

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
    ? 'WARNING: production 環境への接続です。'
    : '以下の接続先に接続します。';

  const lines = [title, ''];
  lines.push(`Name: ${instance.name}`);
  lines.push(`Instance ID: ${instance.instance_id}`);
  if (instance.group) {
    lines.push(`Group: ${instance.group}`);
  }
  if (instance.description) {
    lines.push(`Description: ${instance.description}`);
  }
  if (instance.aws_profile) {
    lines.push(`Profile: ${instance.aws_profile}`);
  }
  if (instance.region) {
    lines.push(`Region: ${instance.region}`);
  }
  lines.push('');
  lines.push(isProduction ? '本当に接続しますか？ (y/N)' : '接続しますか？ (y/N)');

  console.log(lines.join('\n'));

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
