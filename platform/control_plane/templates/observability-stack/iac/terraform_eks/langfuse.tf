locals {
  inbound_cidrs_csv = join(",", var.ingress_inbound_cidrs)
  langfuse_values   = <<EOT
global:
  defaultStorageClass: efs
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
  serviceAccount:
    annotations:
      eks.amazonaws.com/role-arn: ${aws_iam_role.langfuse_irsa.arn}
  # Resource configuration for production workloads
  resources:
    limits:
      cpu: "${var.langfuse_cpu}"
      memory: "${var.langfuse_memory}"
    requests:
      cpu: "${var.langfuse_cpu}"
      memory: "${var.langfuse_memory}"
  # The Web container needs slightly increased initial grace period on Fargate
  web:
    replicas: ${var.langfuse_web_replicas}
    livenessProbe:
      initialDelaySeconds: 120
    readinessProbe:
      initialDelaySeconds: 120
    extraInitContainers:
      - name: wait-for-clickhouse
        image: busybox:1.36
        command: ['sh', '-c', 'echo "Waiting for ClickHouse..."; until nc -z langfuse-clickhouse 8123 2>/dev/null; do echo "ClickHouse not ready, retrying in 5s..."; sleep 5; done; echo "ClickHouse is ready!"']
  worker:
    replicas: ${var.langfuse_worker_replicas}
postgresql:
  deploy: false
  host: ${aws_rds_cluster.postgres.endpoint}:5432
  auth:
    username: langfuse
    database: langfuse
    existingSecret: langfuse
    secretKeys:
      userPasswordKey: postgres-password
clickhouse:
  auth:
    existingSecret: langfuse
    existingSecretKey: clickhouse-password
  replicaCount: ${var.clickhouse_replicas}
  # Resource configuration for ClickHouse containers
  resources:
    limits:
      cpu: "${var.clickhouse_cpu}"
      memory: "${var.clickhouse_memory}"
    requests:
      cpu: "${var.clickhouse_cpu}"
      memory: "${var.clickhouse_memory}"
  # Resource configuration for ClickHouse Keeper
  zookeeper:
    replicaCount: ${var.clickhouse_replicas}
    resources:
      limits:
        cpu: "${var.clickhouse_keeper_cpu}"
        memory: "${var.clickhouse_keeper_memory}"
      requests:
        cpu: "${var.clickhouse_keeper_cpu}"
        memory: "${var.clickhouse_keeper_memory}"
redis:
  deploy: false
  host: ${aws_elasticache_replication_group.redis.primary_endpoint_address}
  auth:
    existingSecret: langfuse
    existingSecretPasswordKey: redis-password
  tls:
    enabled: true
s3:
  deploy: false
  bucket: ${aws_s3_bucket.langfuse.id}
  region: ${data.aws_region.current.id}
  forcePathStyle: false
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

  # We could also consider excluding the following tables on opt-out:
  # <query_log remove="1"/>
  # <processors_profile_log remove="1"/>
  # <part_log remove="1"/>
  # <query_views_log remove="1"/>
  # <asynchronous_insert_log remove="1"/>
  # <query_metric_log remove="1"/>
  # <error_log remove="1"/>
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
  # Should be at least 256 bits (32 bytes): https://langfuse.com/self-hosting/configuration#core-infrastructure-settings ~> SALT
  length = 32
}

resource "random_bytes" "nextauth_secret" {
  # Should be at least 256 bits (32 bytes): https://langfuse.com/self-hosting/configuration#core-infrastructure-settings ~> NEXTAUTH_SECRET
  length = 32
}

resource "random_bytes" "encryption_key" {
  count = var.use_encryption_key ? 1 : 0
  # Must be exactly 256 bits (32 bytes): https://langfuse.com/self-hosting/configuration#core-infrastructure-settings ~> ENCRYPTION_KEY
  length = 32
}

resource "kubernetes_secret" "langfuse" {
  metadata {
    name      = "langfuse"
    namespace = "langfuse"
  }

  data = {
    "redis-password"      = random_password.redis_password.result
    "postgres-password"   = random_password.postgres_password.result
    "salt"                = random_bytes.salt.base64
    "nextauth-secret"     = random_bytes.nextauth_secret.base64
    "clickhouse-password" = random_password.clickhouse_password.result
    "encryption_key"      = var.use_encryption_key ? random_bytes.encryption_key[0].hex : ""
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
    local.additional_env_values,
    local.clickhouse_overwrite_values,
  ])

  depends_on = [
    aws_iam_role.langfuse_irsa,
    aws_iam_role_policy.langfuse_s3_access,
    aws_eks_fargate_profile.namespaces,
    kubernetes_persistent_volume.clickhouse_data,
    kubernetes_persistent_volume.clickhouse_zookeeper,
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
