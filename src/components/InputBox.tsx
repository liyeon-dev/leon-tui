import React, { useEffect, useState } from "react";
import { Box, Text, useInput, useStdout } from "ink";

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  hint?: string;
};

function cursorRowCol(value: string, cursor: number): { row: number; col: number } {
  const lines = value.split("\n");
  let remaining = cursor;
  for (let i = 0; i < lines.length; i++) {
    const len = lines[i]!.length;
    if (remaining <= len) return { row: i, col: remaining };
    remaining -= len + 1;
  }
  return { row: lines.length - 1, col: lines[lines.length - 1]!.length };
}

function rowColToCursor(value: string, row: number, col: number): number {
  const lines = value.split("\n");
  const r = Math.max(0, Math.min(row, lines.length - 1));
  const c = Math.max(0, Math.min(col, lines[r]!.length));
  let n = 0;
  for (let i = 0; i < r; i++) n += lines[i]!.length + 1;
  return n + c;
}

export function InputBox({ value, onChange, onSubmit, placeholder, label, disabled, hint }: Props) {
  const [cursor, setCursor] = useState(value.length);
  const { stdout } = useStdout();

  useEffect(() => {
    if (cursor > value.length) setCursor(value.length);
  }, [value, cursor]);

  // Enable bracketed paste mode while this input is mounted. Terminals that
  // support it (Windows Terminal, iTerm, wezterm, kitty, modern xterm) will
  // wrap pasted content with \e[200~ ... \e[201~ AND deliver it as a single
  // chunk — which lets the multi-char paste branch below catch it and insert
  // verbatim instead of submitting on each embedded newline.
  useEffect(() => {
    try { stdout.write("\x1b[?2004h"); } catch { /* ignore */ }
    return () => { try { stdout.write("\x1b[?2004l"); } catch { /* ignore */ } };
  }, [stdout]);

  useInput((input, key) => {
    // Paste detection: input chunks longer than one character only.
    // A single "\r" / "\n" is a keypress (Enter / Ctrl+J), NOT a paste.
    if (input.length > 1 && !key.ctrl && !key.meta) {
      const pasted = input
        .replace(/\x1b\[200~/g, "")
        .replace(/\x1b\[201~/g, "")
        .replace(/\r\n?/g, "\n");
      if (pasted.length > 0) {
        const next = value.slice(0, cursor) + pasted + value.slice(cursor);
        onChange(next);
        setCursor(cursor + pasted.length);
        return;
      }
    }

    if (key.return && (key.shift || key.meta)) {
      const next = value.slice(0, cursor) + "\n" + value.slice(cursor);
      onChange(next);
      setCursor(cursor + 1);
      return;
    }

    // Ctrl+J sends a literal "\n" with no key.return — insert as newline.
    if (input === "\n" && !key.return) {
      const next = value.slice(0, cursor) + "\n" + value.slice(cursor);
      onChange(next);
      setCursor(cursor + 1);
      return;
    }

    if (key.return) {
      onSubmit(value);
      return;
    }

    if (key.backspace || key.delete) {
      if (cursor === 0) return;
      const next = value.slice(0, cursor - 1) + value.slice(cursor);
      onChange(next);
      setCursor(cursor - 1);
      return;
    }

    if (key.leftArrow) {
      setCursor(Math.max(0, cursor - 1));
      return;
    }
    if (key.rightArrow) {
      setCursor(Math.min(value.length, cursor + 1));
      return;
    }
    if (key.upArrow) {
      const { row, col } = cursorRowCol(value, cursor);
      if (row > 0) setCursor(rowColToCursor(value, row - 1, col));
      return;
    }
    if (key.downArrow) {
      const { row, col } = cursorRowCol(value, cursor);
      const lines = value.split("\n");
      if (row < lines.length - 1) setCursor(rowColToCursor(value, row + 1, col));
      return;
    }

    if (key.ctrl && input === "a") {
      const { row } = cursorRowCol(value, cursor);
      setCursor(rowColToCursor(value, row, 0));
      return;
    }
    if (key.ctrl && input === "e") {
      const { row } = cursorRowCol(value, cursor);
      const lines = value.split("\n");
      setCursor(rowColToCursor(value, row, lines[row]!.length));
      return;
    }

    if (key.escape || key.tab) return;

    if (input && input.length > 0 && !key.ctrl) {
      const next = value.slice(0, cursor) + input + value.slice(cursor);
      onChange(next);
      setCursor(cursor + input.length);
    }
  }, { isActive: !disabled });

  const lines = value.length === 0 && placeholder ? [placeholder] : value.split("\n");
  const showingPlaceholder = value.length === 0 && Boolean(placeholder);
  const { row: curRow, col: curCol } = cursorRowCol(value, cursor);

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={disabled ? "gray" : "cyan"} paddingX={1}>
      {label && <Text color="cyan" bold>{label}</Text>}
      <Box flexDirection="column">
        {lines.map((line, i) => {
          const isCursorRow = !disabled && !showingPlaceholder && i === curRow;
          const prefix = i === 0 ? "> " : "  ";
          if (!isCursorRow) {
            return (
              <Text key={i} color={showingPlaceholder ? "gray" : undefined} dimColor={showingPlaceholder}>
                {prefix}{line.length === 0 ? " " : line}
              </Text>
            );
          }
          const before = line.slice(0, curCol);
          const at = line.slice(curCol, curCol + 1) || " ";
          const after = line.slice(curCol + 1);
          return (
            <Text key={i}>
              {prefix}{before}<Text inverse>{at}</Text>{after}
            </Text>
          );
        })}
      </Box>
      {hint && <Text color="gray" dimColor>{hint}</Text>}
    </Box>
  );
}
