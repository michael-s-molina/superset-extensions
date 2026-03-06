import React from 'react';
import { views } from '@apache-superset/core';
import { EstimatorPanel } from './EstimatorPanel';

views.registerView(
  { id: 'query_estimator.main', name: 'Query Estimator' },
  'sqllab.panels',
  () => <EstimatorPanel />,
);
