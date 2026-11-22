// Reads a Server-Sent Events body (from fetch) as { event, data } objects.
// EventSource can't send a POST body or an Authorization header, so the chat uses fetch() and parses
// the stream itself: events are separated by a blank line; "event:" names it, "data:" carries JSON.

function parseEvent(block) {
  let event = 'message';
  const data = [];
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
  }
  if (!data.length) return null;
  try {
    return { event, data: JSON.parse(data.join('\n')) };
  } catch {
    return null; // a malformed event is skipped rather than breaking the whole answer
  }
}

export async function* readSse(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      // Network chunks can split an event (or a multi-byte character) anywhere: buffer until "\n\n"
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n?/g, '\n');
      let end;
      while ((end = buffer.indexOf('\n\n')) !== -1) {
        const parsed = parseEvent(buffer.slice(0, end));
        buffer = buffer.slice(end + 2);
        if (parsed) yield parsed;
      }
    }
    buffer += decoder.decode();
    const last = buffer.trim() && parseEvent(buffer.trim());
    if (last) yield last;
  } finally {
    reader.releaseLock();
  }
}
