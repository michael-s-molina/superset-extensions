import React from "react";
import { views } from "@apache-superset/core";
import QueryStatementsPanel from "./QueryStatementsPanel";

views.registerView(
  { id: "query_statements.main", name: "Statements" },
  "sqllab.panels",
  () => <QueryStatementsPanel />,
);
