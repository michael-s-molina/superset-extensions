import React from 'react';
import { views } from '@apache-superset/core';
import Main from './Main';

views.registerView(
  { id: 'query_insights.main', name: 'Query Insights' },
  'sqllab.panels',
  () => <Main />,
);
