// Controle do navegador pelo Chrome DevTools Protocol, sem dependências: abre uma aba, navega, executa scripts e espera condições.
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function connect(port) {
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve) => ws.addEventListener("open", resolve, { once: true }));
  let id = 0;
  const pending = new Map();
  const listeners = [];
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    } else listeners.forEach((fn) => fn(msg));
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const n = ++id;
      pending.set(n, (msg) => (msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)));
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  const evaluate = async (expression) =>
    (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result.value;
  const navigate = async (url) => {
    const loaded = new Promise((resolve) => listeners.push((msg) => msg.method === "Page.loadEventFired" && resolve()));
    await send("Page.navigate", { url });
    await loaded;
    await sleep(2500);
  };
  // `expression` pode devolver um elemento: só o valor booleano volta do navegador.
  const waitFor = async (expression, ms = 30000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (await evaluate(`!!(${expression})`)) return true;
      await sleep(400);
    }
    return false;
  };
  const text = (selector) => evaluate(`(document.querySelector(${JSON.stringify(selector)})?.innerText ?? "")`);
  const click = (label, scope = "document") =>
    evaluate(
      `(() => { const el = [...${scope}.querySelectorAll("button, a")].find((b) => b.textContent.trim().startsWith(${JSON.stringify(label)}) && !b.disabled); if (!el) return false; el.click(); return true; })()`,
    );
  const setValue = (selector, value) =>
    evaluate(
      `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value").set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true })); return true; })()`,
    );
  const setFile = async (selector, file) => {
    const { root } = await send("DOM.getDocument", { depth: 0 });
    const { nodeId } = await send("DOM.querySelector", { nodeId: root.nodeId, selector });
    if (!nodeId) return false;
    await send("DOM.setFileInputFiles", { nodeId, files: [file] });
    return true;
  };
  await send("Page.enable");
  await send("DOM.enable");
  await send("Network.enable");
  return { send, evaluate, navigate, waitFor, text, click, setValue, setFile, sleep, close: () => ws.close() };
}

/** Entra com e-mail e senha pela própria API de login do app (o cookie fica no navegador). */
export async function login(page, base, email, password) {
  await page.send("Network.clearBrowserCookies");
  await page.navigate(`${base}/login`);
  return page.evaluate(
    `fetch("/api/auth/sign-in/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: ${JSON.stringify(email)}, password: ${JSON.stringify(password)} }) }).then((r) => r.status)`,
  );
}

/** Acumula as verificações e imprime OK/FALHA de cada uma. */
export function reporter() {
  const results = [];
  return {
    check(name, ok, detail = "") {
      results.push(ok);
      console.log(`${ok ? "OK   " : "FALHA"} ${name}${detail ? ` — ${String(detail).replace(/\s+/g, " ").slice(0, 160)}` : ""}`);
    },
    failures: () => results.filter((ok) => !ok).length,
    total: () => results.length,
  };
}
