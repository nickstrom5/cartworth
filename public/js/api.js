// Thin API client.

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export async function api(path, { method = 'GET', body, signal, headers } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      signal,
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : null), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError('Can’t reach Cartworth right now. Check your connection and try again.', 0);
  }
  let data = null;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text };
  }
  if (!res.ok) throw new ApiError(data?.error || `Request failed (${res.status})`, res.status);
  return data;
}

/**
 * Streaming search. Calls handlers as each store answers.
 *
 * This reads the server-sent-event stream with fetch() rather than EventSource. EventSource cannot
 * set request headers, and the visitor's Kroger client secret travels in one: a secret does not
 * belong in a query string, where it would be written into access logs, proxy logs and browser
 * history. Same endpoint, same event names — only the transport differs.
 *
 * Returns a function that cancels the stream.
 */
export function searchStream(path, { headers, onStart, onStore, onAds, onDone, onError } = {}) {
  const ctrl = new AbortController();
  let finished = false;
  const close = () => {
    finished = true;
    ctrl.abort();
  };
  const handlers = { start: onStart, store: onStore, ads: onAds, done: onDone };

  (async () => {
    let res;
    try {
      res = await fetch(path, { headers: { accept: 'text/event-stream', ...headers }, signal: ctrl.signal });
    } catch (err) {
      if (finished || err.name === 'AbortError') return;
      onError?.(new Error('Can’t reach Cartworth right now. Check your connection and try again.'));
      return;
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let msg = `The search failed (${res.status}).`;
      try {
        msg = JSON.parse(text)?.error || msg;
      } catch {
        /* not JSON */
      }
      if (!finished) onError?.(new Error(msg));
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      onError?.(new Error('Your browser could not read the search stream.'));
      return;
    }
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // SSE frames are separated by a blank line
        let cut;
        while ((cut = buffer.indexOf('\n\n')) >= 0) {
          const frame = buffer.slice(0, cut);
          buffer = buffer.slice(cut + 2);
          let event = 'message';
          const dataLines = [];
          for (const line of frame.split('\n')) {
            if (line.startsWith('event:')) event = line.slice(6).trim();
            else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
          }
          if (!dataLines.length) continue;
          let payload;
          try {
            payload = JSON.parse(dataLines.join('\n'));
          } catch {
            continue;
          }
          if (event === 'done') {
            finished = true;
            handlers.done?.(payload);
          } else {
            handlers[event]?.(payload);
          }
        }
      }
      if (!finished) onError?.(new Error('The search was interrupted — try again.'));
    } catch (err) {
      if (finished || err.name === 'AbortError') return;
      onError?.(new Error('The search was interrupted — try again.'));
    } finally {
      finished = true;
      try {
        reader.cancel();
      } catch {
        /* already closed */
      }
    }
  })();

  return close;
}
