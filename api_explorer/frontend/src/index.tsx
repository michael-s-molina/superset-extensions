import React from "react";
import { core, commands, sqlLab } from "@apache-superset/core";
import { APIExplorer, setLastInteraction } from "./APIExplorer";

export const activate = (context: core.ExtensionContext) => {
  console.log("[API Explorer] Activating...");

  // Register the API Explorer panel view
  context.disposables.push(
    core.registerViewProvider("api_explorer.apiExplorer", () => <APIExplorer />)
  );

  // Register API commands
  context.disposables.push(
    commands.registerCommand("api_explorer.getTabs", async () => {
      try {
        const tabs = sqlLab.getTabs();
        setLastInteraction({
          type: "command",
          name: "getTabs",
          timestamp: new Date().toISOString(),
          result: tabs,
        });
        return tabs;
      } catch (error) {
        setLastInteraction({
          type: "command",
          name: "getTabs",
          timestamp: new Date().toISOString(),
          error: String(error),
        });
        throw error;
      }
    })
  );

  context.disposables.push(
    commands.registerCommand("api_explorer.getCurrentTab", async () => {
      try {
        const tab = sqlLab.getCurrentTab();
        setLastInteraction({
          type: "command",
          name: "getCurrentTab",
          timestamp: new Date().toISOString(),
          result: tab,
        });
        return tab;
      } catch (error) {
        setLastInteraction({
          type: "command",
          name: "getCurrentTab",
          timestamp: new Date().toISOString(),
          error: String(error),
        });
        throw error;
      }
    })
  );

  context.disposables.push(
    commands.registerCommand("api_explorer.getDatabases", async () => {
      try {
        const databases = sqlLab.getDatabases();
        setLastInteraction({
          type: "command",
          name: "getDatabases",
          timestamp: new Date().toISOString(),
          result: databases,
        });
        return databases;
      } catch (error) {
        setLastInteraction({
          type: "command",
          name: "getDatabases",
          timestamp: new Date().toISOString(),
          error: String(error),
        });
        throw error;
      }
    })
  );

  console.log("[API Explorer] Activated successfully");
};

export const deactivate = () => {
  console.log("[API Explorer] Deactivated");
};
