"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownViewProps {
  content: string;
}

const MD = ReactMarkdown as any;

export function MarkdownView({ content }: MarkdownViewProps): any {
  return (
    <MD remarkPlugins={[remarkGfm]}>
      {content}
    </MD>
  );
}
