import { spawn, ChildProcessWithoutNullStreams, spawnSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';
import { TtsGenerateRequest, TtsGenerateResult } from '../../shared/types';

interface PendingRequest {
  resolve: (result: TtsGenerateResult) => void;
  reject: (error: Error) => void;
}

function resolvePython(): { cmd: string; prefix: string[] } {
  if (process.platform === 'win32') {
    const py = spawnSync('py', ['-3', '-c', 'print(1)'], { encoding: 'utf8', timeout: 8000, windowsHide: true });
    if (!py.error && py.status === 0) return { cmd: 'py', prefix: ['-3'] };
  }
  const python = spawnSync('python', ['-c', 'print(1)'], { encoding: 'utf8', timeout: 8000, windowsHide: true });
  if (!python.error && python.status === 0) return { cmd: 'python', prefix: [] };
  const python3 = spawnSync('python3', ['-c', 'print(1)'], { encoding: 'utf8', timeout: 8000, windowsHide: true });
  if (!python3.error && python3.status === 0) return { cmd: 'python3', prefix: [] };
  return { cmd: process.platform === 'win32' ? 'py' : 'python', prefix: process.platform === 'win32' ? ['-3'] : [] };
}

export class SupertonicBridge {
  private process: ChildProcessWithoutNullStreams | null = null;
  private buffer = '';
  private pending = new Map<string, PendingRequest>();
  private requestCounter = 0;
  private ready = false;
  private lastError = '';

  private ttsRoot(): string {
    const candidates = [
      path.join(process.resourcesPath ?? '', 'tts'),
      path.join(process.cwd(), 'tts'),
      path.resolve(__dirname, '../../tts'),
      path.join(app.getAppPath(), 'tts'),
    ];
    return candidates.find((candidate) => fs.existsSync(path.join(candidate, 'tts_worker.py'))) ?? candidates[0];
  }

  async ensureReady(): Promise<void> {
    if (this.ready && this.process) return;
    await this.startWorker();
  }

  private startWorker(): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finishOk = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      const finishErr = (err: Error) => {
        if (settled) return;
        settled = true;
        reject(err);
      };

      const root = this.ttsRoot();
      const scriptPath = path.join(root, 'tts_worker.py');
      const modelDir = path.resolve(root);

      if (!fs.existsSync(scriptPath)) {
        finishErr(new Error(`Bundled TTS worker missing at ${scriptPath}`));
        return;
      }

      const py = resolvePython();
      this.lastError = '';
      this.process = spawn(py.cmd, [...py.prefix, '-u', scriptPath, '--model-dir', modelDir], {
        cwd: root,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1' },
      });

      this.process.stdout.on('data', (chunk: Buffer) => {
        this.buffer += chunk.toString('utf-8');
        this.processBuffer(finishOk, finishErr);
      });

      this.process.stderr.on('data', (chunk: Buffer) => {
        this.lastError += chunk.toString('utf-8');
        console.error('[tts]', chunk.toString('utf-8'));
      });

      this.process.on('error', (err) => {
        this.ready = false;
        finishErr(new Error(`Cannot start Python (${py.cmd}): ${err.message}`));
      });

      this.process.on('exit', (code) => {
        const wasReady = this.ready;
        this.ready = false;
        this.process = null;
        if (!wasReady) {
          finishErr(new Error(this.lastError.trim() || `TTS worker exited (${code ?? 'unknown'})`));
        }
      });

      setTimeout(() => {
        if (!this.ready) {
          finishErr(
            new Error(
              this.lastError.trim() ||
                'TTS worker failed to start. Install Python 3 and the supertonic package.'
            )
          );
        }
      }, 45000);
    });
  }

  private processBuffer(
    onReady?: (value: void) => void,
    onError?: (error: Error) => void
  ): void {
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const data = JSON.parse(line) as Record<string, unknown>;
        if (data.status === 'ready') {
          this.ready = true;
          onReady?.();
          continue;
        }
        if (data.error && !data.id) {
          onError?.(new Error(String(data.error)));
          continue;
        }
        const id = String(data.id ?? '');
        const pending = this.pending.get(id);
        if (!pending) continue;
        this.pending.delete(id);
        if (data.success) {
          pending.resolve({
            success: true,
            outputPath: String(data.output),
            duration: Number(data.duration ?? 0),
          });
        } else {
          pending.resolve({ success: false, error: String(data.error ?? 'TTS error') });
        }
      } catch {
        // ignore
      }
    }
  }

  async generateSpeech(
    request: TtsGenerateRequest & { outputPath?: string }
  ): Promise<TtsGenerateResult> {
    try {
      await this.ensureReady();
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }

    if (!this.process?.stdin) {
      return { success: false, error: 'TTS worker is not running' };
    }

    const id = String(++this.requestCounter);
    const outputPath = request.outputPath ?? path.join(app.getPath('temp'), `tts-${id}.wav`);

    const payload = {
      id,
      text: request.text,
      voice: request.voice ?? 'F1',
      emotion: request.emotion ?? 'Calm',
      speed: request.speed ?? 1,
      pitch: request.pitch ?? 0,
      output: outputPath,
    };

    return new Promise((resolve) => {
      this.pending.set(id, { resolve, reject: () => undefined });
      this.process!.stdin!.write(JSON.stringify(payload) + '\n');
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          resolve({ success: false, error: 'TTS generation timed out' });
        }
      }, 60000);
    });
  }

  cancelGeneration(): void {
    for (const pending of this.pending.values()) {
      pending.resolve({ success: false, error: 'TTS generation cancelled' });
    }
    this.pending.clear();
    this.process?.kill();
    this.process = null;
    this.ready = false;
    this.buffer = '';
  }

  shutdown(): void {
    if (this.process?.stdin) {
      this.process.stdin.write(JSON.stringify({ action: 'stop' }) + '\n');
    }
    this.process?.kill();
    this.process = null;
    this.ready = false;
  }
}
