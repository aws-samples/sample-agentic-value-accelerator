resource "random_password" "minio_root_password" {
  length      = 64
  special     = false
  min_lower   = 1
  min_upper   = 1
  min_numeric = 1
}

resource "helm_release" "minio" {
  name             = "minio"
  repository       = "https://charts.min.io/"
  chart            = "minio"
  namespace        = "langfuse"
  create_namespace = true
  timeout          = 600

  values = [yamlencode({
    mode         = "standalone"
    rootUser     = "minioadmin"
    rootPassword = random_password.minio_root_password.result
    persistence = {
      storageClass = kubernetes_storage_class.gp3.metadata[0].name
      size         = var.minio_storage_size
    }
    resources = {
      requests = {
        cpu    = var.minio_cpu
        memory = var.minio_memory
      }
      limits = {
        cpu    = var.minio_cpu
        memory = var.minio_memory
      }
    }
    buckets = [
      {
        name   = "langfuse"
        policy = "none"
        purge  = false
      }
    ]
  })]

  depends_on = [
    kubernetes_namespace.langfuse,
    kubernetes_storage_class.gp3,
    aws_eks_node_group.langfuse,
    aws_eks_addon.ebs_csi,
  ]
}
