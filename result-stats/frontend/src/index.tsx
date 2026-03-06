import React from 'react';
import { views } from '@apache-superset/core';
import Main from './Main';

views.registerView(
  { id: 'result_stats.main', name: 'Result Stats' },
  'sqllab.panels',
  () => <Main />,
);
