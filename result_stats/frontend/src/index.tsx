import React from 'react';
import { core } from '@apache-superset/core';
import Main from './Main';

export const activate = (context: core.ExtensionContext) => {
  context.disposables.push(
    core.registerViewProvider('result_stats.main', () => <Main />),
  );
};

export const deactivate = () => {};
