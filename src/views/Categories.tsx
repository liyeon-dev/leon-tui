import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { InputBox } from "../components/InputBox.js";
import type { TaskCategory } from "../types.js";

type Props = {
  categories: TaskCategory[];
  onAdd: (name: string) => void;
  onDelete: (name: string) => void;
  onBack: () => void;
};

type Focus = "input" | "list";

export function Categories({ categories, onAdd, onDelete, onBack: _onBack }: Props) {
  const [input, setInput] = useState("");
  const [focus, setFocus] = useState<Focus>("input");
  const [cursor, setCursor] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useInput((ch, key) => {
    if (key.tab) {
      setFocus((f) => (f === "input" ? "list" : "input"));
      setConfirmDelete(null);
      return;
    }
    if (focus !== "list") return;
    if (categories.length === 0) return;
    if (key.upArrow || ch === "k") {
      setCursor((c) => (c - 1 + categories.length) % categories.length);
      setConfirmDelete(null);
    } else if (key.downArrow || ch === "j") {
      setCursor((c) => (c + 1) % categories.length);
      setConfirmDelete(null);
    } else if (ch.toLowerCase() === "d") {
      const cat = categories[cursor];
      if (!cat) return;
      if (confirmDelete === cat.name) {
        onDelete(cat.name);
        setConfirmDelete(null);
        setCursor((c) => Math.max(0, Math.min(c, categories.length - 2)));
      } else {
        setConfirmDelete(cat.name);
      }
    }
  });

  function handleSubmit(v: string) {
    const trimmed = v.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setInput("");
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">▎CATEGORIES</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text color="cyan" bold>Add category</Text>
        <InputBox
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          placeholder="Type a category name and press Enter"
          disabled={focus !== "input"}
          hint={focus === "input" ? "Enter to add · Tab to focus list" : "Tab to focus input"}
        />
      </Box>

      {categories.length === 0 ? (
        <Box marginTop={1}>
          <Text color="gray" dimColor>  No categories yet.</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          {categories.map((c, i) => {
            const active = focus === "list" && i === cursor;
            const color = active ? "green" : "white";
            return (
              <Box key={c.name} flexDirection="column">
                <Text color={color} bold={active}>
                  {active ? "▶ " : "  "}
                  {c.name}
                </Text>
                {confirmDelete === c.name && active && (
                  <Text color="red">    Press 'd' again to confirm delete</Text>
                )}
              </Box>
            );
          })}
        </Box>
      )}

      <Box marginTop={1}>
        <Text color="gray" dimColor>
          Type to add · Tab to focus list · ↑↓ select · d delete (twice) · Esc back
        </Text>
      </Box>
    </Box>
  );
}
