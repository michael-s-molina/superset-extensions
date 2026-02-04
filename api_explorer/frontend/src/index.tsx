import React from "react";
import { core, commands, sqlLab } from "@apache-superset/core";
import { APIExplorer, setLastInteraction } from "./APIExplorer";

export const activate = (context: core.ExtensionContext) => {
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

  context.disposables.push(
    commands.registerCommand("api_explorer.getActivePanel", async () => {
      try {
        const panel = sqlLab.getActivePanel();
        setLastInteraction({
          type: "command",
          name: "getActivePanel",
          timestamp: new Date().toISOString(),
          result: panel,
        });
        return panel;
      } catch (error) {
        setLastInteraction({
          type: "command",
          name: "getActivePanel",
          timestamp: new Date().toISOString(),
          error: String(error),
        });
        throw error;
      }
    })
  );

  context.disposables.push(
    commands.registerCommand("api_explorer.createTab", async () => {
      try {
        const tab = await sqlLab.createTab();
        setLastInteraction({
          type: "command",
          name: "createTab",
          timestamp: new Date().toISOString(),
          result: tab,
        });
        return tab;
      } catch (error) {
        setLastInteraction({
          type: "command",
          name: "createTab",
          timestamp: new Date().toISOString(),
          error: String(error),
        });
        throw error;
      }
    })
  );

  context.disposables.push(
    commands.registerCommand("api_explorer.executeQuery", async () => {
      try {
        const result = await sqlLab.executeQuery();
        setLastInteraction({
          type: "command",
          name: "executeQuery",
          timestamp: new Date().toISOString(),
          result: result,
        });
        return result;
      } catch (error) {
        setLastInteraction({
          type: "command",
          name: "executeQuery",
          timestamp: new Date().toISOString(),
          error: String(error),
        });
        throw error;
      }
    })
  );
};

export const deactivate = () => {};
