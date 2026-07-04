const urls = process.argv.slice(2);
const timeoutMs = Number(process.env.WAIT_HTTP_TIMEOUT_MS || 90000);
const intervalMs = Number(process.env.WAIT_HTTP_INTERVAL_MS || 2000);
const startedAt = Date.now();

if (!urls.length) {
  console.error('Usage: node scripts/wait-http.js <url> [url...]');
  process.exit(1);
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function isReady(url) {
  try {
    const response = await fetch(url, { method: 'GET' });
    return response.status >= 200 && response.status < 500;
  } catch {
    return false;
  }
}

async function main() {
  const pending = new Set(urls);

  while (pending.size) {
    for (const url of [...pending]) {
      if (await isReady(url)) {
        console.log(`Ready: ${url}`);
        pending.delete(url);
      }
    }

    if (!pending.size) return;
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`Timed out waiting for: ${[...pending].join(', ')}`);
    }

    await wait(intervalMs);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
