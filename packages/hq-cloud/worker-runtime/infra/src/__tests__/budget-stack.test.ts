/**
 * Tests for Budget Stack
 */

import { describe, it, expect } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { HqBudgetStack } from '../budget-stack.js';

describe('HqBudgetStack', () => {
  it('creates budget with $100 limit', () => {
    const app = new cdk.App();
    const stack = new HqBudgetStack(app, 'TestBudget');
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::Budgets::Budget', {
      Budget: Match.objectLike({
        BudgetName: 'hq-cloud-monthly',
        BudgetType: 'COST',
        TimeUnit: 'MONTHLY',
        BudgetLimit: {
          Amount: 100,
          Unit: 'USD',
        },
      }),
    });
  });

  it('creates budget with custom limit', () => {
    const app = new cdk.App();
    const stack = new HqBudgetStack(app, 'TestBudget', {
      monthlyBudgetUsd: 50,
    });
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::Budgets::Budget', {
      Budget: Match.objectLike({
        BudgetLimit: {
          Amount: 50,
          Unit: 'USD',
        },
      }),
    });
  });

  it('has cost filter for hq-cloud project tag', () => {
    const app = new cdk.App();
    const stack = new HqBudgetStack(app, 'TestBudget');
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::Budgets::Budget', {
      Budget: Match.objectLike({
        CostFilters: {
          TagKeyValue: ['user:project$hq-cloud'],
        },
      }),
    });
  });

  it('creates notifications at 80% and 100%', () => {
    const app = new cdk.App();
    const stack = new HqBudgetStack(app, 'TestBudget');
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::Budgets::Budget', {
      NotificationsWithSubscribers: Match.arrayWith([
        Match.objectLike({
          Notification: Match.objectLike({
            Threshold: 80,
            ComparisonOperator: 'GREATER_THAN',
            NotificationType: 'ACTUAL',
          }),
        }),
        Match.objectLike({
          Notification: Match.objectLike({
            Threshold: 100,
            ComparisonOperator: 'GREATER_THAN',
            NotificationType: 'ACTUAL',
          }),
        }),
      ]),
    });
  });
});
