function normalizeOptionalString(value) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function validateConfig(parsed) {
  const errors = [];

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      ok: false,
      errors: ['設定ファイルの内容が不正です。'],
    };
  }

  if (!Object.prototype.hasOwnProperty.call(parsed, 'instances')) {
    errors.push('instances は必須です。');
    return { ok: false, errors };
  }

  if (!Array.isArray(parsed.instances)) {
    errors.push('instances は配列である必要があります。');
    return { ok: false, errors };
  }

  if (parsed.instances.length === 0) {
    errors.push('instances は空にできません。');
    return { ok: false, errors };
  }

  const normalizedInstances = [];

  parsed.instances.forEach((item, index) => {
    const pathPrefix = `instances[${index}]`;

    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors.push(`${pathPrefix} はオブジェクトである必要があります。`);
      return;
    }

    const name = typeof item.name === 'string' ? item.name.trim() : '';
    const instanceId = typeof item.instance_id === 'string' ? item.instance_id.trim() : '';

    if (name === '') {
      errors.push(`${pathPrefix}.name は必須です。`);
    }

    if (instanceId === '') {
      errors.push(`${pathPrefix}.instance_id は必須です。`);
    }

    normalizedInstances.push({
      name,
      instance_id: instanceId,
      group: normalizeOptionalString(item.group),
      description: normalizeOptionalString(item.description),
      aws_profile: normalizeOptionalString(item.aws_profile),
      region: normalizeOptionalString(item.region),
    });
  });

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    config: {
      instances: normalizedInstances,
    },
  };
}

module.exports = {
  validateConfig,
};
