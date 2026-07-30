function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatInline(text) {
  let html = escapeHtml(text);
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  return html;
}

function renderBlocks(source) {
  const lines = String(source || '')
    .replace(/\r\n/g, '\n')
    .split('\n');
  const blocks = [];
  let paragraph = [];
  let list = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push(`<p>${paragraph.map((line) => formatInline(line)).join('<br />')}</p>`);
    paragraph = [];
  };

  const flushList = () => {
    if (!list?.items.length) return;
    const tag = list.type === 'ol' ? 'ol' : 'ul';
    blocks.push(`<${tag}>${list.items.map((item) => `<li>${formatInline(item)}</li>`).join('')}</${tag}>`);
    list = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    const headingMatch = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (headingMatch) {
      flushParagraph();
      flushList();
      const level = headingMatch[1].length + 1;
      blocks.push(`<h${level}>${formatInline(headingMatch[2])}</h${level}>`);
      continue;
    }

    const unorderedMatch = /^[-*]\s+(.+)$/.exec(trimmed);
    const orderedMatch = /^\d+\.\s+(.+)$/.exec(trimmed);
    if (unorderedMatch || orderedMatch) {
      flushParagraph();
      const type = unorderedMatch ? 'ul' : 'ol';
      const item = unorderedMatch ? unorderedMatch[1] : orderedMatch[1];
      if (!list || list.type !== type) {
        flushList();
        list = { type, items: [] };
      }
      list.items.push(item);
      continue;
    }

    flushList();
    paragraph.push(trimmed);
  }

  flushParagraph();
  flushList();
  return blocks.join('');
}

function MarkdownContent({ content, className = '' }) {
  if (!content?.trim()) {
    return <p className="text-sm text-neutral-400">No content added yet.</p>;
  }

  return (
    <div
      className={[
        'max-w-none text-sm leading-7 text-neutral-700',
        '[&_a]:text-primary-700 [&_a]:underline-offset-2 hover:[&_a]:underline',
        '[&_code]:rounded [&_code]:bg-neutral-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[0.9em]',
        '[&_p]:my-3 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0',
        '[&_h2]:mt-0 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-neutral-900',
        '[&_h3]:mt-0 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-neutral-900',
        '[&_ol]:pl-5 [&_ul]:pl-5 [&_li]:my-1',
        className,
      ].join(' ')}
      dangerouslySetInnerHTML={{ __html: renderBlocks(content) }}
    />
  );
}

export default MarkdownContent;
