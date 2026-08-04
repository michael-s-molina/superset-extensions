import React from "react";
import { chat } from "@apache-superset/core";
import ChatTrigger from "./ChatTrigger";
import ChatPanel from "./ChatPanel";

chat.registerChat(
  { id: "michael-s-molina.chat", name: "Chat" },
  () => <ChatTrigger />,
  () => <ChatPanel />,
);
