import React from 'react';
import { core } from '@apache-superset/core';
import { EstimatorPanel } from './EstimatorPanel';

export const activate = (context: core.ExtensionContext) => {
  context.disposables.push(
    core.registerViewProvider('query_estimator.main', () => <EstimatorPanel />),
  );
};

export const deactivate = () => {};
