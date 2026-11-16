"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

const WITH_TABLES = [remarkGfm, remarkMath];
const MATH_ONLY = [remarkMath];
const KATEX = [rehypeKatex];

// remark-math only knows $...$ and $$...$$; the AP question bank also writes math as \( ... \) and \[ ... \]
const tex = (s: string) => s.replace(/&\s*for\s+/g, "&\\text{for } ").replace(/\\\[([\s\S]+?)\\\]/g, (_, m) => `$$${m}$$`).replace(/\\\(([\s\S]+?)\\\)/g, (_, m) => `$${m}$`);

// Md: markdown + KaTeX in the exam-style wrapper; MdMath: math only, no wrapper (answer-choice text)
export const Md = ({ children }: { children: string }) => (
  <div className="exam-serif ib-md"><ReactMarkdown remarkPlugins={WITH_TABLES} rehypePlugins={KATEX}>{tex(children)}</ReactMarkdown></div>
);
export const MdMath = ({ children }: { children: string }) => <ReactMarkdown remarkPlugins={MATH_ONLY} rehypePlugins={KATEX}>{tex(children)}</ReactMarkdown>;
