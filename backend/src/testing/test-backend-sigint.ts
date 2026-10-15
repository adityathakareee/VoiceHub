import { spawn } from 'child_process';

console.log('[BACKEND SHUTDOWN TEST] Spawning node backend process...');

const child = spawn('node', ['dist/server.js'], {
  stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
});

child.stdout?.on('data', (chunk) => {
  const line = chunk.toString();
  process.stdout.write(line);

  // Once backend is running and MongoDB connected, trigger SIGINT signal
  if (line.includes('Backend API server running successfully')) {
    console.log('[BACKEND SHUTDOWN TEST] Server is running & MongoDB connected. Sending SIGINT...');
    child.kill('SIGINT');
  }
});

child.stderr?.on('data', (chunk) => {
  process.stderr.write(chunk.toString());
});

child.on('exit', (code, signal) => {
  console.log(`[BACKEND SHUTDOWN TEST] Backend process terminated. Code: ${code}, Signal: ${signal}`);
  process.exit(0);
});
