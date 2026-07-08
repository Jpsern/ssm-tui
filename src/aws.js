const { spawn } = require('child_process');

function isAwsNotFoundError(error) {
  return Boolean(error && error.code === 'AWS_NOT_FOUND');
}

function runAwsStartSession(instance) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };

    if (instance.aws_profile) {
      env.AWS_PROFILE = instance.aws_profile;
    }

    if (instance.region) {
      env.AWS_REGION = instance.region;
    }

    const child = spawn('aws', ['ssm', 'start-session', '--target', instance.instance_id], {
      stdio: 'inherit',
      env,
    });

    child.once('error', (error) => {
      if (error && error.code === 'ENOENT') {
        const notFound = new Error('aws コマンドが見つかりません。');
        notFound.code = 'AWS_NOT_FOUND';
        reject(notFound);
        return;
      }

      reject(error);
    });

    child.once('close', (code) => {
      resolve(typeof code === 'number' ? code : 1);
    });
  });
}

module.exports = {
  isAwsNotFoundError,
  runAwsStartSession,
};
