import { spawn } from 'child_process';
import path from 'path';

console.log('[SHUTDOWN TEST] Starting Backend server process...');

const serverProcess = spawn('npx', ['ts-node', 'src/server.ts'], {
  cwd: path.resolve(__dirname, '../..'),
  shell: true,
  stdio: 'pipe',
});

let outputLog = '';

serverProcess.stdout.on('data', (data) => {
  const str = data.toString();
  outputLog += str;
  process.stdout.write(str);
});

serverProcess.stderr.on('data', (data) => {
  const str = data.toString();
  outputLog += str;
  process.stderr.write(str);
});

// Wait 3 seconds for server startup and MongoDB connection, then send SIGINT
setTimeout(() => {
  console.log('\n[SHUTDOWN TEST] Sending SIGINT signal to Backend process...');
  // Send SIGINT to process
  if (process.platform === 'win32') {
    // On Windows, child_process tree kill with SIGINT
    serverProcess.kill('SIGINT');
  } else {
    serverProcess.kill('SIGINT');
  }
}, 3500);

serverProcess.on('exit', (code, signal) => {
  console.log(`\n[SHUTDOWN TEST] Backend process exited cleanly. Code: ${code}, Signal: ${signal}`);
  process.exit(0);
});
