import React from "react";
import { chat, theme } from "@apache-superset/core";

const { useTheme } = theme;

export default function ChatTrigger() {
  const t = useTheme();
  return (
    <button
      onClick={() => chat.isOpen() ? chat.close() : chat.open()}
      aria-label="Open chat"
      style={{
        width: 48,
        height: 48,
        borderRadius: "50%",
        backgroundColor: t.colorPrimary,
        border: "none",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: t.boxShadow,
      }}
    >
      <span style={{ color: t.colorTextLightSolid, fontSize: 22 }}>💬</span>
    </button>
  );
}
