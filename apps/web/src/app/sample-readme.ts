/** What the app shows of a sample: its title and one sentence about it. */
export interface SampleText {
  title: string;
  description: string;
}

/** Markdown reduced to text: `code` and [links](url) as their words, emphasis marks dropped. */
function plain(markdown: string): string {
  return markdown
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/(\*\*|__|\*|_)(?=\S)(.+?)(?<=\S)\1/g, '$2')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The first sentence of a paragraph: up to the first full stop, question or exclamation mark that is followed by a space. */
function firstSentence(paragraph: string): string {
  const match = /^.*?[.!?](?=\s|$)/s.exec(paragraph);
  return (match ? match[0] : paragraph).trim();
}

/**
 * The title and description of a sample from its `README.md`: the text of its first heading, and the
 * first sentence of the first paragraph after it. Throws when there is no heading or no paragraph,
 * so a README that cannot be shown is found by a test, not by a user.
 */
export function describeSample(readme: string): SampleText {
  const lines = readme.replace(/\r\n/g, '\n').split('\n');
  const heading = lines.findIndex((l) => /^#\s+\S/.test(l));
  if (heading < 0) throw new Error('The README has no heading (# Title).');
  const title = plain(lines[heading]!.replace(/^#\s+/, ''));

  const paragraph: string[] = [];
  for (const line of lines.slice(heading + 1)) {
    if (/^#{1,6}\s/.test(line)) break;
    if (line.trim() === '') {
      if (paragraph.length) break;
      continue;
    }
    // A list, a table, a quote or a code fence is not the paragraph that says what the sample is.
    if (!paragraph.length && /^(\s*([-*+]|\d+\.)\s|\||>|```)/.test(line)) continue;
    paragraph.push(line);
  }
  if (!paragraph.length) throw new Error('The README has no paragraph after its heading.');
  return { title, description: firstSentence(plain(paragraph.join(' '))) };
}
