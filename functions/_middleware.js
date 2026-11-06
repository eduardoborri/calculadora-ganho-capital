// Cloudflare Pages: asks for a shared user name and password before serving
// any page. Both come from environment variables set in the Cloudflare
// dashboard (Settings → Variables and Secrets): SITE_USER (case-insensitive)
// and SITE_PASSWORD. Without SITE_PASSWORD the site stays closed; without
// SITE_USER any user name is accepted.
export async function onRequest({ request, env, next }) {
  const expected = env.SITE_PASSWORD;
  if (!expected) {
    return new Response("Acesso não configurado: defina SITE_PASSWORD na Cloudflare.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const header = request.headers.get("Authorization") || "";
  if (header.startsWith("Basic ")) {
    try {
      const decoded = new TextDecoder().decode(Uint8Array.from(atob(header.slice(6)), (c) => c.charCodeAt(0)));
      const separator = decoded.indexOf(":");
      const user = decoded.slice(0, separator).trim().toLowerCase();
      const password = decoded.slice(separator + 1);
      const expectedUser = (env.SITE_USER || "").trim().toLowerCase();
      const userOk = !expectedUser || (await sameText(user, expectedUser));
      if ((await sameText(password, expected)) && userOk) return next();
    } catch {
      // Malformed header: fall through to the password prompt.
    }
  }

  return new Response("Acesso restrito à equipe do Gaia Silva Gaede Advogados.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Calculadora Ganho de Capital", charset="UTF-8"',
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

// Compares SHA-256 digests so the time taken doesn't depend on how much of
// the password matches.
async function sameText(a, b) {
  const digest = async (text) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  const [x, y] = await Promise.all([digest(a), digest(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
