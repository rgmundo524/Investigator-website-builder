type NodeLabel = { label: string; type: string; count: number };
type MeasureText = (text: string) => number;

// Measure with the chart font so wide letters and long unbroken labels obey
// the same limit as ordinary words. Full text remains in the node tooltip.
export function wrapTreeLabel(text: string, width: number, maxLines: number, measure: MeasureText): string[] {
  let remaining = text.trim().replace(/\s+/g, ' ');
  const lines: string[] = [];
  while (remaining && lines.length < maxLines) {
    if (measure(remaining) <= width) { lines.push(remaining); remaining = ''; break; }
    const characters = Array.from(remaining);
    let length = 1;
    while (length < characters.length && measure(characters.slice(0, length + 1).join('')) <= width) length++;
    let line = characters.slice(0, length).join('');
    const space = line.lastIndexOf(' ');
    if (space > 0) line = line.slice(0, space);
    lines.push(line);
    remaining = remaining.slice(line.length).trim();
  }
  if (remaining && lines.length) {
    const last = Array.from(lines.at(-1)!);
    while (last.length && measure(`${last.join('')}…`) > width) last.pop();
    lines[lines.length - 1] = `${last.join('').trimEnd()}…`;
  }
  return lines;
}

export function treeNodeLabel(node: NodeLabel, width: number, maxLines: number, measure: MeasureText): string[] {
  const branch = node.type !== 'case';
  const lines = wrapTreeLabel(node.label, width, maxLines - Number(branch), measure);
  if (branch) lines.push(String(node.count));
  return lines;
}

export function treeLabelWidth(hostWidth: number, maximum: number, minimum: number) {
  return Math.min(maximum, Math.max(minimum, hostWidth * 0.4));
}

// Labels sit below the small circle. Reserve their whole footprint, including
// diagonal corners, instead of allowing text to collide with adjacent nodes.
export function treeNodeFootprint(radius: number, labelWidth: number, labelHeight: number, gap: number, padding: number) {
  return Math.max(radius * 1.1, Math.hypot(labelWidth / 2, radius + gap + labelHeight)) + padding;
}
