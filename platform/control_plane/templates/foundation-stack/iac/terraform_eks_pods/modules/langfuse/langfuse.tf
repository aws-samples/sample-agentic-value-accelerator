locals {
  inbound_cidrs_csv = join(",", var.ingress_inbound_cidrs)

  # All services run as pods inside EKS — no AWS managed services beyond
  # VPC/EKS/ALB/Route53. PostgreSQL, Redis, ClickHouse, and MinIO (S3-compatible)
  # are all deployed via the Helm chart or separate Helm releases.
  langfuse_values = <<EOT
global:
  defaultStorageClass: gp3
langfuse:
  salt:
    secretKeyRef:
      name: langfuse
      key: salt
  nextauth:
    url: "${var.enable_https ? "https" : "http"}://${local.effective_domain}"
    secret:
      secretKeyRef:
        name: langfuse
        key: nextauth-secret
  resources:
    limits:
      cpu: "${var.langfuse_cpu}"
      memory: "${var.langfuse_memory}"
    requests:
      cpu: "${var.langfuse_cpu}"
      memory: "${var.langfuse_memory}"
  web:
    replicas: ${var.langfuse_web_replicas}
    livenessProbe:
      initialDelaySeconds: 60
    readinessProbe:
      initialDelaySeconds: 60
  worker:
    replicas: ${var.langfuse_worker_replicas}
postgresql:
  deploy: true
  auth:
    username: langfuse
    database: langfuse
    existingSecret: langfuse
    secretKeys:
      userPasswordKey: postgres-password
  primary:
    resources:
      limits:
        cpu: "${var.postgres_cpu}"
        memory: "${var.postgres_memory}"
      requests:
        cpu: "${var.postgres_cpu}"
        memory: "${var.postgres_memory}"
    persistence:
      size: "${var.postgres_storage_size}"
      storageClass: gp3
clickhouse:
  auth:
    existingSecret: langfuse
    existingSecretKey: clickhouse-password
  replicaCount: ${var.clickhouse_replicas}
  resources:
    limits:
      cpu: "${var.clickhouse_cpu}"
      memory: "${var.clickhouse_memory}"
    requests:
      cpu: "${var.clickhouse_cpu}"
      memory: "${var.clickhouse_memory}"
  persistence:
    storageClass: gp3
  zookeeper:
    replicaCount: ${var.clickhouse_replicas}
    resources:
      limits:
        cpu: "${var.clickhouse_keeper_cpu}"
        memory: "${var.clickhouse_keeper_memory}"
      requests:
        cpu: "${var.clickhouse_keeper_cpu}"
        memory: "${var.clickhouse_keeper_memory}"
    persistence:
      storageClass: gp3
redis:
  deploy: true
  auth:
    existingSecret: langfuse
    existingSecretPasswordKey: redis-password
  master:
    resources:
      limits:
        cpu: "${var.redis_cpu}"
        memory: "${var.redis_memory}"
      requests:
        cpu: "${var.redis_cpu}"
        memory: "${var.redis_memory}"
s3:
  deploy: false
  bucket: langfuse
  endpoint: http://minio.langfuse.svc.cluster.local:9000
  accessKeyId:
    value: minioadmin
  secretAccessKey:
    secretKeyRef:
      name: langfuse
      key: minio-root-password
  forcePathStyle: true
  eventUpload:
    prefix: "events/"
  batchExport:
    prefix: "exports/"
  mediaUpload:
    prefix: "media/"
EOT

  additional_env_values = length(var.additional_env) == 0 ? "" : <<EOT
langfuse:
  additionalEnv:
%{for env in var.additional_env~}
    - name: ${env.name}
%{if env.value != null~}
      value: "${env.value}"
%{endif~}
%{if env.valueFrom != null~}
      valueFrom:
%{if env.valueFrom.secretKeyRef != null~}
        secretKeyRef:
          name: ${env.valueFrom.secretKeyRef.name}
          key: ${env.valueFrom.secretKeyRef.key}
%{endif~}
%{if env.valueFrom.configMapKeyRef != null~}
        configMapKeyRef:
          name: ${env.valueFrom.configMapKeyRef.name}
          key: ${env.valueFrom.configMapKeyRef.key}
%{endif~}
%{endif~}
%{endfor~}
EOT

  ingress_values = <<EOT
langfuse:
  ingress:
    enabled: true
    className: alb
    annotations:
      alb.ingress.kubernetes.io/listen-ports: '${var.enable_https ? "[{\"HTTP\":80}, {\"HTTPS\":443}]" : "[{\"HTTP\":80}]"}'
      alb.ingress.kubernetes.io/scheme: ${var.alb_scheme}
      alb.ingress.kubernetes.io/target-type: 'ip'
${var.enable_https ? "      alb.ingress.kubernetes.io/ssl-redirect: '443'" : ""}
      alb.ingress.kubernetes.io/inbound-cidrs: ${local.inbound_cidrs_csv}
    hosts:
    - paths:
      - path: /
        pathType: Prefix
EOT

  encryption_values = var.use_encryption_key == false ? "" : <<EOT
langfuse:
  encryptionKey:
    secretKeyRef:
      name: ${kubernetes_secret.langfuse.metadata[0].name}
      key: encryption_key
EOT

  init_user_values = <<EOT
langfuse:
  additionalEnv:
    - name: LANGFUSE_INIT_USER_EMAIL
      valueFrom:
        secretKeyRef:
          name: langfuse
          key: init-user-email
    - name: LANGFUSE_INIT_USER_PASSWORD
      valueFrom:
        secretKeyRef:
          name: langfuse
          key: init-user-password
    - name: LANGFUSE_INIT_USER_NAME
      value: "admin"
    - name: LANGFUSE_INIT_ORG_NAME
      valueFrom:
        secretKeyRef:
          name: langfuse
          key: init-org-name
    - name: LANGFUSE_INIT_PROJECT_NAME
      value: "Default Project"
    - name: LANGFUSE_INIT_PROJECT_PUBLIC_KEY
      valueFrom:
        secretKeyRef:
          name: langfuse
          key: init-project-public-key
    - name: LANGFUSE_INIT_PROJECT_SECRET_KEY
      valueFrom:
        secretKeyRef:
          name: langfuse
          key: init-project-secret-key
EOT

  clickhouse_overwrite_values = var.enable_clickhouse_log_tables ? "" : <<EOT
clickhouse:
  extraOverrides: |
      <clickhouse>
        <trace_log remove="1"/>
        <text_log remove="1"/>
        <opentelemetry_span_log remove="1"/>
        <asynchronous_metric_log remove="1"/>
        <metric_log remove="1"/>
        <latency_log remove="1"/>
      </clickhouse>
EOT
}

resource "kubernetes_namespace" "langfuse" {
  metadata {
    name = "langfuse"
  }
}

resource "random_bytes" "salt" {
  length = 32
}

resource "random_bytes" "nextauth_secret" {
  length = 32
}

resource "random_bytes" "encryption_key" {
  count  = var.use_encryption_key ? 1 : 0
  length = 32
}

resource "random_password" "postgres_password" {
  length      = 64
  special     = false
  min_lower   = 1
  min_upper   = 1
  min_numeric = 1
}

resource "random_password" "redis_password" {
  length      = 64
  special     = false
  min_lower   = 1
  min_upper   = 1
  min_numeric = 1
}

resource "kubernetes_secret" "langfuse" {
  metadata {
    name      = "langfuse"
    namespace = "langfuse"
  }

  data = {
    "redis-password"              = random_password.redis_password.result
    "postgres-password"           = random_password.postgres_password.result
    "salt"                        = random_bytes.salt.base64
    "nextauth-secret"             = random_bytes.nextauth_secret.base64
    "clickhouse-password"         = random_password.clickhouse_password.result
    "encryption_key"              = var.use_encryption_key ? random_bytes.encryption_key[0].hex : ""
    "minio-root-password"         = random_password.minio_root_password.result
    "init-user-email"             = var.langfuse_init_user_email
    "init-user-password"          = var.langfuse_init_user_password
    "init-org-name"               = var.langfuse_init_org_name
    "init-project-public-key"     = local.langfuse_public_key
    "init-project-secret-key"     = local.langfuse_secret_key
  }
}

resource "helm_release" "langfuse" {
  name             = "langfuse"
  repository       = "https://langfuse.github.io/langfuse-k8s"
  version          = var.langfuse_helm_chart_version
  chart            = "langfuse"
  namespace        = "langfuse"
  create_namespace = true
  timeout          = 900

  values = compact([
    local.langfuse_values,
    local.ingress_values,
    local.encryption_values,
    local.init_user_values,
    local.additional_env_values,
    local.clickhouse_overwrite_values,
  ])

  depends_on = [
    aws_eks_node_group.langfuse,
    helm_release.minio,
    kubernetes_storage_class.gp3,
    aws_eks_addon.ebs_csi,
    helm_release.aws_load_balancer_controller,
    aws_ec2_tag.public_subnet_elb,
  ]
}

# Wait for the ALB to be provisioned and capture its DNS name
resource "null_resource" "wait_for_alb" {
  triggers = {
    langfuse_release = helm_release.langfuse.metadata[0].revision
  }

  provisioner "local-exec" {
    command = <<-EOT
      aws eks update-kubeconfig --name ${aws_eks_cluster.langfuse.name} --region ${data.aws_region.current.id} --kubeconfig /tmp/kubeconfig-${aws_eks_cluster.langfuse.name}
      for i in $(seq 1 30); do
        ADDR=$(kubectl --kubeconfig /tmp/kubeconfig-${aws_eks_cluster.langfuse.name} get ingress langfuse -n langfuse -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null)
        if [ -n "$ADDR" ] && [ "$ADDR" != "" ]; then
          echo "$ADDR" > ${path.module}/alb_dns.txt
          rm -f /tmp/kubeconfig-${aws_eks_cluster.langfuse.name}
          exit 0
        fi
        echo "Waiting for ALB address... (attempt $i/30)"
        sleep 10
      done
      echo "PENDING" > ${path.module}/alb_dns.txt
      rm -f /tmp/kubeconfig-${aws_eks_cluster.langfuse.name}
    EOT
  }

  depends_on = [helm_release.langfuse]
}

data "local_file" "alb_dns" {
  filename   = "${path.module}/alb_dns.txt"
  depends_on = [null_resource.wait_for_alb]
}
