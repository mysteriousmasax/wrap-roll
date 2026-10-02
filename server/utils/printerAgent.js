import db from '../db/database.js';
import { discoverWindowsSerialPorts, printReceipt } from './escposPrinter.js';
import { getOrderById } from './orders.js';

function readSettings() {
  return Object.fromEntries(db.prepare('SELECT key, value FROM settings').all().map(({ key, value }) => [key, value]));
}

async function detectPrinter(settings) {
  if (process.platform !== 'win32') return settings;
  const devices = await discoverWindowsSerialPorts();
  if (settings.printer_path && devices.some((device) => device.port === settings.printer_path)) return settings;
  if (settings.printer_path) {
    db.prepare("UPDATE settings SET value = '' WHERE key = 'printer_path'").run();
    settings = { ...settings, printer_path: '' };
  }
  const namedPrinters = devices.filter((device) => /rom[e]?son|kp\d+|thermal printer/i.test(device.name));
  const bluetoothPorts = devices.filter((device) => /bluetooth/i.test(device.name));
  const candidates = namedPrinters.length ? namedPrinters : bluetoothPorts;
  if (candidates.length !== 1) return settings;

  const device = candidates[0];
  const upsert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  upsert.run('printer_transport', 'serial');
  upsert.run('printer_path', device.port);
  upsert.run('printer_device_name', device.name);
  upsert.run('printer_model', /kp58zj/i.test(device.name) ? 'Romeson KP58ZJ' : (settings.printer_model || 'Romeson KP58ZJ'));
  upsert.run('printer_paper_width_mm', /kp58zj/i.test(device.name) ? '58' : (settings.printer_paper_width_mm || '58'));
  console.log(`Automatically configured thermal printer ${device.name} on ${device.port}`);
  return readSettings();
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function claimLocalJob(branchCode) {
  const now = new Date();
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const staleClaim = new Date(now.getTime() - 2 * 60 * 1000).toISOString();
  return db.transaction(() => {
    db.prepare("UPDATE printer_jobs SET status = 'queued', claimed_agent_id = NULL, claimed_at = NULL WHERE branch_code = ? AND status = 'claimed' AND claimed_agent_id = 'local' AND claimed_at < ?")
      .run(branchCode, staleClaim);
    db.prepare("UPDATE printer_jobs SET status = 'failed', last_error = 'Print job expired after 24 hours offline' WHERE branch_code = ? AND status = 'queued' AND created_at < ?")
      .run(branchCode, cutoff);
    const job = db.prepare("SELECT id, order_id FROM printer_jobs WHERE branch_code = ? AND status = 'queued' ORDER BY id LIMIT 1").get(branchCode);
    if (!job) return null;
    db.prepare("UPDATE printer_jobs SET status = 'claimed', claimed_agent_id = 'local', claimed_at = ?, attempts = attempts + 1 WHERE id = ? AND status = 'queued'")
      .run(now.toISOString(), job.id);
    return job;
  })();
}

async function printLocalJob(job, settings) {
  const jobKey = `local:${job.id}`;
  const alreadyPrinted = db.prepare('SELECT job_key FROM printer_agent_printed_jobs WHERE job_key = ?').get(jobKey);
  if (!alreadyPrinted) {
    await printReceipt(getOrderById(job.order_id), settings);
    db.prepare('INSERT OR IGNORE INTO printer_agent_printed_jobs (job_key, printed_at) VALUES (?, ?)').run(jobKey, new Date().toISOString());
  }
  db.prepare("UPDATE printer_jobs SET status = 'printed', printed_at = ?, last_error = NULL WHERE id = ? AND claimed_agent_id = 'local'")
    .run(new Date().toISOString(), job.id);
}

async function requestJson(url, token, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Printer service returned ${response.status}`);
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

export function startPrinterAgent() {
  let stopped = false;
  let lastDiscoveryAt = 0;

  const poll = async () => {
    while (!stopped) {
      let settings = readSettings();
      if (process.platform === 'win32' && Date.now() - lastDiscoveryAt >= 30000) {
        lastDiscoveryAt = Date.now();
        try {
          settings = await detectPrinter(settings);
        } catch (error) {
          console.error('Printer discovery failed:', error.message);
        }
      }
      if (settings.printer_path) {
        const branchCode = settings.branch_code || 'MAIN';
        const localJob = claimLocalJob(branchCode);
        if (localJob) {
          try {
            await printLocalJob(localJob, {
              ...settings,
              printer_transport: settings.printer_transport || 'serial',
              printer_paper_width_mm: settings.printer_paper_width_mm || '58',
            });
          } catch (error) {
            db.prepare("UPDATE printer_jobs SET status = 'queued', claimed_agent_id = NULL, claimed_at = NULL, last_error = ? WHERE id = ? AND claimed_agent_id = 'local'")
              .run(String(error.message || 'Print failed').slice(0, 500), localJob.id);
            console.error('Local printer could not print an order:', error.message);
            await wait(5000);
          }
          continue;
        }
      }
      const apiUrl = String(settings.printer_agent_api_url || '').replace(/\/+$/, '');
      const token = settings.printer_agent_token || '';
      if (!apiUrl || !token) {
        await wait(5000);
        continue;
      }

      try {
        const result = await requestJson(`${apiUrl}/printer/agent/jobs/next?ready=${Boolean(settings.printer_path)}`, token);
        if (!result.job) {
          await wait(2500);
          continue;
        }

        const jobType = result.job.type || 'order';
        const jobKey = jobType === 'document' ? `${apiUrl}:document:${result.job.id}` : `${apiUrl}:${result.job.id}`;
        const alreadyPrinted = db.prepare('SELECT job_key FROM printer_agent_printed_jobs WHERE job_key = ?').get(jobKey);
        if (alreadyPrinted) {
          await requestJson(`${apiUrl}/printer/agent/jobs/${result.job.id}/result`, token, {
            method: 'POST',
            body: JSON.stringify({ printed: true, jobType }),
          });
          continue;
        }

        const localPrintSettings = readSettings();
        try {
          await printReceipt(result.job.order, {
            ...result.job.settings,
            printer_transport: localPrintSettings.printer_transport || 'serial',
            printer_path: localPrintSettings.printer_path,
            printer_baud_rate: localPrintSettings.printer_baud_rate || '9600',
            printer_paper_width_mm: result.job.settings.printer_paper_width_mm || localPrintSettings.printer_paper_width_mm || '58',
          });
          db.prepare('INSERT OR IGNORE INTO printer_agent_printed_jobs (job_key, printed_at) VALUES (?, ?)').run(jobKey, new Date().toISOString());
          await requestJson(`${apiUrl}/printer/agent/jobs/${result.job.id}/result`, token, {
            method: 'POST',
            body: JSON.stringify({ printed: true, jobType }),
          });
        } catch (error) {
          try {
            await requestJson(`${apiUrl}/printer/agent/jobs/${result.job.id}/result`, token, {
              method: 'POST',
              body: JSON.stringify({ printed: false, error: error.message, jobType }),
            });
          } catch (reportError) {
            console.error('Printer agent could not report its print failure:', reportError.message);
          }
          console.error('Printer agent could not print an order:', error.message);
          await wait(5000);
        }
      } catch (error) {
        console.error('Printer agent connection failed:', error.message);
        await wait(10000);
      }
    }
  };

  poll();
  return () => { stopped = true; };
}
