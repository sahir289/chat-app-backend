// Jenkinsfile — a "Pipeline as Code" definition. Jenkins reads THIS file from
// your repo, so your build process is version-controlled and reviewed like code.
// This is a Declarative Pipeline (the structured, recommended Jenkins syntax).

pipeline {
  // "agent any" = run on any available Jenkins agent (worker). For Docker builds
  // the agent must have Docker + kubectl + aws CLI installed (or use a pod template).
  agent any

  // Values available to every stage. Override IDs/region to match your AWS setup.
  environment {
    AWS_REGION   = 'ap-south-1'
    // ECR is AWS's private Docker registry. Format: <acct>.dkr.ecr.<region>.amazonaws.com/<repo>
    ECR_REGISTRY = '123456789012.dkr.ecr.ap-south-1.amazonaws.com'
    ECR_REPO     = 'chatbot-backend'
    EKS_CLUSTER  = 'chatbot-prod'
    K8S_NAMESPACE = 'chatbot'
    // Tag every image with the git commit SHA → each deploy is uniquely traceable
    // and instantly rollback-able. GIT_COMMIT is injected by Jenkins automatically.
    IMAGE_TAG    = "${env.GIT_COMMIT.take(12)}"
    IMAGE_URI    = "${ECR_REGISTRY}/${ECR_REPO}:${IMAGE_TAG}"
  }

  options {
    // Don't let a hung build run forever; fail after 30 min.
    timeout(time: 30, unit: 'MINUTES')
    // Keep only the last 20 builds to save disk on the Jenkins controller.
    buildDiscarder(logRotator(numToKeepStr: '20'))
  }

  stages {

    // 1) CONTINUOUS INTEGRATION — prove the code is healthy before we package it.
    stage('Checkout') {
      steps {
        // Pull the exact commit that triggered this build.
        checkout scm
      }
    }

    stage('Install & Verify') {
      steps {
        // CI gate: if lint/tests/build fail, the pipeline stops here and NO image
        // is ever produced. This is what "Continuous Integration" actually means.
        sh 'npm ci'
        sh 'npx prisma generate'
        sh 'npm run lint'
        sh 'npm test'
        sh 'npm run build'
      }
    }

    // 2) PACKAGE — turn verified code into an immutable, runnable artifact (image).
    stage('Build & Push Image') {
      steps {
        sh '''
          set -e
          # Authenticate Docker to AWS ECR using the agent's IAM role/credentials.
          aws ecr get-login-password --region "$AWS_REGION" \
            | docker login --username AWS --password-stdin "$ECR_REGISTRY"

          # Build the production image using our multi-stage Dockerfile.
          docker build -t "$IMAGE_URI" .

          # Also tag "latest" for convenience, but DEPLOY by SHA, never "latest".
          docker tag "$IMAGE_URI" "$ECR_REGISTRY/$ECR_REPO:latest"

          # Push both tags to the registry so the cluster can pull them.
          docker push "$IMAGE_URI"
          docker push "$ECR_REGISTRY/$ECR_REPO:latest"
        '''
      }
    }

    // 3) CONTINUOUS DEPLOYMENT — roll the new image onto the cluster safely.
    stage('Deploy to EKS') {
      // Only auto-deploy from main; feature branches just get built/tested.
      when { branch 'main' }
      steps {
        sh '''
          set -e
          # Point kubectl at the EKS cluster (writes ~/.kube/config).
          aws eks update-kubeconfig --name "$EKS_CLUSTER" --region "$AWS_REGION"

          # Apply non-image manifests first (idempotent — safe to re-run).
          kubectl -n "$K8S_NAMESPACE" apply -f deploy/k8s/configmap.yaml
          kubectl -n "$K8S_NAMESPACE" apply -f deploy/k8s/service.yaml
          kubectl -n "$K8S_NAMESPACE" apply -f deploy/k8s/ingress.yaml
          kubectl -n "$K8S_NAMESPACE" apply -f deploy/k8s/hpa.yaml

          # Update ONLY the image on the existing Deployment. This triggers a
          # rolling update: new pods come up healthy before old pods are killed.
          kubectl -n "$K8S_NAMESPACE" set image deployment/chatbot-backend \
            chatbot-backend="$IMAGE_URI"

          # Block until rollout is fully healthy; if it stalls, the build FAILS
          # (and you can run a rollback) instead of silently shipping a bad version.
          kubectl -n "$K8S_NAMESPACE" rollout status deployment/chatbot-backend --timeout=180s
        '''
      }
    }
  }

  post {
    // Runs no matter what — clean local images so the agent's disk doesn't fill.
    always {
      sh 'docker image prune -f || true'
    }
    failure {
      echo "Build failed. Investigate the failing stage above; nothing was deployed unless 'Deploy to EKS' passed."
    }
  }
}
