// Shows a report's Markdown: the subset toMarkdown writes (headings, paragraphs, tables, lists,
// bold, italic, code and images). A package's Markdown is untrusted, so it only ever becomes React
// text and elements, never HTML; links stay text, and an image shows only when it is one of the
// package's own screenshots, so opening a report never loads anything from elsewhere.
import type { ReactNode } from 'react';

export interface MarkdownViewProps {
  markdown: string;
  /** Screenshot path inside the package to its object URL. */
  images: Record<string, string>;
}

const INLINE = /\*\*(.+?)\*\*|_(.+?)_|`([^`]+)`/g;

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const key = out.length;
    if (m[1] !== undefined) out.push(<strong key={key}>{m[1]}</strong>);
    else if (m[2] !== undefined) out.push(<em key={key}>{m[2]}</em>);
    else out.push(<code key={key}>{m[3]}</code>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const IMAGE = /^!\[((?:\\.|[^\]\\])*)\]\(([^)\s]+)\)$/;
const cells = (row: string) => row.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

export function MarkdownView({ markdown, images }: MarkdownViewProps) {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const key = blocks.length;
    if (!line.trim()) {
      i++;
    } else if (/^#{1,3} /.test(line)) {
      const level = line.indexOf(' ');
      const content = inline(line.slice(level + 1));
      blocks.push(level === 1 ? <h1 key={key}>{content}</h1> : level === 2 ? <h2 key={key}>{content}</h2> : <h3 key={key}>{content}</h3>);
      i++;
    } else if (line.startsWith('|') && /^\|[\s:|-]+\|$/.test(lines[i + 1]?.trim() ?? '')) {
      const head = cells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].startsWith('|')) rows.push(cells(lines[i++]));
      blocks.push(
        <div key={key} className="table-scroll">
          <table>
            <thead>
              <tr>{head.map((c, j) => <th key={j}>{inline(c)}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r, j) => (
                <tr key={j}>{r.map((c, k) => <td key={k}>{inline(c)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
    } else if (line.startsWith('- ')) {
      const items: string[] = [];
      while (i < lines.length && lines[i].startsWith('- ')) items.push(lines[i++].slice(2));
      blocks.push(
        <ul key={key}>
          {items.map((t, j) => <li key={j}>{inline(t)}</li>)}
        </ul>,
      );
    } else {
      const image = IMAGE.exec(line.trim());
      if (image) {
        const alt = image[1].replace(/\\(.)/g, '$1');
        const src = images[image[2]];
        blocks.push(src ? <img key={key} className="markdown__shot" src={src} alt={alt} /> : <p key={key} className="muted">{`Image not in this package: ${alt}`}</p>);
      } else {
        blocks.push(<p key={key}>{inline(line)}</p>);
      }
      i++;
    }
  }
  return <div className="markdown">{blocks}</div>;
}
