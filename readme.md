cd /v3/notification-service
docker build -t notification-service:local .
docker save notification-service:local | sudo k3s ctr images import -

kubectl apply -f /v3/k8s/notification-service-config.yaml
kubectl apply -f /v3/k8s/notification-service-service.yaml
kubectl apply -f /v3/k8s/notification-service-deployment.yaml

kubectl rollout restart deployment notification-service -n default
