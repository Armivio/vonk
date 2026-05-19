/**
 * Stops all Node processes running this project's bot (Windows).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PID_FILE = path.join(ROOT, '.bot.pid');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function readPid() {
  try {
    return parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
  } catch {
    return null;
  }
}

function isRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function killWindowsBotProcesses() {
  const root = ROOT.replace(/'/g, "''");
  const cmd = `
    Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
      Where-Object {
        $_.CommandLine -like '*${root}*' -and
        ($_.CommandLine -like '*index.js*' -or
         $_.CommandLine -like '*telegram-bot*' -or
         $_.CommandLine -like '*telegram-ai-bot*')
      } |
      ForEach-Object {
        Write-Host "Stop PID $($_.ProcessId)"
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
      }
  `;
  try {
    execSync(`powershell -NoProfile -Command "${cmd}"`, { stdio: 'inherit' });
  } catch {
    /* ignore */
  }
}

async function main() {
  const oldPid = readPid();
  if (oldPid && isRunning(oldPid)) {
    console.log(`Stop PID ${oldPid}...`);
    try {
      process.kill(oldPid, 'SIGTERM');
    } catch {
      /* ignore */
    }
  }

  killWindowsBotProcesses();
  await sleep(1500);
  killWindowsBotProcesses();

  try {
    fs.unlinkSync(PID_FILE);
  } catch {
    /* ignore */
  }

  console.log('\nKlaar. Start opnieuw met: npm start');
}

main();
