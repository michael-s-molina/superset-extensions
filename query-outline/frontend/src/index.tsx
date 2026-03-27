import React from "react";
import { views } from "@apache-superset/core";
import OutlinePanel from "./OutlinePanel";

views.registerView(
  { id: "query_outline.main", name: "Outline" },
  "sqllab.panels",
  () => <OutlinePanel />,
);
