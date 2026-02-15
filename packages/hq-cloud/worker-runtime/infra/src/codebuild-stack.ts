/**
 * CodeBuild Stack for HQ Cloud container image builds
 *
 * Creates a CodeBuild project that:
 * - Builds both API and session-runtime Docker images
 * - Pushes to ECR with :latest and :git-sha tags
 * - Uses linux/amd64 platform (matching ECS Fargate x86_64)
 * - Can be triggered manually via: aws codebuild start-build --project-name hq-cloud-build-{env}
 *
 * The buildspec is embedded inline in the project. A matching buildspec.yml
 * also exists at packages/hq-cloud/buildspec.yml for reference / local use.
 */

import * as cdk from 'aws-cdk-lib';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface HqCodeBuildStackProps extends cdk.StackProps {
  /**
   * Environment name
   * @default 'dev'
   */
  readonly envName?: string;

  /**
   * The worker-runtime ECR repository to push images to
   */
  readonly workerRuntimeRepository: ecr.IRepository;

  /**
   * The API ECR repository to push images to
   */
  readonly apiRepository: ecr.IRepository;

  /**
   * CodeBuild project name
   * @default 'hq-cloud-build-{envName}'
   */
  readonly projectName?: string;

  /**
   * Build timeout in minutes
   * @default 30
   */
  readonly buildTimeoutMinutes?: number;

  /**
   * Compute type for the build environment
   * @default codebuild.ComputeType.SMALL
   */
  readonly computeType?: codebuild.ComputeType;
}

/**
 * Build the inline buildspec that builds and pushes both Docker images.
 * Mirrors the standalone packages/hq-cloud/buildspec.yml.
 */
function createBuildSpec(): codebuild.BuildSpec {
  return codebuild.BuildSpec.fromObject({
    version: '0.2',
    env: {
      variables: {
        DOCKER_BUILDKIT: '1',
      },
    },
    phases: {
      pre_build: {
        commands: [
          'echo "Logging in to Amazon ECR..."',
          'aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com',
          'COMMIT_SHA=$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -c 1-8)',
          'echo "Build started on $(date)"',
          'echo "Commit SHA = $COMMIT_SHA"',
        ],
      },
      build: {
        commands: [
          // API image
          'echo "Building API image..."',
          'docker build --platform linux/amd64 -t $API_REPO_URI:latest -f packages/hq-cloud/api/Dockerfile packages/hq-cloud/',
          'docker tag $API_REPO_URI:latest $API_REPO_URI:$COMMIT_SHA',
          // Session-runtime image
          'echo "Building session-runtime image..."',
          'docker build --platform linux/amd64 -t $WORKER_RUNTIME_REPO_URI:latest -f packages/hq-cloud/worker-runtime/Dockerfile.session packages/hq-cloud/worker-runtime/',
          'docker tag $WORKER_RUNTIME_REPO_URI:latest $WORKER_RUNTIME_REPO_URI:$COMMIT_SHA',
        ],
      },
      post_build: {
        commands: [
          // Push API image
          'echo "Pushing API image..."',
          'docker push $API_REPO_URI:latest',
          'docker push $API_REPO_URI:$COMMIT_SHA',
          // Push session-runtime image
          'echo "Pushing session-runtime image..."',
          'docker push $WORKER_RUNTIME_REPO_URI:latest',
          'docker push $WORKER_RUNTIME_REPO_URI:$COMMIT_SHA',
          'echo "Build completed on $(date)"',
        ],
      },
    },
  });
}

export class HqCodeBuildStack extends cdk.Stack {
  /**
   * The CodeBuild project
   */
  public readonly project: codebuild.Project;

  constructor(scope: Construct, id: string, props: HqCodeBuildStackProps) {
    super(scope, id, props);

    const envName = props.envName ?? 'dev';
    const projectName = props.projectName ?? `hq-cloud-build-${envName}`;
    const buildTimeoutMinutes = props.buildTimeoutMinutes ?? 30;
    const computeType = props.computeType ?? codebuild.ComputeType.SMALL;

    // CodeBuild project — source is uploaded at build time (S3/GitHub),
    // so we use NO_SOURCE with an inline buildspec.
    this.project = new codebuild.Project(this, 'BuildProject', {
      projectName,
      description: 'Builds HQ Cloud API and session-runtime Docker images',
      environment: {
        buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_5,
        computeType,
        privileged: true, // Required for Docker builds
        environmentVariables: {
          AWS_ACCOUNT_ID: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: cdk.Aws.ACCOUNT_ID,
          },
          AWS_DEFAULT_REGION: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: cdk.Aws.REGION,
          },
          API_REPO_URI: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: props.apiRepository.repositoryUri,
          },
          WORKER_RUNTIME_REPO_URI: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: props.workerRuntimeRepository.repositoryUri,
          },
        },
      },
      buildSpec: createBuildSpec(),
      timeout: cdk.Duration.minutes(buildTimeoutMinutes),
    });

    // Grant ECR push permissions
    props.apiRepository.grantPullPush(this.project);
    props.workerRuntimeRepository.grantPullPush(this.project);

    // Grant ECR login (GetAuthorizationToken)
    this.project.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['ecr:GetAuthorizationToken'],
        resources: ['*'],
      })
    );

    // Outputs
    new cdk.CfnOutput(this, 'ProjectName', {
      value: this.project.projectName,
      description: 'CodeBuild project name',
      exportName: `HqCloudCodeBuildProject-${envName}`,
    });

    new cdk.CfnOutput(this, 'ProjectArn', {
      value: this.project.projectArn,
      description: 'CodeBuild project ARN',
      exportName: `HqCloudCodeBuildProjectArn-${envName}`,
    });
  }
}
