type JsonValueSnapshot = {
  complete: boolean;
  value?: unknown;
  partialString?: string;
};

function skipWhitespace(input: string, index: number) {
  while (/\s/.test(input[index] ?? "")) index++;
  return index;
}

function scanString(input: string, start: number) {
  let escaped = false;
  for (let index = start + 1; index < input.length; index++) {
    const character = input[index];
    if (escaped) escaped = false;
    else if (character === "\\") escaped = true;
    else if (character === '"') return { complete: true, end: index + 1 };
  }
  return { complete: false, end: input.length };
}

function decodePartialString(input: string) {
  let output = "";
  for (let index = 0; index < input.length; index++) {
    const character = input[index];
    if (character === '"') break;
    if (character !== "\\") {
      output += character;
      continue;
    }

    const escaped = input[index + 1];
    if (escaped === undefined) break;
    const simple: Record<string, string> = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };
    if (escaped in simple) {
      output += simple[escaped];
      index++;
    } else if (escaped === "u") {
      const digits = input.slice(index + 2, index + 6);
      if (!/^[\da-f]{4}$/i.test(digits)) break;
      output += String.fromCharCode(parseInt(digits, 16));
      index += 5;
    } else {
      break;
    }
  }
  return output;
}

function scanValue(input: string, start: number) {
  if (input[start] === '"') return scanString(input, start);
  if (input[start] !== "{" && input[start] !== "[") {
    for (let index = start; index < input.length; index++) {
      if (input[index] === "," || input[index] === "}") return { complete: true, end: index };
    }
    return { complete: false, end: input.length };
  }

  const closers = [input[start] === "{" ? "}" : "]"];
  let inString = false;
  let escaped = false;
  for (let index = start + 1; index < input.length; index++) {
    const character = input[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") closers.push("}");
    else if (character === "[") closers.push("]");
    else if (character === "}" || character === "]") {
      if (closers.pop() !== character) return { complete: false, end: input.length };
      if (!closers.length) return { complete: true, end: index + 1 };
    }
  }
  return { complete: false, end: input.length };
}

/** Reads a top-level JSON member from a structured response as it arrives. */
export function readTopLevelJsonField(input: string, field: string): JsonValueSnapshot | null {
  let index = skipWhitespace(input, input.indexOf("{") + 1);
  if (index === 0) return null;

  while (index < input.length) {
    index = skipWhitespace(input, index);
    if (input[index] !== '"') return null;
    const keyEnd = scanString(input, index);
    if (!keyEnd.complete) return null;
    let key: unknown;
    try { key = JSON.parse(input.slice(index, keyEnd.end)); } catch { return null; }
    index = skipWhitespace(input, keyEnd.end);
    if (input[index] !== ":") return null;
    index = skipWhitespace(input, index + 1);

    const valueStart = index;
    const valueEnd = scanValue(input, valueStart);
    if (key === field) {
      if (!valueEnd.complete && input[valueStart] === '"') {
        return { complete: false, partialString: decodePartialString(input.slice(valueStart + 1)) };
      }
      if (!valueEnd.complete) return { complete: false };
      try { return { complete: true, value: JSON.parse(input.slice(valueStart, valueEnd.end)) }; }
      catch { return { complete: false }; }
    }
    if (!valueEnd.complete) return null;
    index = skipWhitespace(input, valueEnd.end);
    if (input[index] === ",") index++;
    else return null;
  }
  return null;
}
