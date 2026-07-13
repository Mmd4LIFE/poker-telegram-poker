"use client";

/* A tiny LaTeX renderer for the handful of constructs our formulas actually use:
   \frac, \text, \mathrm, \left|…\right|, \sum, \cdot, superscripts.

   KaTeX would be ~300KB of JS to render nine fractions inside a Telegram webview.
   This is a few hundred bytes and produces a real stacked fraction, which is the
   only part that genuinely needs typesetting. */

function Tex({ src }: { src: string }) {
  // \frac{A}{B} -> a stacked fraction; everything else is inline text.
  const frac = src.match(/^(.*?)\\frac\{(.+?)\}\{(.+?)\}(.*)$/s);

  if (frac) {
    const [, before, num, den, after] = frac;
    return (
      <span className="inline-flex items-center gap-1 align-middle">
        {before && <Tex src={before} />}
        <span className="inline-flex flex-col items-center align-middle leading-tight">
          <span className="border-b border-current px-2 pb-0.5">
            <Tex src={num} />
          </span>
          <span className="px-2 pt-0.5">
            <Tex src={den} />
          </span>
        </span>
        {after && <Tex src={after} />}
      </span>
    );
  }

  const plain = src
    .replace(/\\mathrm\{(.+?)\}/g, "$1")
    .replace(/\\text\{(.+?)\}/g, "$1")
    .replace(/\\left\|/g, "|")
    .replace(/\\right\|/g, "|")
    .replace(/\\left\(/g, "(")
    .replace(/\\right\)/g, ")")
    .replace(/\\sum_\{(.+?)\}/g, "Σ($1)")
    .replace(/\\cdot/g, "·")
    .replace(/\\\$/g, "$")
    .replace(/\\ /g, " ")
    .replace(/[{}]/g, "")
    .trim();

  return <span>{plain}</span>;
}

export function Formula({ src }: { src: string }) {
  return (
    <div className="overflow-x-auto rounded-lg bg-black/30 px-3 py-2.5">
      <div className="whitespace-nowrap font-mono text-[11px] text-foreground">
        <Tex src={src} />
      </div>
    </div>
  );
}
