pipeline {

  agent any

  environment {
    AWS_REGION    = 'ap-south-1'
    ECR_REGISTRY  = '159018386413.dkr.ecr.ap-south-1.amazonaws.com'
    ECR_REPO      = 'chatbot-backend'

    EKS_CLUSTER   = 'chatbot-prod'
    K8S_NAMESPACE = 'chatbot'

    IMAGE_TAG     = "${env.GIT_COMMIT.take(12)}"
    IMAGE_URI     = "${ECR_REGISTRY}/${ECR_REPO}:${IMAGE_TAG}"
  }

  options {
    timeout(time: 45, unit: 'MINUTES')
    buildDiscarder(logRotator(numToKeepStr: '20'))
  }

  stages {

    ######################################################################
    # CHECKOUT
    ######################################################################
    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    ######################################################################
    # VERIFY
    ######################################################################
    stage('Install & Verify') {
      steps {
        sh 'npm ci'
        sh 'npx prisma generate'
        sh 'npm run lint'
        sh 'npm test'
        sh 'npm run build'
      }
    }

    ######################################################################
    # SECRET SCAN
    ######################################################################
    stage('Secret Scan') {
      steps {
        sh '''
          docker run --rm \
          -v $(pwd):/repo \
          zricethezav/gitleaks:latest detect \
          --source=/repo \
          --verbose
        '''
      }
    }

    ######################################################################
    # FILESYSTEM SCAN
    ######################################################################
    stage('Dependency Scan') {
      steps {
        sh '''
          docker run --rm \
          -v $(pwd):/project \
          aquasec/trivy fs \
          --severity HIGH,CRITICAL \
          /project
        '''
      }
    }

    ######################################################################
    # BUILD IMAGE
    ######################################################################
    stage('Build Docker Image') {
      steps {
        sh '''
          docker build \
            -t "$IMAGE_URI" \
            .
        '''
      }
    }

    ######################################################################
    # IMAGE SCAN
    ######################################################################
    stage('Image Scan') {
      steps {
        sh '''
          docker run --rm \
          -v /var/run/docker.sock:/var/run/docker.sock \
          aquasec/trivy image \
          --severity HIGH,CRITICAL \
          "$IMAGE_URI"
        '''
      }
    }

    ######################################################################
    # LOGIN TO ECR
    ######################################################################
    stage('Login ECR') {
      steps {
        sh '''
          aws ecr get-login-password \
            --region "$AWS_REGION" \
          | docker login \
            --username AWS \
            --password-stdin "$ECR_REGISTRY"
        '''
      }
    }

    ######################################################################
    # PUSH IMAGE
    ######################################################################
    stage('Push Image') {
      steps {
        sh '''
          docker push "$IMAGE_URI"

          docker tag \
            "$IMAGE_URI" \
            "$ECR_REGISTRY/$ECR_REPO:latest"

          docker push \
            "$ECR_REGISTRY/$ECR_REPO:latest"
        '''
      }
    }

    ######################################################################
    # MIGRATIONS
    #
    # Runs Prisma migrations ONCE before deployment.
    ######################################################################
    stage('Run Database Migrations') {
      when {
        branch 'main'
      }

      steps {
        sh '''
          aws eks update-kubeconfig \
            --name "$EKS_CLUSTER" \
            --region "$AWS_REGION"

          kubectl -n "$K8S_NAMESPACE" apply \
            -f deploy/k8s/migration-job.yaml

          kubectl -n "$K8S_NAMESPACE" wait \
            --for=condition=complete \
            job/chatbot-migration \
            --timeout=300s
        '''
      }
    }

    ######################################################################
    # DEPLOY
    ######################################################################
    stage('Deploy to EKS') {

      when {
        branch 'main'
      }

      steps {

        sh '''
          aws eks update-kubeconfig \
            --name "$EKS_CLUSTER" \
            --region "$AWS_REGION"

          kubectl -n "$K8S_NAMESPACE" apply \
            -f deploy/k8s/configmap.yaml

          kubectl -n "$K8S_NAMESPACE" apply \
            -f deploy/k8s/service.yaml

          kubectl -n "$K8S_NAMESPACE" apply \
            -f deploy/k8s/ingress.yaml

          kubectl -n "$K8S_NAMESPACE" apply \
            -f deploy/k8s/hpa.yaml

          kubectl -n "$K8S_NAMESPACE" apply \
            -f deploy/k8s/deployment.yaml

          kubectl -n "$K8S_NAMESPACE" set image \
            deployment/chatbot-backend \
            chatbot-backend="$IMAGE_URI"

          kubectl -n "$K8S_NAMESPACE" rollout status \
            deployment/chatbot-backend \
            --timeout=300s
        '''
      }
    }

    ######################################################################
    # SMOKE TEST
    ######################################################################
    stage('Smoke Test') {

      when {
        branch 'main'
      }

      steps {
        sh '''
          echo "Add API smoke tests here"
        '''
      }
    }
  }

  post {

    always {
      sh 'docker image prune -f || true'
    }

    success {
      echo 'Deployment completed successfully.'
    }

    failure {
      echo 'Deployment failed.'

      echo 'Rollback command:'
      echo 'kubectl rollout undo deployment/chatbot-backend -n chatbot'
    }
  }
}