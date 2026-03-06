import React from "react";
import { views, commands, sqlLab } from "@apache-superset/core";
import { APIExplorer, setLastInteraction } from "./APIExplorer";

views.registerView(
  { id: "api_explorer.apiExplorer", name: "API Explorer" },
  "sqllab.rightSidebar",
  () => <APIExplorer />,
);

commands.registerCommand(
  {
    id: "api_explorer.getTabs",
    title: "Get Tabs",
    description: "Retrieve all open SQL Lab tabs",
  },
  async () => {
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
  },
);

commands.registerCommand(
  {
    id: "api_explorer.getCurrentTab",
    title: "Get Current Tab",
    description: "Retrieve the currently active SQL Lab tab",
  },
  async () => {
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
  },
);

commands.registerCommand(
  {
    id: "api_explorer.getDatabases",
    title: "Get Databases",
    description: "Retrieve all available databases",
  },
  async () => {
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
  },
);

commands.registerCommand(
  {
    id: "api_explorer.getActivePanel",
    title: "Get Active Panel",
    description: "Retrieve the currently active panel",
  },
  async () => {
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
  },
);

commands.registerCommand(
  {
    id: "api_explorer.createTab",
    title: "Create Tab",
    description: "Create a new SQL Lab tab",
  },
  async () => {
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
  },
);

commands.registerCommand(
  {
    id: "api_explorer.executeQuery",
    title: "Execute Query",
    description: "Execute the query in the current tab",
  },
  async () => {
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
  },
);
