import { parseMarkdown, splitSections } from '../../../content/markdown.js';
import PageLayout from './PageLayout';

// Renders the inline nodes produced by content/markdown.js
export function Inlines({ nodes }) {
  return nodes.map((node, i) => {
    switch (node.type) {
      case 'strong':
        return <strong key={i}><Inlines nodes={node.children} /></strong>;
      case 'link':
        return <a key={i} href={node.href}><Inlines nodes={node.children} /></a>;
      case 'break':
        return <br key={i} />;
      default:
        return node.value;
    }
  });
}

function Block({ block }) {
  switch (block.type) {
    case 'paragraph':
      return <p><Inlines nodes={block.inlines} /></p>;
    case 'list': {
      const List = block.ordered ? 'ol' : 'ul';
      return <List>{block.items.map((item, i) => <li key={i}><Inlines nodes={item} /></li>)}</List>;
    }
    case 'table':
      return (
        <table className="policy-table">
          <thead>
            <tr>{block.header.map((cell, i) => <th key={i}><Inlines nodes={cell} /></th>)}</tr>
          </thead>
          <tbody>
            {block.rows.map((row, r) => (
              <tr key={r}>{row.map((cell, c) => <td key={c}><Inlines nodes={cell} /></td>)}</tr>
            ))}
          </tbody>
        </table>
      );
    case 'heading':
      return <h4>{block.text}</h4>;
    default:
      return null;
  }
}

// A policy page (privacy, terms, refund) rendered from a Markdown file in content/:
// front matter gives the title and "Last updated" date, and each "##" heading becomes a section.
export default function PolicyDocument({ source }) {
  const { meta, blocks } = parseMarkdown(source);
  const sections = splitSections(blocks, 2).filter((s) => s.title);

  return (
    <PageLayout title={meta.title} className="policy-page">
      {meta.updated && <p className="policy-updated">Last updated: {meta.updated}</p>}

      {sections.map((section) => (
        <div key={section.title} className="policy-section">
          <h3>{section.title}</h3>
          {section.blocks.map((block, i) => <Block key={i} block={block} />)}
        </div>
      ))}
    </PageLayout>
  );
}
