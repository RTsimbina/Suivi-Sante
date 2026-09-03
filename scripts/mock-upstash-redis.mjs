/**
 * mock-upstash-redis.mjs — Serveur HTTP simulant l'API REST Upstash Redis.
 *
 * Utilisé UNIQUEMENT par les tests (test-rate-limit.mjs) pour valider le
 * module src/lib/rate-limit.ts sans infrastructure externe. Fidélité :
 *   - Authentification : en-tête "Authorization: Bearer <token>" (401 sinon)
 *   - Requête : POST avec corps JSON = tableau de commandes Redis
 *       ["eval", script, numkeys, ...keys, ...args] | ["incr", k] | ["expire", k, s]
 *       ["get", k] | ["ttl", k] | ["del", k]
 *   - Réponse : 200 {"result": ...} ou {"error": "..."}
 *   - Encodage : si l'en-tête "Upstash-Encoding: base64" est présent, les
 *     valeurs STRING sont renvoyées en base64 (comportement du vrai service) ;
 *     les nombres passent tels quels.
 *   - Sémantique Redis réelle : INCR crée/incrémente, EXPIRE pose une
 *     expiration absolue, TTL (-1 sans TTL, -2 clé absente), DEL, GET.
 *   - Le stockage vit dans CE processus : les "instances" (workers) qui
 *     redémarrent retrouvent donc les compteurs, comme avec un vrai Redis.
 */

import http from "node:http";

function normalizeScript(script) {
  return String(script)
    .replace(/--[^\n]*/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/** Pattern du script Lua canonique INCR+EXPIRE (celui de src/lib/rate-limit.ts). */
const RATE_LIMIT_PATTERN =
  "LOCAL CURRENT = REDIS.CALL('INCR', KEYS[1]) IF CURRENT == 1 THEN " +
  "REDIS.CALL('EXPIRE', KEYS[1], ARGV[1]) END RETURN {CURRENT, REDIS.CALL('TTL', KEYS[1])}";

export function createMockUpstash({ token = "test-token" } = {}) {
  /** key -> { value: string, expireAt: number|null } */
  const store = new Map();
  let requestCount = 0;

  const getEntry = (key) => {
    const entry = store.get(key);
    if (entry && entry.expireAt !== null && Date.now() >= entry.expireAt) {
      store.delete(key);
      return undefined;
    }
    return entry;
  };

  const incr = (key) => {
    const entry = getEntry(key);
    if (!entry) {
      store.set(key, { value: "1", expireAt: null });
      return 1;
    }
    entry.value = String(Number(entry.value) + 1);
    return Number(entry.value);
  };

  const expire = (key, seconds) => {
    const entry = getEntry(key);
    if (!entry) return 0;
    entry.expireAt = Date.now() + Number(seconds) * 1000;
    return 1;
  };

  const ttl = (key) => {
    const entry = getEntry(key);
    if (!entry) return -2;
    if (entry.expireAt === null) return -1;
    return Math.max(0, Math.ceil((entry.expireAt - Date.now()) / 1000));
  };

  function execCommand(cmd) {
    if (!Array.isArray(cmd) || typeof cmd[0] !== "string") {
      throw new Error("mock: requête invalide (tableau de commandes attendu)");
    }
    const [command, ...rest] = cmd;
    switch (command.toLowerCase()) {
      case "eval": {
        const script = rest[0];
        const numKeys = Number(rest[1]);
        const keys = rest.slice(2, 2 + numKeys);
        const args = rest.slice(2 + numKeys);
        if (normalizeScript(script) !== RATE_LIMIT_PATTERN) {
          throw new Error("mock: script EVAL non supporté (pattern INCR+EXPIRE attendu)");
        }
        const key = keys[0];
        const windowSeconds = Number(args[0]);
        const count = incr(key);
        if (count === 1) expire(key, windowSeconds); // EXPIRE posé au 1er incrément uniquement
        return [count, ttl(key)];
      }
      case "incr":
        return incr(rest[0]);
      case "expire":
        return expire(rest[0], rest[1]);
      case "get": {
        const entry = getEntry(rest[0]);
        return entry ? entry.value : null;
      }
      case "ttl":
        return ttl(rest[0]);
      case "del":
        return store.delete(rest[0]) ? 1 : 0;
      default:
        throw new Error(`mock: commande inconnue "${command}"`);
    }
  }

  function encodeResult(value, wantsBase64) {
    if (typeof value === "string") {
      if (!wantsBase64 || value === "OK") return value;
      return Buffer.from(value, "utf8").toString("base64");
    }
    if (Array.isArray(value)) return value.map((v) => encodeResult(v, wantsBase64));
    return value; // number, null, boolean : inchangés
  }

  const server = http.createServer(async (req, res) => {
    requestCount++;
    if (token) {
      const auth = req.headers.authorization || "";
      if (auth !== `Bearer ${token}`) {
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }
    }
    let raw = "";
    for await (const chunk of req) raw += chunk;
    let cmd;
    try {
      cmd = JSON.parse(raw);
    } catch {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON body" }));
      return;
    }
    const wantsBase64 = (req.headers["upstash-encoding"] || "") === "base64";
    const pathname = (req.url || "/").split("?")[0].replace(/\/+$/, "");

    // Le client @upstash/redis v1.36+ utilise l'AUTO-PIPELINING : les commandes
    // partent par lots sur POST {base}/pipeline (corps = tableau de commandes,
    // réponse = tableau d'objets {result, error}). Une commande isolée reste
    // sur POST {base}/ (corps = une commande, réponse = {result, error}).
    const isPipeline = pathname.endsWith("/pipeline") || pathname.endsWith("/multi-exec");
    try {
      if (isPipeline) {
        if (!Array.isArray(cmd)) throw new Error("mock: corps pipeline invalide");
        const results = cmd.map((c) => {
          try {
            return { result: encodeResult(execCommand(c), wantsBase64) };
          } catch (error) {
            return { error: String(error?.message || error) };
          }
        });
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(results));
      } else {
        const result = encodeResult(execCommand(cmd), wantsBase64);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ result }));
      }
    } catch (error) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: String(error?.message || error) }));
    }
  });

  return {
    server,
    store,
    getRequestCount: () => requestCount,
    listen: () =>
      new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
          const port = server.address().port;
          resolve({ port, url: `http://127.0.0.1:${port}` });
        });
      }),
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

// Exécution directe (debug manuel) : node scripts/mock-upstash-redis.mjs [port]
if (process.argv[1] && process.argv[1].endsWith("mock-upstash-redis.mjs")) {
  const mock = createMockUpstash({});
  const port = Number(process.argv[2]) || 0;
  mock.server.listen(port, "127.0.0.1", () => {
    console.log(`[mock-upstash-redis] à l'écoute sur http://127.0.0.1:${mock.server.address().port}`);
  });
}
