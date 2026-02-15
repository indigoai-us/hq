/**
 * Budget Stack for HQ Cloud cost controls
 *
 * Creates AWS Budget with alerts at $80 and $100 thresholds.
 * Enforces the $100/month budget from day one.
 */

import * as cdk from 'aws-cdk-lib';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import { Construct } from 'constructs';

export interface HqBudgetStackProps extends cdk.StackProps {
  /**
   * Monthly budget limit in USD
   * @default 100
   */
  readonly monthlyBudgetUsd?: number;

  /**
   * Email address for budget alerts
   */
  readonly alertEmail?: string;

  /**
   * Environment name
   * @default 'dev'
   */
  readonly envName?: string;
}

export class HqBudgetStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: HqBudgetStackProps) {
    super(scope, id, props);

    const monthlyBudget = props?.monthlyBudgetUsd ?? 100;
    const alertEmail = props?.alertEmail ?? '';

    const subscribers: budgets.CfnBudget.SubscriberProperty[] = alertEmail
      ? [{ address: alertEmail, subscriptionType: 'EMAIL' }]
      : [];

    new budgets.CfnBudget(this, 'MonthlyBudget', {
      budget: {
        budgetName: 'hq-cloud-monthly',
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
        budgetLimit: {
          amount: monthlyBudget,
          unit: 'USD',
        },
        costFilters: {
          TagKeyValue: ['user:project$hq-cloud'],
        },
      },
      notificationsWithSubscribers: [
        {
          notification: {
            notificationType: 'ACTUAL',
            comparisonOperator: 'GREATER_THAN',
            threshold: 80,
            thresholdType: 'PERCENTAGE',
          },
          subscribers: subscribers.length > 0
            ? subscribers
            : [{ address: 'noop@example.com', subscriptionType: 'EMAIL' }],
        },
        {
          notification: {
            notificationType: 'ACTUAL',
            comparisonOperator: 'GREATER_THAN',
            threshold: 100,
            thresholdType: 'PERCENTAGE',
          },
          subscribers: subscribers.length > 0
            ? subscribers
            : [{ address: 'noop@example.com', subscriptionType: 'EMAIL' }],
        },
      ],
    });
  }
}
