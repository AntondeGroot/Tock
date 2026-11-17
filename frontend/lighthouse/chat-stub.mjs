// A stand-in for the GameRoom chat server, so the audited board has a working chat as it does in
// production: an empty conversation on the stream, and every message accepted. Listens on
// CHAT_STUB_PORT (default 4100, where the backend looks for the chat server).
import { createServer } from 'node:http';

const PORT = Number(process.env.CHAT_STUB_PORT ?? 4100);
const KEEP_ALIVE_MS = 15_000;

createServer((req, res) => {
  if (req.method === 'GET' && /^\/chat\/[^/]+\/stream$/.test(req.url ?? '')) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
    res.write('data:[]\n\n');
    const keepAlive = setInterval(() => res.write(':ping\n\n'), KEEP_ALIVE_MS);
    req.on('close', () => clearInterval(keepAlive));
    return;
  }
  req.resume(); // a sent message: read it, and say it arrived
  req.on('end', () => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('[]');
  });
}).listen(PORT, () => console.log(`Chat stub on :${PORT}`));
