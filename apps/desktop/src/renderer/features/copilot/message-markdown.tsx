import { useMemo } from "react";
import { type Block, type Inline, parseMarkdown, type TableAlign } from "./markdown.ts";

// A copilot answer written in markdown, drawn with the chat's type scale. Nothing is ever inserted as HTML,
// and links show their address instead of navigating the app window.

const HEADING_CLASS: Readonly<Record<number, string>> = {
  1: "text-headline font-semibold",
  2: "text-headline font-semibold",
  3: "text-body font-semibold",
};

const ALIGN_CLASS: Record<Exclude<TableAlign, null>, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

function InlineView({ nodes }: { nodes: readonly Inline[] }) {
  return nodes.map((node, index) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: parsed parts of one answer never reorder.
    <InlineNode key={index} node={node} />
  ));
}

function InlineNode({ node }: { node: Inline }) {
  switch (node.type) {
    case "text":
      return node.text;
    case "strong":
      return (
        <strong className="font-semibold text-fg">
          <InlineView nodes={node.children} />
        </strong>
      );
    case "em":
      return (
        <em className="italic">
          <InlineView nodes={node.children} />
        </em>
      );
    case "strike":
      return (
        <s className="text-fg-tertiary">
          <InlineView nodes={node.children} />
        </s>
      );
    case "code":
      return <code className="rounded-bar bg-control-raised px-1 py-px font-mono text-mono text-fg">{node.text}</code>;
    case "link":
      return (
        <span title={node.href} className="text-fg underline decoration-line-dashed decoration-1 underline-offset-2">
          <InlineView nodes={node.children} />
        </span>
      );
    case "break":
      return <br />;
  }
}

function BlockView({ block, tight = false }: { block: Block; tight?: boolean }) {
  switch (block.type) {
    case "heading":
      return <Heading level={block.level} nodes={block.children} />;
    case "paragraph":
      return (
        <p className={tight ? "" : "leading-[1.55]"}>
          <InlineView nodes={block.children} />
        </p>
      );
    case "code":
      return (
        <pre
          title={block.lang || undefined}
          className="max-w-full overflow-x-auto rounded-control bg-panel px-3 py-2.5 font-mono text-mono text-fg-secondary"
        >
          <code>{block.text}</code>
        </pre>
      );
    case "list":
      return <ListView block={block} />;
    case "quote":
      return (
        <blockquote className="flex flex-col gap-2 border-l-2 border-line-strong pl-3 text-fg-secondary">
          <Blocks blocks={block.children} />
        </blockquote>
      );
    case "table":
      return <TableView block={block} />;
    case "rule":
      return <hr className="border-line-subtle" />;
  }
}

// Answer headings sit below the panel's own: h3 and down, sized to the chat bubble.
function Heading({ level, nodes }: { level: number; nodes: readonly Inline[] }) {
  const className = HEADING_CLASS[level] ?? "text-body font-semibold";
  const content = <InlineView nodes={nodes} />;
  switch (Math.min(level, 4)) {
    case 1:
      return <h3 className={className}>{content}</h3>;
    case 2:
      return <h4 className={className}>{content}</h4>;
    case 3:
      return <h5 className={className}>{content}</h5>;
    default:
      return <h6 className={className}>{content}</h6>;
  }
}

function ListView({ block }: { block: Extract<Block, { type: "list" }> }) {
  const Tag = block.ordered ? "ol" : "ul";
  return (
    <Tag
      start={block.ordered && block.start !== 1 ? block.start : undefined}
      className={`flex flex-col gap-1 pl-5 ${block.ordered ? "list-decimal" : "list-disc"} marker:text-fg-tertiary`}
    >
      {block.items.map((item, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: parsed items of one answer never reorder.
        <li key={index} className="pl-0.5">
          <div className="flex flex-col gap-1">
            {item.map((child, childIndex) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: parsed blocks of one answer never reorder.
              <BlockView key={childIndex} block={child} tight />
            ))}
          </div>
        </li>
      ))}
    </Tag>
  );
}

function TableView({ block }: { block: Extract<Block, { type: "table" }> }) {
  const alignOf = (column: number) => {
    const align = block.align[column];
    return align ? ALIGN_CLASS[align] : "text-left";
  };
  return (
    <div className="max-w-full overflow-x-auto rounded-control border border-line-subtle">
      <table className="w-full border-collapse text-ui">
        <thead className="bg-fill-ghost">
          <tr>
            {block.head.map((cell, column) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: columns of a parsed table never reorder.
              <th key={column} className={`px-2.5 py-1.5 font-semibold whitespace-nowrap text-fg ${alignOf(column)}`}>
                <InlineView nodes={cell} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, rowIndex) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: rows of a parsed table never reorder.
            <tr key={rowIndex} className="border-t border-line-subtle">
              {row.map((cell, column) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: columns of a parsed table never reorder.
                <td key={column} className={`px-2.5 py-1.5 align-top text-fg-secondary ${alignOf(column)}`}>
                  <InlineView nodes={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Blocks({ blocks }: { blocks: readonly Block[] }) {
  return blocks.map((block, index) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: parsed blocks of one answer never reorder.
    <BlockView key={index} block={block} />
  ));
}

export function MessageMarkdown({ source }: { source: string }) {
  const blocks = useMemo(() => parseMarkdown(source), [source]);
  return (
    <div className="flex min-w-0 flex-col gap-2.5 wrap-break-word">
      <Blocks blocks={blocks} />
    </div>
  );
}
