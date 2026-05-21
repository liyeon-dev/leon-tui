import React, { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";

export type MenuItem<T = string> = {
  key: T;
  label: string;
  hint?: string;
  disabled?: boolean;
};

type Props<T> = {
  items: MenuItem<T>[];
  onSelect: (key: T) => void;
  onCancel?: () => void;
  active?: boolean;          // disable input when false
  initialIndex?: number;
};

export function Menu<T extends string | number>({
  items,
  onSelect,
  onCancel,
  active = true,
  initialIndex = 0,
}: Props<T>) {
  const [cursor, setCursor] = useState(initialIndex);

  useEffect(() => {
    if (cursor > items.length - 1) setCursor(Math.max(0, items.length - 1));
  }, [items.length]);

  useInput((input, key) => {
    if (!active || items.length === 0) return;
    if (key.upArrow || input === "k") {
      setCursor((c) => {
        let n = c;
        for (let i = 0; i < items.length; i++) {
          n = (n - 1 + items.length) % items.length;
          if (!items[n]?.disabled) return n;
        }
        return c;
      });
    } else if (key.downArrow || input === "j") {
      setCursor((c) => {
        let n = c;
        for (let i = 0; i < items.length; i++) {
          n = (n + 1) % items.length;
          if (!items[n]?.disabled) return n;
        }
        return c;
      });
    } else if (key.return) {
      const item = items[cursor];
      if (item && !item.disabled) onSelect(item.key);
    } else if (key.escape && onCancel) {
      onCancel();
    }
  });

  return (
    <Box flexDirection="column">
      {items.map((it, i) => {
        const isActive = i === cursor;
        const labelColor = it.disabled ? "gray" : isActive ? "green" : "white";
        return (
          <Box key={String(it.key)} flexDirection="column">
            <Text color={labelColor} bold={isActive}>
              {isActive ? "▶ " : "  "}
              {it.label}
            </Text>
            {it.hint && (
              <Text color="gray" dimColor>
                {"    "}{it.hint}
              </Text>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
