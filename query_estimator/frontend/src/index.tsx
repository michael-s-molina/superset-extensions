import React from 'react';
import { core } from '@apache-superset/core';
import { EstimatorPanel } from './EstimatorPanel';

export const activate = (context: core.ExtensionContext) => {
  console.log('[Query Estimator] Activating...');

  context.disposables.push(
    core.registerViewProvider('query_estimator.main', () => <EstimatorPanel />),
  );

  console.log('[Query Estimator] Activated successfully');
};

export const deactivate = () => {
  console.log('[Query Estimator] Deactivating...');
};
