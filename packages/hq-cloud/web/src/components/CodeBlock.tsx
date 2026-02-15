"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { Prism } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

interface CodeBlockProps {
  language?: string;
  showLineNumbers?: boolean;
  children: string;
}

const SHL = Prism as any;
const style = oneDark as any;

export function CodeBlock({ language, showLineNumbers, children }: CodeBlockProps): any {
  return (
    <SHL
      language={language}
      style={style}
      showLineNumbers={showLineNumbers}
      customStyle={{
        background: "transparent",
        padding: 0,
        margin: 0,
        fontSize: "13px",
        lineHeight: "18px",
      }}
    >
      {children}
    </SHL>
  );
}
